import pool from '../config/db';
import { queueNotifyInductionReadingsAssigned } from './rh-induction-notification.service';
import { syncInductionReadingDeadlines } from './rh-induction-reading-deadline.service';
import { assignEnrollmentReadings, getPhaseDocuments, refreshEnrollmentReadingStatus } from './rh-induction.service';

// -----------------------------------------------------------------------------
// Induccion: periodo de descanso entre fases.
//
// Regla por fase (2-4), opcional e independiente: "Periodo de descanso antes de
// iniciar esta fase (horas)". Al AVANZAR a la fase la inscripcion se crea de
// inmediato con `readings_start_at = NOW() + horas`, sin lecturas ni plazo ni
// SMS. Cuando llega esa hora, este servicio activa la inscripcion: asigna las
// lecturas en Sala de Lectura, fija el limite de lectura desde ese momento y
// manda el unico SMS de la fase. Corre en el cron de induccion (cada 10 min) y
// de forma lazy al consultar el progreso. Idempotente.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export const setPhaseAdvanceGrace = async (phaseId: number, hours: number | null): Promise<boolean> => {
  const phase = await pool.query(
    `SELECT scope, phase_number FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`,
    [phaseId],
  );
  if (phase.rows.length === 0) {
    return false;
  }
  const phaseNumber = Number(phase.rows[0].phase_number);
  if (String(phase.rows[0].scope) !== 'INSTITUTIONAL' || phaseNumber < 2 || phaseNumber > 4) {
    throwCoded(
      'RH_INDUCTION_GRACE_NOT_APPLICABLE',
      'El periodo de descanso solo aplica a las Fases 2 a 4 (se llega a ellas avanzando desde la anterior).',
    );
  }
  const value = hours && hours > 0 ? Math.floor(hours) : null;
  const result = await pool.query(
    `UPDATE public.rh_induction_phases SET advance_grace_hours = $2, updated_at = NOW() WHERE id = $1;`,
    [phaseId, value],
  );
  return (result.rowCount ?? 0) > 0;
};

/** Horas de descanso configuradas para entrar a la fase (0 si no aplica). */
export const getPhaseAdvanceGraceHours = async (phaseId: number): Promise<number> => {
  const result = await pool.query(`SELECT advance_grace_hours FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`, [
    phaseId,
  ]);
  const value = result.rows[0]?.advance_grace_hours;
  return value ? Number(value) : 0;
};

interface DeferredRow {
  id: number;
  phase_id: number;
  user_id: string | null;
  enrolled_by_user_id: string | null;
  reading_time_limit_hours: number | null;
}

const DEFERRED_SELECT = `
  SELECT e.id, e.phase_id, emp.user_id, e.enrolled_by_user_id, p.reading_time_limit_hours
    FROM public.rh_induction_enrollments e
    JOIN public.rh_induction_phases p ON p.id = e.phase_id
    JOIN public.employees emp ON emp.id = e.employee_id
   WHERE e.readings_start_at IS NOT NULL AND e.readings_start_at <= NOW()
     AND p.published_at IS NOT NULL AND p.scope = 'INSTITUTIONAL'
     AND e.evaluation_assignment_id IS NULL AND e.reading_completed_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id)`;

const activateOne = async (row: DeferredRow): Promise<boolean> => {
  if (!row.user_id) {
    return false;
  }
  const documents = await getPhaseDocuments(row.phase_id);
  if (documents.length === 0) {
    return false;
  }
  const actor = row.enrolled_by_user_id ?? row.user_id;
  await assignEnrollmentReadings(row.id, row.user_id, documents, actor);
  await pool.query(
    `UPDATE public.rh_induction_enrollments
        SET reading_deadline_at = CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() + make_interval(hours => $2::int) END,
            updated_at = NOW()
      WHERE id = $1;`,
    [row.id, row.reading_time_limit_hours ? Number(row.reading_time_limit_hours) : null],
  );
  await syncInductionReadingDeadlines({ enrollmentId: row.id });
  queueNotifyInductionReadingsAssigned(row.id);
  await refreshEnrollmentReadingStatus(row.id);
  return true;
};

const mapRow = (row: any): DeferredRow => ({
  id: Number(row.id),
  phase_id: Number(row.phase_id),
  user_id: row.user_id ? String(row.user_id) : null,
  enrolled_by_user_id: row.enrolled_by_user_id ? String(row.enrolled_by_user_id) : null,
  reading_time_limit_hours: row.reading_time_limit_hours ? Number(row.reading_time_limit_hours) : null,
});

/** Activa todas las inscripciones cuyo descanso ya termino (cron). Devuelve cuantas activo. */
export const activateDeferredEnrollments = async (filter: { employeeId?: number; phaseId?: number } = {}): Promise<number> => {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.employeeId) {
    params.push(filter.employeeId);
    clauses.push(`AND e.employee_id = $${params.length}`);
  }
  if (filter.phaseId) {
    params.push(filter.phaseId);
    clauses.push(`AND e.phase_id = $${params.length}`);
  }
  const result = await pool.query(`${DEFERRED_SELECT} ${clauses.join(' ')} ORDER BY e.readings_start_at ASC;`, params);
  let activated = 0;
  for (const row of result.rows) {
    try {
      if (await activateOne(mapRow(row))) {
        activated += 1;
      }
    } catch (error) {
      console.error(`No se pudo activar la inscripcion de induccion ${row.id} tras el descanso:`, error);
    }
  }
  return activated;
};

/** Version best-effort (nunca lanza) para los refrescos lazy. */
export const tryActivateDeferredEnrollments = async (filter: { employeeId?: number; phaseId?: number } = {}): Promise<void> => {
  try {
    await activateDeferredEnrollments(filter);
  } catch (error) {
    console.error('No se pudieron activar inscripciones de induccion en descanso:', error);
  }
};

/** RH decide terminar el descanso ya: activa la inscripcion de inmediato. */
export const startDeferredEnrollmentNow = async (enrollmentId: number): Promise<{ activated: boolean }> => {
  const current = await pool.query(
    `SELECT e.readings_start_at, e.evaluation_assignment_id, e.reading_completed_at,
            EXISTS (SELECT 1 FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS has_readings
       FROM public.rh_induction_enrollments e WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (current.rows.length === 0) {
    throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
  }
  const row = current.rows[0];
  if (!row.readings_start_at || row.has_readings || row.evaluation_assignment_id || row.reading_completed_at) {
    throwCoded('RH_INDUCTION_NOT_DEFERRED', 'Esta inscripcion no esta en periodo de descanso.');
  }
  await pool.query(`UPDATE public.rh_induction_enrollments SET readings_start_at = NOW(), updated_at = NOW() WHERE id = $1;`, [
    enrollmentId,
  ]);
  const result = await pool.query(`${DEFERRED_SELECT} AND e.id = $1 LIMIT 1;`, [enrollmentId]);
  if (result.rows.length === 0) {
    return { activated: false };
  }
  return { activated: await activateOne(mapRow(result.rows[0])) };
};
