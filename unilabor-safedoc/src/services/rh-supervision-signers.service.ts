import pool from '../config/db';
import type { SupervisionChecklistRecord } from './rh-supervision-checklist.service';

// -----------------------------------------------------------------------------
// Firmantes del ANA-REG-060 en la Fase 6:
//   * Supervisor / Auditor = supervisor asignado a la inscripcion (colaborador x
//     puesto), el mismo dato que imprime el REH-REG-005.
//   * Responsable del Area = colaborador configurado para el area del proceso
//     que rige el puesto (Preanalitica, Analitica, Posanalitica, Administracion).
// Las listas en BORRADOR se sincronizan con esos datos; las firmadas no cambian.
// Nadie firma su propia supervision.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

/**
 * Copia a los borradores el supervisor de su inscripcion y el responsable del
 * area de su puesto. Sin filtros sincroniza todos los borradores.
 */
export const syncDraftSigners = async (filter: { enrollmentIds?: number[]; areaCode?: string } = {}): Promise<number> => {
  const params: unknown[] = [];
  const clauses = [`c2.status = 'DRAFT'`];
  if (filter.enrollmentIds && filter.enrollmentIds.length > 0) {
    params.push(filter.enrollmentIds);
    clauses.push(`c2.enrollment_id = ANY($${params.length}::bigint[])`);
  }
  if (filter.areaCode) {
    params.push(filter.areaCode);
    clauses.push(`pa.code = $${params.length}`);
  }
  const result = await pool.query(
    `UPDATE public.rh_supervision_checklists c
        SET supervisor_employee_id = CASE WHEN c.enrollment_id IS NULL THEN c.supervisor_employee_id ELSE src.supervisor_id END,
            supervisor_name = CASE WHEN c.enrollment_id IS NULL THEN c.supervisor_name ELSE COALESCE(src.supervisor_name, '') END,
            area_responsible_employee_id = CASE WHEN c.enrollment_id IS NULL THEN COALESCE(src.responsible_id, c.area_responsible_employee_id) ELSE src.responsible_id END,
            area_responsible_name = CASE WHEN c.enrollment_id IS NULL THEN COALESCE(src.responsible_name, c.area_responsible_name) ELSE COALESCE(src.responsible_name, '') END,
            updated_at = NOW()
       FROM (
         SELECT c2.id,
                e.supervisor_employee_id AS supervisor_id, sup.full_name AS supervisor_name,
                s.area_responsible_employee_id AS responsible_id, resp.full_name AS responsible_name
           FROM public.rh_supervision_checklists c2
           JOIN public.rh_positions rp ON rp.id = c2.position_id
           LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
           LEFT JOIN public.rh_induction_enrollments e ON e.id = c2.enrollment_id
           LEFT JOIN public.employees sup ON sup.id = e.supervisor_employee_id
           LEFT JOIN public.rh_supervision_area_signatories s ON s.area_key = pa.code
           LEFT JOIN public.employees resp ON resp.id = s.area_responsible_employee_id
          WHERE ${clauses.join(' AND ')}
       ) src
      WHERE c.id = src.id;`,
    params,
  );
  return result.rowCount ?? 0;
};

/** RH asigna (o quita, con null) el supervisor de una o varias inscripciones de la Fase 6. */
export const assignPhase6Supervisor = async (enrollmentIds: number[], supervisorEmployeeId: number | null): Promise<number> => {
  if (supervisorEmployeeId) {
    const supervisor = await pool.query(`SELECT id, is_active FROM public.employees WHERE id = $1 LIMIT 1;`, [supervisorEmployeeId]);
    if (!supervisor.rows[0]?.is_active) {
      throwCoded('RH_SUPERVISION_SUPERVISOR_INVALID', 'El supervisor elegido no existe o esta inactivo.');
    }
    const own = await pool.query(
      `SELECT e.id FROM public.rh_induction_enrollments e WHERE e.id = ANY($1::bigint[]) AND e.employee_id = $2 LIMIT 1;`,
      [enrollmentIds, supervisorEmployeeId],
    );
    if (own.rows.length > 0) {
      throwCoded('RH_SUPERVISION_SELF_SUPERVISION', 'Un colaborador no puede ser su propio supervisor; quitalo de la seleccion o elige a otra persona.');
    }
  }
  const updated = await pool.query(
    `UPDATE public.rh_induction_enrollments e
        SET supervisor_employee_id = $2, updated_at = NOW()
       FROM public.rh_induction_phases p
      WHERE e.id = ANY($1::bigint[]) AND p.id = e.phase_id AND p.phase_number = 6
      RETURNING e.id;`,
    [enrollmentIds, supervisorEmployeeId],
  );
  const ids = updated.rows.map((row) => Number(row.id));
  if (ids.length > 0) await syncDraftSigners({ enrollmentIds: ids });
  return ids.length;
};

/** Supervisor asignado y nadie firmando su propia supervision. */
export const assertIndependentSigners = (record: SupervisionChecklistRecord): void => {
  if (record.enrollment_id && !record.supervisor_employee_id) {
    throwCoded('RH_SUPERVISION_SUPERVISOR_NOT_ASSIGNED', 'Asigna el supervisor de este colaborador en el puesto (bandeja Pendientes Fase 6) antes de firmar.');
  }
  if (record.supervisor_employee_id && record.supervisor_employee_id === record.employee_id) {
    throwCoded('RH_SUPERVISION_SELF_SUPERVISION', 'El colaborador evaluado no puede ser su propio supervisor.');
  }
  if (record.area_responsible_employee_id && record.area_responsible_employee_id === record.employee_id) {
    throwCoded(
      'RH_SUPERVISION_SELF_ENDORSEMENT',
      'El colaborador evaluado es el responsable de su area; otra persona debe firmar como Responsable del Area en esta lista.',
    );
  }
};

/** Colaborador ligado al usuario de la sesion (para "Mis supervisiones"). */
export const resolveEmployeeIdForUser = async (userId: string): Promise<number | null> => {
  const result = await pool.query(`SELECT id FROM public.employees WHERE user_id = $1 AND is_active = TRUE LIMIT 1;`, [userId]);
  return result.rows.length > 0 ? Number(result.rows[0].id) : null;
};
