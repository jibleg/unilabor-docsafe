import pool from '../config/db';
import { toIsoDate, toIsoDateTime } from '../utils/date-serialization';
import { SERVICE_KIND_LABELS, todayIso, windowState, type WindowState } from './helpdesk-maintenance-recurrence';

/**
 * Calendario unificado del Programa de Mantenimiento: ordenes de mantenimiento
 * (todas sus clases), calibraciones y solicitudes correctivas abiertas, en un
 * rango de fechas y con filtros resueltos en SQL (unidad, area, responsable,
 * categoria, criticidad, tipo, estado, busqueda). Incluye resumen y cobertura.
 */

export type CalendarEventKind =
  | 'PREVENTIVE'
  | 'VERIFICATION'
  | 'ELECTRICAL_SAFETY'
  | 'OTHER'
  | 'POST_REPAIR_VERIFICATION'
  | 'CALIBRATION'
  | 'CORRECTIVE';

export const CALENDAR_KIND_LABELS: Record<CalendarEventKind, string> = {
  ...SERVICE_KIND_LABELS,
  CALIBRATION: 'Calibracion',
  CORRECTIVE: 'Correctivo (ticket)',
};

export interface CalendarFilters {
  from: string;
  to: string;
  unitId?: number | null | undefined;
  areaId?: number | null | undefined;
  responsibleEmployeeId?: number | null | undefined;
  responsibleUserId?: string | null | undefined;
  categoryId?: number | null | undefined;
  criticalityId?: number | null | undefined;
  assetId?: number | null | undefined;
  kinds?: CalendarEventKind[] | undefined;
  statuses?: string[] | undefined;
  search?: string | null | undefined;
  /** Solo activos donde el usuario actual es operador o responsable. */
  mineUserId?: string | null | undefined;
}

export interface CalendarEvent {
  id: string;
  source: 'maintenance' | 'calibration' | 'ticket';
  source_id: number;
  kind: CalendarEventKind;
  kind_label: string;
  code: string;
  title: string;
  date: string;
  window_starts_on: string | null;
  window_ends_on: string | null;
  status: string;
  window_state: WindowState | null;
  is_projected: boolean;
  asset: {
    id: number;
    asset_code: string;
    name: string;
    category_name: string | null;
    unit_id: number | null;
    unit_name: string | null;
    area_id: number | null;
    area_name: string | null;
    criticality_code: string | null;
    criticality_name: string | null;
    responsible_employee_id: number | null;
    responsible_employee_name: string | null;
    assigned_employee_name: string | null;
    operational_status_name: string | null;
  };
  plan_code: string | null;
  plan_title: string | null;
  executor_kind: string | null;
  supplier_name: string | null;
  completed_at: string | null;
  result: string | null;
  ticket_id: number | null;
}

export interface CalendarSummary {
  total: number;
  overdue: number;
  due_soon: number;
  in_progress: number;
  pending_validation: number;
  closed_in_range: number;
  projected: number;
  compliance_pct: number | null;
}

export interface CoverageSummary {
  should_have: number;
  covered: number;
  gaps: number;
  coverage_pct: number | null;
  gap_assets: Array<{
    id: number;
    asset_code: string;
    name: string;
    category_name: string | null;
    unit_name: string | null;
    area_name: string | null;
    criticality_name: string | null;
    responsible_employee_name: string | null;
  }>;
}

export interface CalendarResponse {
  from: string;
  to: string;
  events: CalendarEvent[];
  summary: CalendarSummary;
}

const ASSET_JOINS = `
  INNER JOIN public.helpdesk_assets a ON a.id = %ASSET_ID%
  LEFT JOIN public.helpdesk_asset_categories ca ON ca.id = a.category_id
  LEFT JOIN public.helpdesk_asset_units un ON un.id = a.unit_id
  LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
  LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
  LEFT JOIN public.helpdesk_operational_statuses os ON os.id = a.operational_status_id
  LEFT JOIN public.employees re ON re.id = a.responsible_employee_id
  LEFT JOIN public.employees ae ON ae.id = a.assigned_employee_id
`;

const ASSET_COLUMNS = `
  a.id AS asset_id, a.asset_code, a.name AS asset_name, ca.name AS category_name,
  a.unit_id, un.name AS unit_name, a.area_id, ar.name AS area_name,
  cr.code AS criticality_code, cr.name AS criticality_name, os.name AS operational_status_name,
  a.responsible_employee_id, re.full_name AS responsible_employee_name, ae.full_name AS assigned_employee_name
`;

interface Built {
  clause: string;
  values: unknown[];
}

