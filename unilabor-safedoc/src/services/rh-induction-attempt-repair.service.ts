import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { withTransaction } from '../utils/transaction';
import { issueCertificateForAssignment } from './certificate-issuance.service';
import { notifyInductionReadingsAssigned } from './rh-induction-notification.service';
import { authorizeInductionRetry } from './rh-induction-retry.service';
import type { InductionRetryResult } from './rh-induction-retry.service';

// -----------------------------------------------------------------------------
// Induccion: reparaciones operativas del intento de evaluacion, antes resueltas
// con scripts SQL en pgAdmin (SCRIPT_PROD_REABRIR_INTENTO_CRONOMETRO_AGOTADO,
// SCRIPT_PROD_REPARAR_EVALUACION_SIN_PREGUNTAS, issue:certificate,
// notify:induction-readings). Ninguna borra evidencia: el intento truncado se
// cierra como 'expired' (no presentado) y se abre uno nuevo.
// -----------------------------------------------------------------------------

const OPEN_STATUSES = ['pending', 'in_progress', 'authorized_late'] as const;

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

interface AttemptContext {
  enrollment_id: number;
  employee_id: number;
  phase_number: number;
  assignment_id: number | null;
  status: string | null;
  attempt_no: number;
  started_at: Date | null;
  deadline_at: Date | null;
  attempt_time_limit_minutes: number | null;
  question_count: number;
  response_count: number;
  certificate_document_id: number | null;
}

const loadAttemptContext = async (enrollmentId: number): Promise<AttemptContext> => {
  const result = await pool.query(
    `SELECT e.id AS enrollment_id, e.employee_id, p.phase_number,
            ea.id AS assignment_id, ea.status, ea.attempt_no, ea.started_at, ea.deadline_at,
            ea.certificate_document_id, t.attempt_time_limit_minutes,
            (SELECT COUNT(*)::int FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id) AS question_count,
            (SELECT COUNT(*)::int FROM public.evaluation_responses r WHERE r.assignment_id = ea.id) AS response_count
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
       LEFT JOIN public.evaluation_templates t ON t.id = ea.template_id
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (result.rows.length === 0) {
    throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
  }
  const row = result.rows[0];
  return {
    enrollment_id: Number(row.enrollment_id),
    employee_id: Number(row.employee_id),
    phase_number: Number(row.phase_number),
    assignment_id: row.assignment_id ? Number(row.assignment_id) : null,
    status: row.status ? String(row.status) : null,
    attempt_no: row.attempt_no ? Number(row.attempt_no) : 1,
    started_at: row.started_at ? new Date(row.started_at) : null,
    deadline_at: row.deadline_at ? new Date(row.deadline_at) : null,
    attempt_time_limit_minutes: row.attempt_time_limit_minutes ? Number(row.attempt_time_limit_minutes) : null,
    question_count: Number(row.question_count ?? 0),
    response_count: Number(row.response_count ?? 0),
    certificate_document_id: row.certificate_document_id ? Number(row.certificate_document_id) : null,
  };
};

/** Cronometro del intento agotado: started_at + minutos < ahora. */
export const isAttemptTimerExhausted = (
  startedAt: Date | null,
  attemptTimeLimitMinutes: number | null,
  now: Date = new Date(),
): boolean => {
  if (!startedAt || !attemptTimeLimitMinutes) {
    return false;
  }
  return startedAt.getTime() + attemptTimeLimitMinutes * 60_000 < now.getTime();
};

export interface TruncatedAttemptDiagnosis {
  truncated: boolean;
  reasons: Array<'TIMER_EXHAUSTED' | 'NO_QUESTIONS' | 'STARTED_NOT_SUBMITTED'>;
}

/**
 * Un intento esta "truncado" cuando sigue abierto pero el colaborador ya no
 * puede presentarlo con normalidad: cronometro agotado (caida de internet,
 * cierre del navegador), snapshot sin preguntas (bug historico) o intento
 * iniciado sin enviar (RH decide reiniciarlo).
 */
export const diagnoseTruncatedAttempt = (
  input: {
    status: string | null;
    started_at: Date | null;
    attempt_time_limit_minutes: number | null;
    question_count: number;
  },
  now: Date = new Date(),
): TruncatedAttemptDiagnosis => {
  const reasons: TruncatedAttemptDiagnosis['reasons'] = [];
  if (!input.status || !(OPEN_STATUSES as readonly string[]).includes(input.status)) {
    return { truncated: false, reasons };
  }
  if (isAttemptTimerExhausted(input.started_at, input.attempt_time_limit_minutes, now)) {
    reasons.push('TIMER_EXHAUSTED');
  }
  if (input.question_count === 0) {
    reasons.push('NO_QUESTIONS');
  }
  if (input.started_at && reasons.length === 0) {
    reasons.push('STARTED_NOT_SUBMITTED');
  }
  return { truncated: reasons.length > 0, reasons };
};

export interface ResetTruncatedAttemptResult extends InductionRetryResult {
  phase_number: number;
  closed_assignment_id: number;
  closed_reasons: TruncatedAttemptDiagnosis['reasons'];
  closed_responses_kept: number;
}

/**
 * "Reabrir intento truncado": cierra el intento abierto que quedo inservible
 * como 'expired' (no presentado; sus respuestas parciales se conservan como
 * evidencia) y abre un intento nuevo con sorteo y ventana propios
 * (attempt_no + 1), sin correo ni SMS. Reusa el motor de "Autorizar nuevo
 * intento".
 */
export const resetTruncatedAttempt = async (input: {
  enrollmentId: number;
  actorUserId: string | null;
  note?: string | undefined;
}): Promise<ResetTruncatedAttemptResult> => {
  const ctx = await loadAttemptContext(input.enrollmentId);
  if (!ctx.assignment_id || !ctx.status) {
    return throwCoded(
      'RH_INDUCTION_RETRY_NO_EVALUATION',
      'El colaborador aun no tiene evaluacion en esta fase; no hay intento que reabrir.',
    );
  }
  if (ctx.certificate_document_id) {
    return throwCoded('RH_INDUCTION_RETRY_NOT_ALLOWED', 'La evaluacion ya tiene constancia emitida.');
  }
  const diagnosis = diagnoseTruncatedAttempt(ctx);
  if (!diagnosis.truncated) {
    return throwCoded(
      'RH_INDUCTION_ATTEMPT_NOT_TRUNCATED',
      'El intento no esta truncado: sigue disponible sin iniciar, o ya fue enviado/calificado. Para no acreditada o vencida usa "Autorizar nuevo intento".',
    );
  }

  const closedAssignmentId = ctx.assignment_id;
  await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT status FROM public.evaluation_assignments WHERE id = $1 FOR UPDATE;`,
      [closedAssignmentId],
    );
    const currentStatus = String(locked.rows[0]?.status ?? '');
    if (!(OPEN_STATUSES as readonly string[]).includes(currentStatus)) {
      throwCoded('RH_INDUCTION_ATTEMPT_NOT_TRUNCATED', 'El intento cambio de estado; vuelve a consultar.');
    }
    // 'expired' es el unico estado terminal del CHECK que refleja "no se presento".
    await client.query(
      `UPDATE public.evaluation_assignments
          SET status = 'expired', updated_at = NOW()
        WHERE id = $1;`,
      [closedAssignmentId],
    );
  });

  const retry = await authorizeInductionRetry({
    enrollmentId: input.enrollmentId,
    actorUserId: input.actorUserId,
    note: input.note,
  });
  return {
    ...retry,
    phase_number: ctx.phase_number,
    closed_assignment_id: closedAssignmentId,
    closed_reasons: diagnosis.reasons,
    closed_responses_kept: ctx.response_count,
  };
};

