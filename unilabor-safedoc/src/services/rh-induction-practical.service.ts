import pool from '../config/db';
import { capturePracticalResults } from './evaluation-practical.service';
import type { PracticalCaptureRow } from './evaluation-practical.service';
import { autoCompleteChecklistForPassedAssignment } from './rh-induction-checklist.service';
import { refreshEnrollmentReadingStatus } from './rh-induction.service';
import { queuePositionTrackSync } from './rh-induction-position-track.service';

// -----------------------------------------------------------------------------
// Captura de la evaluacion practica (Fase 6) desde el Tablero de Induccion:
// resuelve la plantilla practica del curso del puesto de la inscripcion,
// captura (o corrige) la calificacion 0-10 con el motor existente y liga la
// asignacion a la inscripcion para que la fase quede aprobada/no acreditada.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  (error as any).publicMessage = publicMessage;
  throw error;
};

export interface CaptureEnrollmentPracticalInput {
  enrollmentId: number;
  score: number;
  capturedAt: string | null;
  actorUserId: string;
}

export interface CaptureEnrollmentPracticalResult extends PracticalCaptureRow {
  enrollment_id: number;
  employee_name: string;
  passing_score: number;
}

export const captureEnrollmentPractical = async (input: CaptureEnrollmentPracticalInput): Promise<CaptureEnrollmentPracticalResult> => {
  const enrollment = await pool.query(
    `SELECT e.id, e.employee_id, emp.full_name, p.phase_number, p.published_at,
            COALESCE(e.training_course_id, p.training_course_id) AS course_id,
            t.id AS template_id, t.passing_score
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id
       JOIN public.employees emp ON emp.id = e.employee_id
       LEFT JOIN LATERAL (
         SELECT id, passing_score FROM public.evaluation_templates
          WHERE training_course_id = COALESCE(e.training_course_id, p.training_course_id)
            AND evaluation_type = 'practical' AND status = 'published' AND is_active = TRUE
          ORDER BY created_at DESC LIMIT 1
       ) t ON TRUE
      WHERE e.id = $1 LIMIT 1;`,
    [input.enrollmentId],
  );
  if (enrollment.rows.length === 0) {
    return throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
  }
  const row = enrollment.rows[0];
  if (!row.template_id) {
    return throwCoded(
      'RH_INDUCTION_PRACTICAL_NOT_AVAILABLE',
      'Esta inscripcion no tiene una evaluacion practica publicada para su puesto (solo aplica a la Fase 6).',
    );
  }
  if (!row.published_at) {
    return throwCoded('RH_INDUCTION_PHASE_NOT_PUBLISHED', 'La fase sigue en borrador; publicala antes de capturar.');
  }

  const summary = await capturePracticalResults(
    Number(row.template_id),
    input.capturedAt,
    [{ employee_id: Number(row.employee_id), score: input.score }],
    input.actorUserId,
  );
  const captured = summary.results[0] as PracticalCaptureRow;

  // Liga la asignacion a la inscripcion (auto-vinculo) y, si acredito, corre
  // el checklist automatico que la emision no alcanzo a ver sin el vinculo.
  await refreshEnrollmentReadingStatus(input.enrollmentId);
  if (captured.status === 'passed') {
    await autoCompleteChecklistForPassedAssignment(captured.assignment_id).catch((error) => {
      console.error(`Checklist automatico de la Fase 6 (asignacion ${captured.assignment_id}):`, error);
    });
    // Ruta por puesto: la constancia se emitio antes del vinculo; activa aqui el siguiente puesto.
    queuePositionTrackSync(Number(row.employee_id), input.actorUserId);
  }
  return {
    ...captured,
    enrollment_id: input.enrollmentId,
    employee_name: String(row.full_name),
    passing_score: Number(row.passing_score),
  };
};