const buildAssetFilters = (filters: CalendarFilters, values: unknown[]): string[] => {
  const clauses: string[] = ['a.is_active = TRUE'];
  if (filters.unitId) {
    values.push(filters.unitId);
    clauses.push(`a.unit_id = $${values.length}`);
  }
  if (filters.areaId) {
    values.push(filters.areaId);
    clauses.push(`a.area_id = $${values.length}`);
  }
  if (filters.responsibleEmployeeId) {
    values.push(filters.responsibleEmployeeId);
    clauses.push(`(a.responsible_employee_id = $${values.length} OR a.assigned_employee_id = $${values.length})`);
  }
  if (filters.responsibleUserId) {
    values.push(filters.responsibleUserId);
    clauses.push(`a.area_id IN (SELECT rp.area_id FROM public.helpdesk_area_responsibles rp WHERE rp.user_id = $${values.length})`);
  }
  if (filters.mineUserId) {
    values.push(filters.mineUserId);
    clauses.push(
      `(a.responsible_employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = $${values.length})
        OR a.assigned_employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = $${values.length})
        OR a.area_id IN (SELECT rp.area_id FROM public.helpdesk_area_responsibles rp WHERE rp.user_id = $${values.length}))`,
    );
  }
  if (filters.categoryId) {
    values.push(filters.categoryId);
    clauses.push(`a.category_id = $${values.length}`);
  }
  if (filters.criticalityId) {
    values.push(filters.criticalityId);
    clauses.push(`a.criticality_id = $${values.length}`);
  }
  if (filters.assetId) {
    values.push(filters.assetId);
    clauses.push(`(a.id = $${values.length} OR a.parent_asset_id = $${values.length})`);
  }
  if (filters.search && filters.search.trim()) {
    values.push(`%${filters.search.trim()}%`);
    clauses.push(`(a.asset_code ILIKE $${values.length} OR a.name ILIKE $${values.length})`);
  }
  return clauses;
};

const buildMaintenanceQuery = (filters: CalendarFilters): Built => {
  const values: unknown[] = [filters.from, filters.to];
  const clauses = buildAssetFilters(filters, values);
  clauses.push('o.scheduled_for BETWEEN $1 AND $2');
  const kinds = (filters.kinds ?? []).filter((k) => k !== 'CALIBRATION' && k !== 'CORRECTIVE');
  if (filters.kinds && filters.kinds.length > 0) {
    if (kinds.length === 0) {
      return { clause: '', values: [] };
    }
    values.push(kinds);
    clauses.push(`o.service_kind = ANY($${values.length}::text[])`);
  }
  if (filters.statuses && filters.statuses.length > 0) {
    values.push(filters.statuses);
    clauses.push(`o.status = ANY($${values.length}::text[])`);
  }
  return {
    clause: `
      SELECT 'maintenance' AS source, o.id AS source_id, o.service_kind AS kind, o.order_code AS code,
             COALESCE(p.title, CASE WHEN o.service_kind = 'POST_REPAIR_VERIFICATION' THEN 'Verificacion post-reparacion' ELSE 'Mantenimiento' END) AS title,
             o.scheduled_for AS date, o.window_starts_on, o.window_ends_on, o.status, o.is_projected,
             p.plan_code, p.title AS plan_title, p.executor_kind, COALESCE(su.name, p.provider_name) AS supplier_name,
             o.completed_at, o.result, o.ticket_id,
             ${ASSET_COLUMNS}
        FROM public.helpdesk_maintenance_orders o
        LEFT JOIN public.helpdesk_maintenance_plans p ON p.id = o.plan_id
        LEFT JOIN public.helpdesk_suppliers su ON su.id = COALESCE(o.supplier_id, p.supplier_id)
        ${ASSET_JOINS.replace('%ASSET_ID%', 'o.asset_id')}
       WHERE ${clauses.join(' AND ')}
    `,
    values,
  };
};

const buildCalibrationQuery = (filters: CalendarFilters): Built => {
  if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes('CALIBRATION')) {
    return { clause: '', values: [] };
  }
  const values: unknown[] = [filters.from, filters.to];
  const clauses = buildAssetFilters(filters, values);
  clauses.push('o.scheduled_for BETWEEN $1 AND $2');
  if (filters.statuses && filters.statuses.length > 0) {
    values.push(filters.statuses);
    clauses.push(`o.status = ANY($${values.length}::text[])`);
  }
  return {
    clause: `
      SELECT 'calibration' AS source, o.id AS source_id, 'CALIBRATION' AS kind, o.order_code AS code,
             p.title, o.scheduled_for AS date, o.window_starts_on, o.window_ends_on, o.status, FALSE AS is_projected,
             p.plan_code, p.title AS plan_title, NULL AS executor_kind, COALESCE(o.provider_name, p.provider_name) AS supplier_name,
             o.completed_at, o.result, NULL::bigint AS ticket_id,
             ${ASSET_COLUMNS}
        FROM public.helpdesk_calibration_orders o
        INNER JOIN public.helpdesk_calibration_plans p ON p.id = o.plan_id
        ${ASSET_JOINS.replace('%ASSET_ID%', 'o.asset_id')}
       WHERE ${clauses.join(' AND ')}
    `,
    values,
  };
};

