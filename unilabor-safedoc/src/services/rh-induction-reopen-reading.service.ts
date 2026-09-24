import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { withTransaction } from '../utils/transaction';

// -----------------------------------------------------------------------------
// Induccion: "Reabrir lectura" de una fase a un inscrito que NO termino de leer
// y cuyo plazo vencio (o esta por vencer).
//
// Caso tipico (prod 2026-09-08): vence el limite de lectura, el cron abre el
// cuestionario aunque falten documentos por firmar y los acuses de Sala de
// Lectura quedan "expired". RH quiere darle N horas mas de lectura y que el
// examen se abra SOLO al terminar de leer o al vencer el nuevo plazo (como esta
// disenado el programa). Hasta hoy se resolvia con el script pgAdmin
// SCRIPT_PROD_REABRIR_LECTURA_INDUCCION_48H.sql; esto es la version en sistema,
// por inscrito y con el mismo criterio endurecido contra carreras.
//
// Que hace, en una transaccion:
//   1. Si hay un cuestionario abierto que NUNCA se inicio (pending, sin
//      started_at ni respuestas), lo desliga y lo elimina con su snapshot de
//      preguntas (no es evidencia: nadie lo contesto). Los avisos enviados se
//      conservan (solo se desligan).
//   2. Fija reading_deadline_at = NOW() + N horas en la inscripcion.
//   3. Reactiva los acuses de Sala de Lectura con ese limite: expired ->
//      read / in_progress / pending segun el avance guardado (paginas leidas
//      y tiempo acumulado no se pierden).
//
// NO toca: lectura ya completa, ni cuestionarios iniciados, enviados,
// calificados, reprobados o vencidos (para esos existe "Autorizar nuevo
// intento"). Sin correo ni SMS (politica: 1 SMS por fase; RH avisa en persona).
// -----------------------------------------------------------------------------

export interface ReopenInductionReadingInput {
  enrollmentId: number;
  hours: number;
  actorUserId: string | null;
  note?: string | undefined;
}

export interface ReopenInductionReadingResult {
  enrollment_id: number;
  employee_id: number;
  phase_number: number;
  previous_deadline_at: string | null;
  new_deadline_at: string;
  removed_assignment_id: number | null;
  acknowledgements_reactivated: number;
  reading_signed: number;
  reading_total: number;
}

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

const EVALUATION_STATUS_LABEL: Record<string, string> = {
  in_progress: 'ya esta en curso',
  submitted: 'ya fue enviada',
  grading: 'esta en revision',
  passed: 'ya esta acreditada',
  failed: 'quedo no acreditada',
  expired: 'vencio sin presentarse',
  authorized_late: 'tiene autorizacion extemporanea',
};

