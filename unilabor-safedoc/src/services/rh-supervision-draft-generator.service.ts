import pool from '../config/db';
import { createSupervisionChecklist } from './rh-supervision-checklist.service';
import { syncDraftSigners } from './rh-supervision-signers.service';

// -----------------------------------------------------------------------------
// Generador de borradores ANA-REG-060 (Fase 6): por cada inscripcion ACTIVA de
// la Fase 6 sin lista (ni borrador, ni en firma, ni final cerrada) abre un borrador con el
// puesto como area evaluada, los N/A del puesto, la fecha del dia, el
// supervisor asignado a la inscripcion y el Responsable del Area que resuelve
// la configuracion (propio de la unidad del colaborador, general del area del
// proceso del puesto o su suplente). Nunca califica ni
// firma: eso lo hace el supervisor. Idempotente (corre en el cron de
// induccion y a peticion desde la UI).
// -----------------------------------------------------------------------------

export interface GenerateDraftsResult {
  created: number;
  already_had_list: number;
  failed: number;
  /** Areas cuyos borradores quedaron sin Responsable del Area (nadie valido en la configuracion). */
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
             AND (c.status IN ('DRAFT', 'PENDING_SIGNATURES') OR (c.status = 'CLOSED' AND c.is_final = TRUE))
        )
        ${filter}
      ORDER BY pa.sort_order NULLS LAST, emp.full_name, e.position_sequence;`,
    params,
  );
  const result: GenerateDraftsResult = { created: 0, already_had_list: 0, failed: 0, areas_without_signatories: [], positions_without_area: [], details: [] };
  const missingAreas = new Set<string>();
  const positionsWithoutArea = new Set<string>();
  for (const row of pending.rows) {
    const enrollmentId = Number(row.enrollment_id);
    if (!row.area_code) positionsWithoutArea.add(String(row.position_code));
    try {
      // El borrador nace ya sincronizado con el supervisor de la inscripcion y el responsable resuelto.
      const record = await createSupervisionChecklist({
        enrollmentId,
        supervisionDate: todayInMexico(),
        supervisorName: null,
        createdByUserId: actorUserId,
        reuseDraft: true,
      });
      if (row.area_code && !record.area_responsible_employee_id) missingAreas.add(String(row.area_name));
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

/**
 * Cron: abre los borradores que falten (silencioso salvo que cree alguno) y,
 * como red de seguridad, re-sincroniza los firmantes de todos los borradores
 * por si algun cambio (sucursal, baja, area del puesto) no disparo la suya.
 */
export const sweepSupervisionDrafts = async (): Promise<void> => {
  try {
    const exists = await pool.query(`SELECT to_regclass('public.rh_supervision_checklists') IS NOT NULL AS exists;`);
    if (!exists.rows[0]?.exists) return;
    const result = await generateSupervisionDrafts(null);
    if (result.created > 0 || result.failed > 0) {
      console.info(`ANA-REG-060: ${result.created} borrador(es) de Fase 6 abiertos automaticamente${result.failed ? `, ${result.failed} fallaron` : ''}.`);
    }
    const synced = await syncDraftSigners();
    if (synced > 0) {
      console.info(`ANA-REG-060: ${synced} borrador(es) actualizaron sus firmantes o su unidad en el barrido.`);
    }
  } catch (error) {
    console.error('No se pudieron generar los borradores ANA-REG-060 de la Fase 6:', error);
  }
};
