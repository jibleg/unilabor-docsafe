import pool from '../config/db';
import { createSupervisionChecklist } from './rh-supervision-checklist.service';

// -----------------------------------------------------------------------------
// Generador de borradores ANA-REG-060 (Fase 6): por cada inscripcion ACTIVA de
// la Fase 6 sin lista (ni borrador ni final cerrada) abre un borrador con el
// puesto como area evaluada, los N/A del puesto, la fecha del dia y los
// firmantes configurados para el area del colaborador. Nunca califica ni
// firma: eso lo hace el supervisor. Idempotente (corre en el cron de
// induccion y a peticion desde la UI).
// -----------------------------------------------------------------------------

const normalizeArea = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export interface SupervisionAreaSignatory {
  area_key: string;
  area_name: string;
  supervisor_name: string;
  supervisor_user_id: string | null;
  area_responsible_name: string;
  /** Colaboradores activos del area (para priorizar la captura). */
  employees: number;
  /** Inscripciones de Fase 6 activas sin acreditar en el area. */
  phase6_pending: number;
  configured: boolean;
}

/** Areas de los colaboradores activos (texto libre de su ficha) + firmantes configurados. */
export const listAreaSignatories = async (): Promise<SupervisionAreaSignatory[]> => {
  const result = await pool.query(
    `WITH areas AS (
       SELECT lower(regexp_replace(trim(emp.area), '\\s+', ' ', 'g')) AS area_key,
              min(trim(emp.area)) AS area_name,
              count(*) AS employees,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM public.rh_induction_enrollments e
                  JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
                  LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
                 WHERE e.employee_id = emp.id AND e.queue_status = 'ACTIVE' AND (ea.status IS NULL OR ea.status <> 'passed')
              )) AS phase6_pending
         FROM public.employees emp
        WHERE emp.is_active = TRUE AND emp.area IS NOT NULL AND trim(emp.area) <> ''
        GROUP BY 1
     )
     SELECT COALESCE(a.area_key, s.area_key) AS area_key, COALESCE(a.area_name, s.area_name) AS area_name,
            COALESCE(s.supervisor_name, '') AS supervisor_name, s.supervisor_user_id,
            COALESCE(s.area_responsible_name, '') AS area_responsible_name,
            COALESCE(a.employees, 0) AS employees, COALESCE(a.phase6_pending, 0) AS phase6_pending,
            s.area_key IS NOT NULL AS configured
       FROM areas a
       FULL OUTER JOIN public.rh_supervision_area_signatories s ON s.area_key = a.area_key
      ORDER BY COALESCE(a.phase6_pending, 0) DESC, COALESCE(a.area_name, s.area_name) ASC;`,
  );
  return result.rows.map((row) => ({
    area_key: String(row.area_key),
    area_name: String(row.area_name),
    supervisor_name: String(row.supervisor_name ?? ''),
    supervisor_user_id: row.supervisor_user_id ? String(row.supervisor_user_id) : null,
    area_responsible_name: String(row.area_responsible_name ?? ''),
    employees: Number(row.employees ?? 0),
    phase6_pending: Number(row.phase6_pending ?? 0),
    configured: Boolean(row.configured),
  }));
};

export interface AreaSignatoryInput {
  area_name: string;
  supervisor_name: string;
  area_responsible_name: string;
}

export const saveAreaSignatories = async (rows: AreaSignatoryInput[], actorUserId: string | null): Promise<SupervisionAreaSignatory[]> => {
  for (const row of rows) {
    const key = normalizeArea(row.area_name);
    if (!key) continue;
    await pool.query(
      `INSERT INTO public.rh_supervision_area_signatories (area_key, area_name, supervisor_name, area_responsible_name, updated_by_user_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (area_key) DO UPDATE
         SET area_name = EXCLUDED.area_name, supervisor_name = EXCLUDED.supervisor_name,
             area_responsible_name = EXCLUDED.area_responsible_name, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW();`,
      [key, row.area_name.trim(), row.supervisor_name.trim(), row.area_responsible_name.trim(), actorUserId],
    );
  }
  return listAreaSignatories();
};