// -----------------------------------------------------------------------------

export interface IssueEnrollmentCertificateResult {
  enrollment_id: number;
  employee_id: number;
  assignment_id: number;
  certificate_document_id: number;
  already_existed: boolean;
}

/** Emite la constancia de una fase acreditada que se quedo sin ella (antes: CLI issue:certificate). */
export const issueEnrollmentCertificate = async (enrollmentId: number): Promise<IssueEnrollmentCertificateResult> => {
  const ctx = await loadAttemptContext(enrollmentId);
  if (!ctx.assignment_id || ctx.status !== 'passed') {
    return throwCoded(
      'RH_INDUCTION_CERTIFICATE_NOT_PASSED',
      'Solo se emite constancia cuando la evaluacion de la fase esta acreditada.',
    );
  }
  if (ctx.certificate_document_id) {
    return {
      enrollment_id: ctx.enrollment_id,
      employee_id: ctx.employee_id,
      assignment_id: ctx.assignment_id,
      certificate_document_id: ctx.certificate_document_id,
      already_existed: true,
    };
  }
  const documentId = await issueCertificateForAssignment(ctx.assignment_id);
  if (!documentId) {
    return throwCoded('RH_INDUCTION_CERTIFICATE_FAILED', 'No se pudo emitir la constancia.');
  }
  return {
    enrollment_id: ctx.enrollment_id,
    employee_id: ctx.employee_id,
    assignment_id: ctx.assignment_id,
    certificate_document_id: documentId,
    already_existed: false,
  };
};

// -----------------------------------------------------------------------------

export interface ResendReadingNoticeResult {
  enrollment_id: number;
  employee_id: number;
  phase_number: number;
  reading_deadline_at: string | null;
}

/** Reenvia el aviso SMS de lecturas asignadas (antes: CLI notify:induction-readings). */
export const resendReadingNotice = async (enrollmentId: number): Promise<ResendReadingNoticeResult> => {
  const result = await pool.query(
    `SELECT e.id, e.employee_id, e.reading_completed_at, e.evaluation_assignment_id, e.reading_deadline_at,
            p.phase_number, p.published_at,
            (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS reading_total
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (result.rows.length === 0) {
    throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
  }
  const row = result.rows[0];
  if (!row.published_at || Number(row.reading_total ?? 0) === 0) {
    throwCoded('RH_INDUCTION_NOTICE_NOT_APPLICABLE', 'La fase no esta publicada o el inscrito no tiene lecturas asignadas.');
  }
  if (row.reading_completed_at || row.evaluation_assignment_id) {
    throwCoded('RH_INDUCTION_NOTICE_NOT_APPLICABLE', 'El colaborador ya termino la lectura o ya tiene evaluacion.');
  }
  await notifyInductionReadingsAssigned(enrollmentId);
  return {
    enrollment_id: Number(row.id),
    employee_id: Number(row.employee_id),
    phase_number: Number(row.phase_number),
    reading_deadline_at: row.reading_deadline_at ? toIsoDateTime(row.reading_deadline_at) : null,
  };
};
