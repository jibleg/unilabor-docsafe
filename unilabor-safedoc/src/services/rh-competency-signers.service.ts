import pool from '../config/db';

// -----------------------------------------------------------------------------
// Firmantes institucionales sugeridos para cerrar un REH-REG-003:
//   * Coordinador del area: el Responsable del Area configurado para el area
//     del proceso del puesto evaluado (Firmantes por area, mismo dato de la Fase 6).
//   * Coordinador de RH: quien ocupa el puesto CRH.
//   * Director General: quien ocupa el puesto DG.
// Son sugerencias: RH puede cambiarlas al cerrar. Nunca se sugiere al evaluado.
// -----------------------------------------------------------------------------

/** Titulo y cargo con que firma la autorizacion institucional (sello del REH-REG-003). */
export const DIRECTOR_GENERAL_TITLE = 'Q.F.B.';
export const DIRECTOR_GENERAL_ROLE = 'Director General';

/**
 * Quien autoriza institucionalmente: el Director General que firmo el
 * REH-REG-003 (con su titulo). La cuenta que pulso "Autorizar" queda en
 * authorized_by_user_id y en la auditoria, no en el documento.
 */
export const authorizationSignerLabel = (record: { director_signatory_name: string | null; authorized_by_name: string | null }): string | null =>
  record.director_signatory_name?.trim()
    ? `${DIRECTOR_GENERAL_TITLE} ${record.director_signatory_name.trim()} - ${DIRECTOR_GENERAL_ROLE}`
    : record.authorized_by_name;

export interface CompetencySuggestedSigners {
  area: string | null;
  rh: string | null;
  director: string | null;
}

const holderOf = async (positionCode: string, excludeEmployeeId: number): Promise<string | null> => {
  const result = await pool.query(
    `SELECT e.full_name
       FROM public.rh_employee_positions ep
       JOIN public.rh_positions rp ON rp.id = ep.position_id AND upper(rp.code) = $1
       JOIN public.employees e ON e.id = ep.employee_id AND e.is_active = TRUE
      WHERE ep.is_active = TRUE AND e.id <> $2
      ORDER BY ep.assigned_at ASC
      LIMIT 1;`,
    [positionCode, excludeEmployeeId],
  );
  return result.rows[0]?.full_name ? String(result.rows[0].full_name) : null;
};

export const getCompetencySuggestedSigners = async (evaluationId: number): Promise<CompetencySuggestedSigners | null> => {
  const evaluation = await pool.query(
    `SELECT ce.employee_id, resp.id AS responsible_id, resp.full_name AS responsible_name
       FROM public.rh_competency_evaluations ce
       JOIN public.rh_positions rp ON rp.id = ce.position_id
       LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
       LEFT JOIN public.rh_supervision_area_signatories s ON s.area_key = pa.code
       LEFT JOIN public.employees resp ON resp.id = s.area_responsible_employee_id AND resp.is_active = TRUE
      WHERE ce.id = $1 LIMIT 1;`,
    [evaluationId],
  );
  const row = evaluation.rows[0];
  if (!row) return null;
  const employeeId = Number(row.employee_id);
  const area = row.responsible_id && Number(row.responsible_id) !== employeeId ? String(row.responsible_name) : null;
  const [rh, director] = await Promise.all([holderOf('CRH', employeeId), holderOf('DG', employeeId)]);
  return { area, rh, director };
};