const buildTicketQuery = (filters: CalendarFilters): Built => {
  if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes('CORRECTIVE')) {
    return { clause: '', values: [] };
  }
  if (filters.statuses && filters.statuses.length > 0 && !filters.statuses.some((s) => s === 'OPEN' || s === 'CLOSED')) {
    return { clause: '', values: [] };
  }
  const values: unknown[] = [filters.from, filters.to];
  const clauses = buildAssetFilters(filters, values);
  clauses.push('t.is_active = TRUE');
  clauses.push('COALESCE(t.reported_at::date, t.created_at::date) BETWEEN $1 AND $2');
  clauses.push(`UPPER(COALESCE(rt.code, '')) IN ('CORRECTIVE_MAINTENANCE', 'REPAIR', 'FAILURE')`);
  return {
    clause: `
      SELECT 'ticket' AS source, t.id AS source_id, 'CORRECTIVE' AS kind, t.ticket_code AS code,
             t.title, COALESCE(t.reported_at::date, t.created_at::date) AS date,
             NULL::date AS window_starts_on, t.due_at::date AS window_ends_on,
             CASE WHEN st.is_closed THEN 'CLOSED' ELSE 'OPEN' END AS status, FALSE AS is_projected,
             NULL AS plan_code, rt.name AS plan_title, NULL AS executor_kind, t.provider_name AS supplier_name,
             t.closed_at AS completed_at, t.solution_summary AS result, t.id AS ticket_id,
             ${ASSET_COLUMNS}
        FROM public.helpdesk_tickets t
        LEFT JOIN public.helpdesk_request_types rt ON rt.id = t.request_type_id
        LEFT JOIN public.helpdesk_ticket_statuses st ON st.id = t.status_id
        ${ASSET_JOINS.replace('%ASSET_ID%', 't.asset_id')}
       WHERE ${clauses.join(' AND ')}
    `,
    values,
  };
};

const runBuilt = async (built: Built): Promise<any[]> => {
  if (!built.clause) {
    return [];
  }
  const result = await pool.query(built.clause, built.values);
  return result.rows;
};

const mapEvent = (row: any, today: string): CalendarEvent => {
  const status = String(row.status);
  const kind = String(row.kind) as CalendarEventKind;
  const windowStart = row.window_starts_on ? toIsoDate(row.window_starts_on) : null;
  const windowEnd = row.window_ends_on ? toIsoDate(row.window_ends_on) : null;
  return {
    id: `${row.source}-${row.source_id}`,
    source: row.source,
    source_id: Number(row.source_id),
    kind,
    kind_label: CALENDAR_KIND_LABELS[kind] ?? kind,
    code: String(row.code),
    title: String(row.title ?? ''),
    date: toIsoDate(row.date),
    window_starts_on: windowStart,
    window_ends_on: windowEnd,
    status,
    window_state: status === 'CLOSED' ? null : windowState(windowStart, windowEnd, today),
    is_projected: Boolean(row.is_projected),
    asset: {
      id: Number(row.asset_id),
      asset_code: String(row.asset_code),
      name: String(row.asset_name),
      category_name: row.category_name ? String(row.category_name) : null,
      unit_id: row.unit_id ? Number(row.unit_id) : null,
      unit_name: row.unit_name ? String(row.unit_name) : null,
      area_id: row.area_id ? Number(row.area_id) : null,
      area_name: row.area_name ? String(row.area_name) : null,
      criticality_code: row.criticality_code ? String(row.criticality_code) : null,
      criticality_name: row.criticality_name ? String(row.criticality_name) : null,
      responsible_employee_id: row.responsible_employee_id ? Number(row.responsible_employee_id) : null,
      responsible_employee_name: row.responsible_employee_name ? String(row.responsible_employee_name) : null,
      assigned_employee_name: row.assigned_employee_name ? String(row.assigned_employee_name) : null,
      operational_status_name: row.operational_status_name ? String(row.operational_status_name) : null,
    },
    plan_code: row.plan_code ? String(row.plan_code) : null,
    plan_title: row.plan_title ? String(row.plan_title) : null,
    executor_kind: row.executor_kind ? String(row.executor_kind) : null,
    supplier_name: row.supplier_name ? String(row.supplier_name) : null,
    completed_at: row.completed_at ? toIsoDateTime(row.completed_at) : null,
    result: row.result ? String(row.result) : null,
    ticket_id: row.ticket_id ? Number(row.ticket_id) : null,
  };
};

