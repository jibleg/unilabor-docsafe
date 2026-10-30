import pool from '../config/db';
import { createSupervisionChecklist } from './rh-supervision-checklist.service';
import { syncDraftSigners } from './rh-supervision-signers.service';

// -----------------------------------------------------------------------------
// Generador de borradores ANA-REG-060 (Fase 6): por cada inscripcion ACTIVA de
// la Fase 6 sin lista (ni borrador ni final cerrada) abre un borrador con el
// puesto como area evaluada, los N/A del puesto, la fecha del dia, el
// supervisor asignado a la inscripcion y el responsable configurado para el
// AREA DEL PROCESO que rige el puesto (Preanalitica, Analitica, Posanalitica,
// Administracion). Nunca califica ni
// firma: eso lo hace el supervisor. Idempotente (corre en el cron de
// induccion y a peticion desde la UI).
// -----------------------------------------------------------------------------

export interface SupervisionAreaSignatory {
  /** Codigo del area del proceso (PRE, ANA, POS, ADM). */
  area_key: string;
  area_name: string;
  /** Colaborador que firma como Responsable del Area (avala las listas del area). */
  area_responsible_employee_id: number | null;
  area_responsible_name: string;
  /** Puestos activos que rige el area. */
  positions: number;
  /** Colaboradores activos con al menos un puesto del area. */
  employees: number;
  /** Inscripciones de Fase 6 activas sin acreditar en puestos del area. */
  phase6_pending: number;
  configured: boolean;
}

/** Las 4 areas del proceso con sus firmantes configurados y la carga pendiente. */
export const listAreaSignatories = async (): Promise<SupervisionAreaSignatory[]> => {
  const result = await pool.query(
    `SELECT pa.code AS area_key, pa.name AS area_name,
            s.area_responsible_employee_id, COALESCE(resp.full_name, s.area_responsible_name, '') AS area_responsible_name,
            (SELECT count(*) FROM public.rh_positions rp WHERE rp.process_area_id = pa.id AND rp.is_active) AS positions,
            (SELECT count(DISTINCT ep.employee_id)
               FROM public.rh_employee_positions ep
               JOIN public.rh_positions rp ON rp.id = ep.position_id AND rp.process_area_id = pa.id
               JOIN public.employees emp ON emp.id = ep.employee_id AND emp.is_active
              WHERE ep.is_active) AS employees,
            (SELECT count(*)
               FROM public.rh_induction_enrollments e
               JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
               JOIN public.rh_positions rp ON rp.id = e.position_id AND rp.process_area_id = pa.id
               LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
              WHERE e.queue_status = 'ACTIVE' AND (ea.status IS NULL OR ea.status <> 'passed')) AS phase6_pending,
            s.area_key IS NOT NULL AS configured
       FROM public.rh_process_areas pa
       LEFT JOIN public.rh_supervision_area_signatories s ON s.area_key = pa.code
       LEFT JOIN public.employees resp ON resp.id = s.area_responsible_employee_id
      WHERE pa.is_active
      ORDER BY pa.sort_order ASC;`,
  );
  return result.rows.map((row) => ({
    area_key: String(row.area_key),
    area_name: String(row.area_name),
    area_responsible_employee_id: row.area_responsible_employee_id ? Number(row.area_responsible_employee_id) : null,
    area_responsible_name: String(row.area_responsible_name ?? ''),
    positions: Number(row.positions ?? 0),
    employees: Number(row.employees ?? 0),
    phase6_pending: Number(row.phase6_pending ?? 0),
    configured: Boolean(row.area_responsible_employee_id),
  }));
};

export interface AreaSignatoryInput {
  area_key: string;
  area_responsible_employee_id: number | null;
}

export const saveAreaSignatories = async (rows: AreaSignatoryInput[], actorUserId: string | null): Promise<SupervisionAreaSignatory[]> => {
  for (const row of rows) {
    const area = await pool.query(`SELECT code, name FROM public.rh_process_areas WHERE code = $1 AND is_active LIMIT 1;`, [row.area_key.trim().toUpperCase()]);
    if (area.rows.length === 0) continue;
    const responsible = row.area_responsible_employee_id
      ? await pool.query(`SELECT full_name FROM public.employees WHERE id = $1 AND is_active LIMIT 1;`, [row.area_responsible_employee_id])
      : null;
    const responsibleId = responsible && responsible.rows.length > 0 ? row.area_responsible_employee_id : null;
    const code = String(area.rows[0].code);
    await pool.query(
      `INSERT INTO public.rh_supervision_area_signatories
         (area_key, area_name, area_responsible_employee_id, area_responsible_name, updated_by_user_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (area_key) DO UPDATE
         SET area_name = EXCLUDED.area_name, area_responsible_employee_id = EXCLUDED.area_responsible_employee_id,
             area_responsible_name = EXCLUDED.area_responsible_name, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW();`,
      [code, String(area.rows[0].name), responsibleId, String(responsible?.rows[0]?.full_name ?? ''), actorUserId],
    );
    await syncDraftSigners({ areaCode: code });
  }
  return listAreaSignatories();
};

export interface GenerateDraftsResult {
  created: number;
  already_had_list: number;
  failed: number;
  /** Areas sin firmantes configurados que recibieron borradores (se abren con los nombres vacios). */
  areas_without_signatories: string[];
  /** Puestos sin area del proceso asignada que recibieron borradores (sin firmantes). */
  positions_without_area: string[];
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
    `SELECT e.id AS enrollment_id, e.employee_id, emp.full_name, rp.code AS position_code,
            pa.code AS area_code, pa.name AS area_name
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
       JOIN public.employees emp ON emp.id = e.employee_id AND emp.is_active = TRUE
       JOIN public.rh_positions rp ON rp.id = e.position_id
       LEFT JOIN public.rh_process_areas pa ON pa.id = rp.process_area_id
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.queue_status = 'ACTIVE' AND (ea.status IS NULL OR ea.status <> 'passed')
        AND NOT EXISTS (
          SELECT 1 FROM public.rh_supervision_checklists c
           WHERE c.enrollment_id = e.id
             AND (c.status IN ('DRAFT', 'SUPERVISOR_SIGNED') OR (c.status = 'CLOSED' AND c.is_final = TRUE))
        )
        ${filter}
      ORDER BY pa.sort_order NULLS LAST, emp.full_name, e.position_sequence;`,
    params,
  );
  const signatories = new Map((await listAreaSignatories()).filter((s) => s.configured).map((s) => [s.area_key, s]));
  const result: GenerateDraftsResult = { created: 0, already_had_list: 0, failed: 0, areas_without_signatories: [], positions_without_area: [], details: [] };
  const missingAreas = new Set<string>();
  const positionsWithoutArea = new Set<string>();
  for (const row of pending.rows) {
    const enrollmentId = Number(row.enrollment_id);
    const signatory = row.area_code ? signatories.get(String(row.area_code)) : undefined;
    if (!row.area_code) positionsWithoutArea.add(String(row.position_code));
    else if (!signatory) missingAreas.add(String(row.area_name));
    try {
      const record = await createSupervisionChecklist({
        enrollmentId,
        supervisionDate: todayInMexico(),
        supervisorName: null,
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
  result.positions_without_area = [...positionsWithoutArea].sort();
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
