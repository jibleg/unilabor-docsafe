import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { withTransaction } from '../utils/transaction';
import { assignEvaluation } from './evaluation-assignment.service';

// -----------------------------------------------------------------------------
// Induccion: "Autorizar nuevo intento" de la evaluacion de una fase.
//
// Politica (ISO 15189 §6.2 / diseno del modulo): el cuestionario es de intento
// unico; si el colaborador no acredita, RH da retroalimentacion/recapacitacion
// y AUTORIZA un nuevo intento. El colaborador nunca reintenta por su cuenta.
//
// Mecanica: se crea una asignacion NUEVA del cuestionario (mismo curso de la
// fase, sorteo nuevo de preguntas, ventana propia, intento N+1) y la inscripcion
// pasa a apuntar a ella. La asignacion reprobada/vencida NO se toca: queda como
// evidencia del intento anterior. Sin correo ni SMS (decision RH 2026-09-07:
// cuidar creditos; RH avisa en persona).
// -----------------------------------------------------------------------------

const RETRYABLE_STATUSES = ['failed', 'expired'] as const;

export interface AuthorizeInductionRetryInput {
  enrollmentId: number;
  actorUserId: string | null;
  note?: string | undefined;
}

export interface InductionRetryResult {
  enrollment_id: number;
  employee_id: number;
  previous_assignment_id: number;
  previous_status: string;
  new_assignment_id: number;
  attempt_no: number;
  deadline_at: string;
}

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

interface EnrollmentContext {
  enrollment_id: number;
  employee_id: number;
  training_course_id: number | null;
  assignment_id: number | null;
  assignment_status: string | null;
  attempt_no: number;
  template_id: number | null;
  template_active: boolean;
  template_status: string | null;
  evaluation_type: string | null;
}

const loadContext = async (enrollmentId: number): Promise<EnrollmentContext> => {
  const result = await pool.query(
    `SELECT e.id AS enrollment_id, e.employee_id, e.training_course_id,
            ea.id AS assignment_id, ea.status AS assignment_status, ea.attempt_no,
            t.id AS template_id, t.is_active AS template_active, t.status AS template_status,
            t.evaluation_type
       FROM public.rh_induction_enrollments e
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
       LEFT JOIN public.evaluation_templates t ON t.id = ea.template_id
      WHERE e.id = $1
      LIMIT 1;`,
    [enrollmentId],
  );
  if (result.rows.length === 0) {
    throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
  }
  const row = result.rows[0];
  return {
    enrollment_id: Number(row.enrollment_id),
    employee_id: Number(row.employee_id),
    training_course_id: row.training_course_id ? Number(row.training_course_id) : null,
    assignment_id: row.assignment_id ? Number(row.assignment_id) : null,
    assignment_status: row.assignment_status ? String(row.assignment_status) : null,
    attempt_no: row.attempt_no ? Number(row.attempt_no) : 1,
    template_id: row.template_id ? Number(row.template_id) : null,
    template_active: Boolean(row.template_active),
    template_status: row.template_status ? String(row.template_status) : null,
    evaluation_type: row.evaluation_type ? String(row.evaluation_type) : null,
  };
};

/**
 * Cuestionario a usar en el nuevo intento: el mismo del intento anterior si
 * sigue publicado; si RH lo retiro, el quiz publicado mas reciente del curso.
 */
const resolveTemplateId = async (ctx: EnrollmentContext): Promise<number> => {
  if (ctx.template_id && ctx.template_active && ctx.template_status === 'published') {
    return ctx.template_id;
  }
  if (!ctx.training_course_id) {
    return throwCoded(
      'RH_INDUCTION_PHASE_WITHOUT_PUBLISHED_EVALUATION',
      'La fase no tiene un cuestionario publicado para reasignar.',
    );
  }
  const result = await pool.query(
    `SELECT id FROM public.evaluation_templates
      WHERE training_course_id = $1 AND status = 'published' AND is_active = TRUE
        AND evaluation_type = 'quiz'
      ORDER BY created_at DESC LIMIT 1;`,
    [ctx.training_course_id],
  );
  if (result.rows.length === 0) {
    return throwCoded(
      'RH_INDUCTION_PHASE_WITHOUT_PUBLISHED_EVALUATION',
      'La fase no tiene un cuestionario publicado para reasignar.',
    );
  }
  return Number(result.rows[0].id);
};

export const authorizeInductionRetry = async (
  input: AuthorizeInductionRetryInput,
): Promise<InductionRetryResult> => {
  const ctx = await loadContext(input.enrollmentId);

  if (!ctx.assignment_id || !ctx.assignment_status) {
    return throwCoded(
      'RH_INDUCTION_RETRY_NO_EVALUATION',
      'El colaborador aun no tiene evaluacion en esta fase; no hay intento que reabrir.',
    );
  }
  if (ctx.evaluation_type === 'practical') {
    return throwCoded(
      'RH_INDUCTION_RETRY_NOT_ALLOWED',
      'La evaluacion de esta fase es practica: RH captura la calificacion directamente.',
    );
  }
  if (!(RETRYABLE_STATUSES as readonly string[]).includes(ctx.assignment_status)) {
    return throwCoded(
      'RH_INDUCTION_RETRY_NOT_ALLOWED',
      'Solo se puede autorizar un nuevo intento cuando la evaluacion esta no acreditada o vencida.',
    );
  }

  const templateId = await resolveTemplateId(ctx);

  // Crea la asignacion nueva (snapshot de preguntas incluido) SIN avisos. Si ya
  // existe una vigente para ese cuestionario (p. ej. RH la asigno por fuera
  // desde Capacitaciones), se reutiliza en lugar de duplicarla.
  await assignEvaluation(templateId, [ctx.employee_id], input.actorUserId, { notify: false });
  const activeResult = await pool.query(
    `SELECT id FROM public.evaluation_assignments
      WHERE template_id = $1 AND employee_id = $2
        AND status IN ('pending', 'in_progress', 'authorized_late')
      ORDER BY created_at DESC LIMIT 1;`,
    [templateId, ctx.employee_id],
  );
  const newAssignmentId = activeResult.rows[0]?.id ? Number(activeResult.rows[0].id) : null;
  if (!newAssignmentId) {
    return throwCoded(
      'RH_INDUCTION_RETRY_ASSIGNMENT_FAILED',
      'No se pudo crear la nueva asignacion del cuestionario.',
    );
  }

  const nextAttempt = ctx.attempt_no + 1;
  const deadline = await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE public.evaluation_assignments
          SET attempt_no = GREATEST(attempt_no, $2), updated_at = NOW()
        WHERE id = $1
        RETURNING deadline_at;`,
      [newAssignmentId, nextAttempt],
    );
    await client.query(
      `UPDATE public.rh_induction_enrollments
          SET evaluation_assignment_id = $1, updated_at = NOW()
        WHERE id = $2;`,
      [newAssignmentId, ctx.enrollment_id],
    );
    return updated.rows[0]?.deadline_at ? toIsoDateTime(updated.rows[0].deadline_at) : '';
  });

  return {
    enrollment_id: ctx.enrollment_id,
    employee_id: ctx.employee_id,
    previous_assignment_id: ctx.assignment_id,
    previous_status: ctx.assignment_status,
    new_assignment_id: newAssignmentId,
    attempt_no: nextAttempt,
    deadline_at: deadline,
  };
};
