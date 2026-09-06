import pool from '../config/db';

/**
 * Sincroniza la fecha limite de los acuses de Sala de Lectura ligados a una
 * inscripcion de Induccion con `rh_induction_enrollments.reading_deadline_at`.
 *
 * Cada acuse (`quality_reading_acknowledgements.deadline_at`) nace con las
 * horas por defecto de su publicacion, independientes del limite de la fase.
 * Sin esta sincronizacion el cron de Sala de Lectura vencia los acuses en su
 * propio plazo y el colaborador quedaba bloqueado antes de que venciera su
 * inscripcion (incidencia prod 2026-09-06, Fase 1).
 *
 * Reglas:
 * - Inscripcion con limite: el acuse toma exactamente ese limite.
 * - Inscripcion sin limite: el acuse recibe un horizonte amplio
 *   (INDUCTION_UNLIMITED_READING_HOURS) para que no venza por su cuenta.
 * - Un acuse ya vencido cuyo nuevo limite es futuro vuelve a su estado real
 *   (read / in_progress / pending) segun el avance guardado.
 * - No se tocan acuses firmados ni cancelados, ni inscripciones con examen
 *   abierto o lectura terminada.
 */

export const INDUCTION_UNLIMITED_READING_HOURS = 24 * 365;

export interface SyncInductionReadingDeadlinesTarget {
  enrollmentId?: number;
  phaseId?: number;
}

export const syncInductionReadingDeadlines = async (
  target: SyncInductionReadingDeadlinesTarget,
): Promise<number> => {
  if (!target.enrollmentId && !target.phaseId) {
    return 0;
  }
  const result = await pool.query(
    `UPDATE public.quality_reading_acknowledgements a
        SET deadline_at = COALESCE(e.reading_deadline_at, NOW() + make_interval(hours => $3::int)),
            status = CASE
              WHEN a.status = 'expired'
                   AND COALESCE(e.reading_deadline_at, NOW() + make_interval(hours => $3::int)) > NOW()
              THEN CASE
                     WHEN a.read_completed_at IS NOT NULL THEN 'read'
                     WHEN a.started_at IS NOT NULL THEN 'in_progress'
                     ELSE 'pending'
                   END
              ELSE a.status
            END,
            updated_at = NOW()
       FROM public.rh_induction_reading_items ri
       INNER JOIN public.rh_induction_enrollments e ON e.id = ri.enrollment_id
      WHERE ri.acknowledgement_id = a.id
        AND ($1::bigint IS NULL OR e.id = $1::bigint)
        AND ($2::bigint IS NULL OR e.phase_id = $2::bigint)
        AND e.evaluation_assignment_id IS NULL
        AND e.reading_completed_at IS NULL
        AND a.status IN ('pending', 'in_progress', 'read', 'expired')
      RETURNING a.id;`,
    [target.enrollmentId ?? null, target.phaseId ?? null, INDUCTION_UNLIMITED_READING_HOURS],
  );
  return result.rowCount ?? 0;
};