export interface GenerateDraftsResult {
  created: number;
  already_had_list: number;
  failed: number;
  /** Areas sin firmantes configurados que recibieron borradores (se abren con los nombres vacios). */
  areas_without_signatories: string[];
  details: Array<{ enrollment_id: number; employee_name: string; position_code: string; checklist_id: number | null; message: string }>;
}

const todayInMexico = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

/**
 * Abre un borrador por cada inscripcion activa de Fase 6 que no tenga lista
 * (ni borrador ni cerrada final). Devuelve el resumen; nunca lanza por una
 * inscripcion: la anota en `details` y sigue con la siguiente.
 */
export const generateSupervisionDrafts = async (actorUserId: string | null, employeeIds?: number[]): Promise<GenerateDraftsResult> => {
  const params: unknown[] = [];
  let filter = '';
  if (employeeIds && employeeIds.length > 0) {
    params.push(employeeIds);
    filter = `AND e.employee_id = ANY($1::bigint[])`;
  }
  const pending = await pool.query(
    `SELECT e.id AS enrollment_id, e.employee_id, emp.full_name, emp.area, rp.code AS position_code
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
       JOIN public.employees emp ON emp.id = e.employee_id AND emp.is_active = TRUE
       JOIN public.rh_positions rp ON rp.id = e.position_id
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.queue_status = 'ACTIVE' AND (ea.status IS NULL OR ea.status <> 'passed')
        AND NOT EXISTS (
          SELECT 1 FROM public.rh_supervision_checklists c
           WHERE c.enrollment_id = e.id AND (c.status = 'DRAFT' OR (c.status = 'CLOSED' AND c.is_final = TRUE))
        )
        ${filter}
      ORDER BY emp.area NULLS LAST, emp.full_name, e.position_sequence;`,
    params,
  );
  const signatories = new Map((await listAreaSignatories()).filter((s) => s.configured).map((s) => [s.area_key, s]));
  const result: GenerateDraftsResult = { created: 0, already_had_list: 0, failed: 0, areas_without_signatories: [], details: [] };
  const missingAreas = new Set<string>();
  for (const row of pending.rows) {
    const enrollmentId = Number(row.enrollment_id);
    const areaKey = normalizeArea(row.area);
    const signatory = areaKey ? signatories.get(areaKey) : undefined;
    if (!signatory && row.area) missingAreas.add(String(row.area).trim());
    try {
      const record = await createSupervisionChecklist({
        enrollmentId,
        supervisionDate: todayInMexico(),
        supervisorName: signatory?.supervisor_name || null,
        areaResponsibleName: signatory?.area_responsible_name || null,
        createdByUserId: actorUserId,
        reuseDraft: true,
      });
      result.created += 1;
      result.details.push({ enrollment_id: enrollmentId, employee_name: String(row.full_name), position_code: String(row.position_code), checklist_id: record.id, message: `Borrador ${record.folio} abierto.` });
    } catch (error: any) {
      result.failed += 1;
      result.details.push({ enrollment_id: enrollmentId, employee_name: String(row.full_name), position_code: String(row.position_code), checklist_id: null, message: error?.publicMessage || 'No se pudo abrir el borrador.' });
    }
  }
  const withList = await pool.query(
    `SELECT count(*) AS total FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
      WHERE e.queue_status = 'ACTIVE' AND EXISTS (SELECT 1 FROM public.rh_supervision_checklists c WHERE c.enrollment_id = e.id);`,
  );
  result.already_had_list = Math.max(0, Number(withList.rows[0]?.total ?? 0) - result.created);
  result.areas_without_signatories = [...missingAreas].sort();
  return result;
};

/** Cron: abre los borradores que falten (silencioso salvo que cree alguno). */
export const sweepSupervisionDrafts = async (): Promise<void> => {
  try {
    const exists = await pool.query(`SELECT to_regclass('public.rh_supervision_checklists') IS NOT NULL AS exists;`);
    if (!exists.rows[0]?.exists) return;
    const result = await generateSupervisionDrafts(null);
    if (result.created > 0 || result.failed > 0) {
      console.info(`ANA-REG-060: ${result.created} borrador(es) de Fase 6 abiertos automaticamente${result.failed ? `, ${result.failed} fallaron` : ''}.`);
    }
  } catch (error) {
    console.error('No se pudieron generar los borradores ANA-REG-060 de la Fase 6:', error);
  }
};