export const listCalendarEvents = async (filters: CalendarFilters): Promise<CalendarResponse> => {
  const today = todayIso();
  const [maintenance, calibration, tickets] = await Promise.all([
    runBuilt(buildMaintenanceQuery(filters)),
    runBuilt(buildCalibrationQuery(filters)),
    runBuilt(buildTicketQuery(filters)),
  ]);
  const events = [...maintenance, ...calibration, ...tickets].map((row) => mapEvent(row, today)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code.localeCompare(b.code)));

  const soonLimit = new Date(`${today}T00:00:00`);
  soonLimit.setDate(soonLimit.getDate() + 7);
  const soonIso = soonLimit.toISOString().slice(0, 10);
  const open = events.filter((e) => e.status !== 'CLOSED');
  const closed = events.filter((e) => e.status === 'CLOSED' && e.source !== 'ticket');
  // Cumplimiento del periodo: cerradas dentro de ventana entre las que ya
  // debieron ejecutarse (cerradas + abiertas con la ventana vencida).
  const dueSet = events.filter((e) => e.source !== 'ticket' && (e.status === 'CLOSED' || e.window_state === 'OVERDUE'));
  const closedOnTime = dueSet.filter(
    (e) => e.status === 'CLOSED' && (!e.window_ends_on || !e.completed_at || e.completed_at.slice(0, 10) <= e.window_ends_on),
  );
  const summary: CalendarSummary = {
    total: events.length,
    overdue: open.filter((e) => e.window_state === 'OVERDUE').length,
    due_soon: open.filter((e) => e.window_state !== 'OVERDUE' && e.date >= today && e.date <= soonIso).length,
    in_progress: open.filter((e) => e.status === 'IN_PROGRESS').length,
    pending_validation: open.filter((e) => e.status === 'PENDING_VALIDATION').length,
    closed_in_range: closed.length,
    projected: events.filter((e) => e.is_projected).length,
    compliance_pct: dueSet.length > 0 ? Math.min(100, Math.round((closedOnTime.length / dueSet.length) * 100)) : null,
  };
  return { from: filters.from, to: filters.to, events, summary };
};

/**
 * Cobertura: activos que deben tener programa (criticidad media o mayor, o sin
 * criticidad pero de una categoria de equipo) y no tienen rutina activa.
 */
export const getCoverage = async (filters: Omit<CalendarFilters, 'from' | 'to'>): Promise<CoverageSummary> => {
  const values: unknown[] = [];
  const clauses = buildAssetFilters({ ...filters, from: '', to: '' }, values);
  clauses.push('a.parent_asset_id IS NULL');
  clauses.push(`(UPPER(COALESCE(cr.code, '')) IN ('MEDIUM', 'HIGH', 'CRITICAL') OR (a.criticality_id IS NULL AND UPPER(COALESCE(ca.code, '')) IN ('EQL', 'EQC', 'EQR', 'LAB_EQUIPMENT', 'COMPUTING', 'REFRIGERATION', 'INFRASTRUCTURE')))`);
  const result = await pool.query(
    `
      SELECT a.id, a.asset_code, a.name, ca.name AS category_name, un.name AS unit_name, ar.name AS area_name,
             cr.name AS criticality_name, re.full_name AS responsible_employee_name,
             EXISTS (
               SELECT 1 FROM public.helpdesk_maintenance_plans p
                WHERE p.asset_id = a.id AND p.is_active = TRUE AND p.paused_at IS NULL
             ) AS covered
        FROM public.helpdesk_assets a
        LEFT JOIN public.helpdesk_asset_categories ca ON ca.id = a.category_id
        LEFT JOIN public.helpdesk_asset_units un ON un.id = a.unit_id
        LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
        LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
        LEFT JOIN public.employees re ON re.id = a.responsible_employee_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY covered ASC, cr.id DESC NULLS LAST, a.asset_code ASC;
    `,
    values,
  );
  const rows = result.rows;
  const covered = rows.filter((r) => Boolean(r.covered)).length;
  const gaps = rows.filter((r) => !r.covered);
  return {
    should_have: rows.length,
    covered,
    gaps: gaps.length,
    coverage_pct: rows.length > 0 ? Math.round((covered / rows.length) * 100) : null,
    gap_assets: gaps.slice(0, 500).map((r) => ({
      id: Number(r.id),
      asset_code: String(r.asset_code),
      name: String(r.name),
      category_name: r.category_name ? String(r.category_name) : null,
      unit_name: r.unit_name ? String(r.unit_name) : null,
      area_name: r.area_name ? String(r.area_name) : null,
      criticality_name: r.criticality_name ? String(r.criticality_name) : null,
      responsible_employee_name: r.responsible_employee_name ? String(r.responsible_employee_name) : null,
    })),
  };
};
