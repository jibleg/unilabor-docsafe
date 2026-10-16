import pool from '../config/db';
import { withTransaction } from '../utils/transaction';

// -----------------------------------------------------------------------------
// ANA-REG-060 por puesto: (a) items que NO aplican a cada puesto (Calidad/RH
// los preconfigura; al abrir una lista quedan en N/A, editables) y (b) la
// bandeja de colaboradores con la Fase 6 en curso que aun no tienen su lista
// final cerrada, agrupable por area para aplicarla en lote.
// -----------------------------------------------------------------------------

export interface PositionSupervisionConfig {
  position_id: number;
  /** Ids de items marcados como "no aplica" para el puesto. */
  na_item_ids: number[];
}

export const getPositionSupervisionConfig = async (positionId: number): Promise<PositionSupervisionConfig> => {
  const result = await pool.query(`SELECT item_id FROM public.rh_position_supervision_na_items WHERE position_id = $1 ORDER BY item_id;`, [
    positionId,
  ]);
  return { position_id: positionId, na_item_ids: result.rows.map((row) => Number(row.item_id)) };
};

/** Reemplaza el conjunto de items "no aplica" del puesto (idempotente). */
export const setPositionSupervisionConfig = async (positionId: number, naItemIds: number[]): Promise<PositionSupervisionConfig> => {
  const unique = [...new Set(naItemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM public.rh_position_supervision_na_items WHERE position_id = $1;`, [positionId]);
    for (const itemId of unique) {
      await client.query(
        `INSERT INTO public.rh_position_supervision_na_items (position_id, item_id)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM public.rh_supervision_form_items WHERE id = $2 AND is_active = TRUE)
         ON CONFLICT DO NOTHING;`,
        [positionId, itemId],
      );
    }
  });
  return getPositionSupervisionConfig(positionId);
};

// --- Bandeja de la Fase 6 -----------------------------------------------------

export interface SupervisionPendingRow {
  enrollment_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  area: string | null;
  branch_name: string | null;
  position_id: number;
  position_code: string;
  position_name: string;
  activated_at: string | null;
  /** Estado de la evaluacion practica de la inscripcion (null = sin capturar). */
  evaluation_status: string | null;
  evaluation_percentage: number | null;
  /** Borrador abierto de esta inscripcion (para "continuar"). */
  draft_checklist_id: number | null;
  /** Listas cerradas de la inscripcion y % de la ultima. */
  closed_count: number;
  last_closed_pct: number | null;
  days_in_phase: number | null;
}

export interface SupervisionPendingQuery {
  search?: string | undefined;
  area?: string | undefined;
  /** true = tambien las ya acreditadas (para correcciones). Default: solo pendientes. */
  includePassed?: boolean | undefined;
}

export const listSupervisionPending = async (query: SupervisionPendingQuery = {}): Promise<SupervisionPendingRow[]> => {
  const clauses: string[] = [`e.queue_status = 'ACTIVE'`, `emp.is_active = TRUE`];
  const params: unknown[] = [];
  if (!query.includePassed) {
    clauses.push(`(ea.status IS NULL OR ea.status <> 'passed')`);
  }
  if (query.area?.trim()) {
    params.push(query.area.trim());
    clauses.push(`LOWER(COALESCE(emp.area, '')) = LOWER($${params.length})`);
  }
  if (query.search?.trim()) {
    params.push(`%${query.search.trim()}%`);
    const n = `$${params.length}`;
    clauses.push(`(emp.full_name ILIKE ${n} OR emp.employee_code ILIKE ${n} OR rp.code ILIKE ${n} OR rp.name ILIKE ${n} OR COALESCE(emp.area, '') ILIKE ${n})`);
  }
  const result = await pool.query(
    `SELECT e.id AS enrollment_id, e.employee_id, emp.full_name, emp.employee_code, emp.area, bu.name AS branch_name,
            e.position_id, rp.code AS position_code, rp.name AS position_name, e.activated_at,
            ea.status AS evaluation_status, ea.percentage AS evaluation_percentage,
            d.id AS draft_checklist_id, COALESCE(cl.closed_count, 0) AS closed_count, cl.last_closed_pct,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(e.activated_at, e.created_at))) / 86400 AS days_in_phase
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
       JOIN public.employees emp ON emp.id = e.employee_id
       JOIN public.rh_positions rp ON rp.id = e.position_id
       LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
       LEFT JOIN LATERAL (
         SELECT id FROM public.rh_supervision_checklists WHERE enrollment_id = e.id AND status = 'DRAFT' ORDER BY id DESC LIMIT 1
       ) d ON TRUE
       LEFT JOIN LATERAL (
         SELECT count(*) AS closed_count,
                (SELECT compliance_pct FROM public.rh_supervision_checklists WHERE enrollment_id = e.id AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT 1) AS last_closed_pct
           FROM public.rh_supervision_checklists WHERE enrollment_id = e.id AND status = 'CLOSED'
       ) cl ON TRUE
      WHERE ${clauses.join(' AND ')}
      ORDER BY COALESCE(emp.area, 'zzz') ASC, emp.full_name ASC, e.position_sequence ASC;`,
    params,
  );
  return result.rows.map((row) => ({
    enrollment_id: Number(row.enrollment_id),
    employee_id: Number(row.employee_id),
    employee_name: String(row.full_name),
    employee_code: String(row.employee_code),
    area: row.area ? String(row.area) : null,
    branch_name: row.branch_name ? String(row.branch_name) : null,
    position_id: Number(row.position_id),
    position_code: String(row.position_code),
    position_name: String(row.position_name),
    activated_at: row.activated_at ? new Date(row.activated_at).toISOString() : null,
    evaluation_status: row.evaluation_status ? String(row.evaluation_status) : null,
    evaluation_percentage: row.evaluation_percentage === null || row.evaluation_percentage === undefined ? null : Number(row.evaluation_percentage),
    draft_checklist_id: row.draft_checklist_id ? Number(row.draft_checklist_id) : null,
    closed_count: Number(row.closed_count ?? 0),
    last_closed_pct: row.last_closed_pct === null || row.last_closed_pct === undefined ? null : Number(row.last_closed_pct),
    days_in_phase: row.days_in_phase === null || row.days_in_phase === undefined ? null : Math.round(Number(row.days_in_phase) * 10) / 10,
  }));
};