export const reopenInductionReading = async (
  input: ReopenInductionReadingInput,
): Promise<ReopenInductionReadingResult> => {
  return withTransaction(async (client) => {
    // Bloquea la inscripcion y (si existe) su cuestionario: el estado se evalua
    // dentro de la transaccion para no pisar un examen que el colaborador abrio
    // justo ahora (carrera vista en prod el 2026-09-08).
    const ctxResult = await client.query(
      `SELECT e.id AS enrollment_id, e.employee_id, e.reading_completed_at, e.reading_deadline_at,
              e.evaluation_assignment_id, p.phase_number,
              (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS reading_total,
              (SELECT COUNT(*)::int FROM public.rh_induction_reading_items ri
                 INNER JOIN public.quality_reading_acknowledgements q ON q.id = ri.acknowledgement_id
                WHERE ri.enrollment_id = e.id AND q.status = 'signed') AS reading_signed
         FROM public.rh_induction_enrollments e
         INNER JOIN public.rh_induction_phases p ON p.id = e.phase_id
        WHERE e.id = $1
        FOR UPDATE OF e;`,
      [input.enrollmentId],
    );
    if (ctxResult.rows.length === 0) {
      return throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
    }
    const ctx = ctxResult.rows[0];
    const readingTotal = Number(ctx.reading_total ?? 0);
    const readingSigned = Number(ctx.reading_signed ?? 0);

    if (readingTotal === 0) {
      return throwCoded(
        'RH_INDUCTION_REOPEN_NO_READING',
        'Esta inscripcion no tiene documentos de lectura asignados; no hay lectura que reabrir.',
      );
    }
    if (ctx.reading_completed_at) {
      return throwCoded(
        'RH_INDUCTION_REOPEN_READING_COMPLETED',
        'El colaborador ya termino de leer y firmar todos los documentos; no procede reabrir la lectura.',
      );
    }

    let removedAssignmentId: number | null = null;
    const assignmentId = ctx.evaluation_assignment_id ? Number(ctx.evaluation_assignment_id) : null;
    if (assignmentId) {
      const assignmentResult = await client.query(
        `SELECT a.id, a.status, a.started_at,
                EXISTS (SELECT 1 FROM public.evaluation_responses r WHERE r.assignment_id = a.id) AS has_responses
           FROM public.evaluation_assignments a
          WHERE a.id = $1
          FOR UPDATE OF a;`,
        [assignmentId],
      );
      const assignment = assignmentResult.rows[0];
      if (assignment) {
        const status = String(assignment.status);
        const untouched = status === 'pending' && !assignment.started_at && !assignment.has_responses;
        if (!untouched) {
          const label = EVALUATION_STATUS_LABEL[status] ?? `esta en estado ${status}`;
          return throwCoded(
            'RH_INDUCTION_REOPEN_EVALUATION_STARTED',
            `No se puede reabrir la lectura: la evaluacion ${label}. Si aplica, usa "Autorizar nuevo intento".`,
          );
        }
        // Cuestionario abierto por vencimiento que nadie toco: se retira para
        // que vuelva a abrirse al terminar la lectura o al vencer el nuevo plazo.
        await client.query(
          `UPDATE public.rh_induction_enrollments SET evaluation_assignment_id = NULL, updated_at = NOW() WHERE id = $1;`,
          [input.enrollmentId],
        );
        await client.query(`UPDATE public.notification_log SET assignment_id = NULL WHERE assignment_id = $1;`, [
          assignmentId,
        ]);
        await client.query(`DELETE FROM public.evaluation_assignment_questions WHERE assignment_id = $1;`, [assignmentId]);
        await client.query(`DELETE FROM public.evaluation_assignments WHERE id = $1;`, [assignmentId]);
        removedAssignmentId = assignmentId;
      }
    }

    const deadlineResult = await client.query(
      `UPDATE public.rh_induction_enrollments
          SET reading_deadline_at = NOW() + make_interval(hours => $2::int), updated_at = NOW()
        WHERE id = $1
        RETURNING reading_deadline_at;`,
      [input.enrollmentId, input.hours],
    );
    const newDeadline = deadlineResult.rows[0]?.reading_deadline_at;

    const ackResult = await client.query(
      `UPDATE public.quality_reading_acknowledgements q
          SET deadline_at = e.reading_deadline_at,
              status = CASE
                         WHEN q.status = 'expired' AND q.read_completed_at IS NOT NULL THEN 'read'
                         WHEN q.status = 'expired' AND q.started_at IS NOT NULL THEN 'in_progress'
                         WHEN q.status = 'expired' THEN 'pending'
                         ELSE q.status
                       END,
              updated_at = NOW()
         FROM public.rh_induction_reading_items ri
         INNER JOIN public.rh_induction_enrollments e ON e.id = ri.enrollment_id
        WHERE q.id = ri.acknowledgement_id
          AND e.id = $1
          AND q.status IN ('pending', 'in_progress', 'read', 'expired')
        RETURNING q.id;`,
      [input.enrollmentId],
    );

    return {
      enrollment_id: Number(ctx.enrollment_id),
      employee_id: Number(ctx.employee_id),
      phase_number: Number(ctx.phase_number),
      previous_deadline_at: ctx.reading_deadline_at ? toIsoDateTime(ctx.reading_deadline_at) : null,
      new_deadline_at: newDeadline ? toIsoDateTime(newDeadline) : '',
      removed_assignment_id: removedAssignmentId,
      acknowledgements_reactivated: ackResult.rowCount ?? 0,
      reading_signed: readingSigned,
      reading_total: readingTotal,
    };
  });
};
