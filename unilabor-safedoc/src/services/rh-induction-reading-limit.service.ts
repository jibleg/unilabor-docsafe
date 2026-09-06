import pool from '../config/db';
import { refreshEnrollmentReadingStatus } from './rh-induction.service';
import { syncInductionReadingDeadlines } from './rh-induction-reading-deadline.service';

const throwCoded = (code: string, message: string): never => {
  const error = new Error(message) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = message;
  throw error;
};

export interface RhInductionReadingLimitUpdateResult {
  reading_time_limit_hours: number | null;
  phase_published: boolean;
  /** Inscritos sin examen abierto cuya fecha limite se recalculo (0 si no se pidio o la fase esta en borrador). */
  enrollments_updated: number;
}

/**
 * Guarda el limite de lectura (horas) de una fase. La fecha limite de cada
 * inscripcion se congela al asignar sus lecturas, asi que un cambio posterior
 * solo aplica a inscripciones nuevas... salvo que RH pida aplicarlo tambien a
 * los inscritos vigentes (`applyToEnrolled`): entonces se recalcula para los
 * que aun no terminan la lectura ni tienen examen abierto, contando desde que
 * arranco su lectura (la publicacion de la fase o su inscripcion, lo que haya
 * sido despues). Si el nuevo plazo ya vencio, la evaluacion se abre de
 * inmediato (mismo criterio que el barrido periodico). Los acuses de Sala de
 * Lectura ligados se alinean al mismo limite (ver
 * rh-induction-reading-deadline.service).
 */
export const updatePhaseReadingLimit = async (
  phaseId: number,
  readingLimitHours: number | null,
  applyToEnrolled: boolean,
): Promise<RhInductionReadingLimitUpdateResult> => {
  const updated = await pool.query(
    `UPDATE public.rh_induction_phases
        SET reading_time_limit_hours = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING published_at;`,
    [readingLimitHours, phaseId],
  );
  if (updated.rows.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_NOT_FOUND', 'La fase no existe.');
  }
  const phasePublished = Boolean(updated.rows[0].published_at);
  if (!applyToEnrolled || !phasePublished) {
    return { reading_time_limit_hours: readingLimitHours, phase_published: phasePublished, enrollments_updated: 0 };
  }

  const recalculated = await pool.query(
    `UPDATE public.rh_induction_enrollments e
        SET reading_deadline_at = CASE
              WHEN $2::int IS NULL THEN NULL
              ELSE GREATEST(p.published_at, e.created_at) + make_interval(hours => $2::int)
            END,
            updated_at = NOW()
       FROM public.rh_induction_phases p
      WHERE p.id = e.phase_id AND e.phase_id = $1
        AND e.evaluation_assignment_id IS NULL
        AND e.reading_completed_at IS NULL
        AND EXISTS (SELECT 1 FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id)
      RETURNING e.id, e.reading_deadline_at;`,
    [phaseId, readingLimitHours],
  );
  // Los acuses de Sala de Lectura ligados a estas inscripciones vencen con el
  // nuevo limite (y se reactivan si estaban vencidos y el limite es futuro).
  await syncInductionReadingDeadlines({ phaseId });
  for (const row of recalculated.rows) {
    if (row.reading_deadline_at && new Date(row.reading_deadline_at).getTime() <= Date.now()) {
      await refreshEnrollmentReadingStatus(Number(row.id));
    }
  }
  return {
    reading_time_limit_hours: readingLimitHours,
    phase_published: phasePublished,
    enrollments_updated: recalculated.rows.length,
  };
};
