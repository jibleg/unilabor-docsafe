import pool from '../config/db';
import { toIsoDate, toIsoDateTime } from '../utils/date-serialization';
import { withTransaction, type Queryable } from '../utils/transaction';
import type { HelpdeskCatalogItem } from './helpdesk-asset.service';
import { computeWindow, requiresResponsibleSignature, todayIso, windowState, type MaintenanceExecutorKind, type MaintenanceServiceKind, type WindowState } from './helpdesk-maintenance-recurrence';
import { ensurePlanProjection, insertScheduledOrder, resyncPlanNextDue } from './helpdesk-maintenance-projection.service';
import {
  PaginatedResult,
  PaginationInput,
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';

export type MaintenanceScheduleMode = 'FREQUENCY' | 'CALENDAR';

export interface HelpdeskMaintenancePlanPayload {
  asset_id: number;
  frequency_id?: number | null;
  schedule_mode?: MaintenanceScheduleMode;
  responsible_employee_id?: number | null;
  quality_document_id?: string | null;
  title: string;
  description?: string | null;
  provider_name?: string | null;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days?: number;
  tolerance_after_days?: number;
  checklist_required?: boolean;
  evidence_required?: boolean;
  tasks?: string[];
}

export interface HelpdeskMaintenancePlanRecord extends Omit<HelpdeskMaintenancePlanPayload, 'tasks'> {
  id: number;
  plan_code: string;
  schedule_mode: MaintenanceScheduleMode;
  is_active: boolean;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  asset?: {
    id: number;
    asset_code: string;
    name: string;
  } | null;
  frequency?: (HelpdeskCatalogItem & { interval_months?: number }) | null;
  responsible_employee?: {
    id: number;
    employee_code: string;
    full_name: string;
    area: string | null;
    position: string | null;
  } | null;
  quality_document?: {
    id: string;
    title: string;
    filename: string | null;
  } | null;
  tasks: Array<{
    id: number;
    task_text: string;
    is_required: boolean;
    sort_order: number;
  }>;
  orders: Array<{
    id: number;
    order_code: string;
    scheduled_for: string;
    window_starts_on: string | null;
    window_ends_on: string | null;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
    result?: string | null;
  }>;
}

export interface HelpdeskMaintenanceCatalogs {
  frequencies: Array<HelpdeskCatalogItem & { interval_months: number }>;
}

export interface HelpdeskMaintenanceOrderChecklistPayload {
  plan_task_id?: number | null;
  task_text: string;
  result: string;
  notes?: string | null;
}

export interface HelpdeskMaintenanceOrderClosePayload {
  completed_at: string;
  performed_activities: string;
  result: string;
  findings?: string | null;
  provider_name?: string | null;
  evidence_notes?: string | null;
  checklist?: HelpdeskMaintenanceOrderChecklistPayload[];
}

export interface HelpdeskMaintenanceOrderReschedulePayload {
  scheduled_for: string;
  reschedule_reason: string;
}

export interface HelpdeskMaintenanceOrderRecord {
  id: number;
  order_code: string;
  plan_id: number | null;
  asset_id: number;
  scheduled_for: string;
  window_starts_on: string | null;
  window_ends_on: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
  performed_activities: string | null;
  findings: string | null;
  provider_name: string | null;
  result: string | null;
  evidence_notes: string | null;
  rescheduled_from: string | null;
  rescheduled_at: string | null;
  reschedule_reason: string | null;
  // Programa de mantenimiento (20260922_02)
  is_projected: boolean;
  program_version: number | null;
  service_kind: MaintenanceServiceKind;
  executor_kind: MaintenanceExecutorKind;
  checklist_required: boolean;
  evidence_required: boolean;
  requires_responsible_signature: boolean;
  window_state: WindowState | null;
  ticket_id: number | null;
  ticket_code: string | null;
  derived_ticket_id: number | null;
  derived_ticket_code: string | null;
  executed_by_employee_id: number | null;
  executed_by_employee_name: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  downtime_minutes: number | null;
  has_technician_signature: boolean;
  has_responsible_signature: boolean;
  validated_at: string | null;
  validated_by_user_id: string | null;
  lifecycle_event_id: number | null;
  constancia_document_id: number | null;
  created_at?: string;
  updated_at?: string;
  plan?: {
    id: number;
    plan_code: string;
    title: string;
    schedule_mode: MaintenanceScheduleMode;
    frequency_id: number | null;
    interval_months: number | null;
    tolerance_before_days: number;
    tolerance_after_days: number;
    anchor_mode: 'FIXED' | 'FLOATING';
  } | null;
  asset?: {
    id: number;
    asset_code: string;
    name: string;
    criticality_code: string | null;
    criticality_name: string | null;
    unit_name: string | null;
    area_name: string | null;
    category_name: string | null;
    responsible_employee_id: number | null;
    responsible_employee_name: string | null;
    assigned_employee_id: number | null;
    assigned_employee_name: string | null;
  } | null;
  checklist: Array<{
    id: number;
    plan_task_id: number | null;
    task_text: string;
    result: string;
    notes: string | null;
    sort_order: number;
  }>;
}

const maintenanceTableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.helpdesk_maintenance_plans') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const assertMaintenanceTables = async () => {
  const exists = await maintenanceTableExists();
  if (!exists) {
    const error = new Error('HELPDESK_MAINTENANCE_TABLES_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_MAINTENANCE_TABLES_NOT_AVAILABLE';
    throw error;
  }
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const normalizeScheduleMode = (value: unknown): MaintenanceScheduleMode =>
  value === 'CALENDAR' ? 'CALENDAR' : 'FREQUENCY';

const generatePlanCode = async (): Promise<string> => {
  // nextval es atomico: no colisiona aunque dos solicitudes lleguen a la vez.
  const result = await pool.query(`SELECT nextval('public.helpdesk_maintenance_plan_code_seq') AS next_id;`);
  return `MP-${String(Number(result.rows[0]?.next_id ?? 0)).padStart(6, '0')}`;
};

const generateOrderCode = async (): Promise<string> => {
  // nextval es atomico: no colisiona aunque dos solicitudes lleguen a la vez.
  const result = await pool.query(`SELECT nextval('public.helpdesk_maintenance_order_code_seq') AS next_id;`);
  return `OM-${String(Number(result.rows[0]?.next_id ?? 0)).padStart(6, '0')}`;
};

const addDays = (dateValue: string, days: number): string => {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const addMonths = (dateValue: string, months: number): string => {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
};


const buildPlanQuery = () => `
  SELECT
    p.*,
    a.asset_code,
    a.name AS asset_name,
    f.code AS frequency_code,
    f.name AS frequency_name,
    f.description AS frequency_description,
    f.interval_months,
    e.employee_code AS responsible_employee_code,
    e.full_name AS responsible_employee_name,
    e.area AS responsible_employee_area,
    e.position AS responsible_employee_position,
    d.title AS quality_document_title,
    d.file_path AS quality_document_filename
  FROM public.helpdesk_maintenance_plans p
  LEFT JOIN public.helpdesk_assets a ON a.id = p.asset_id
  LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = p.frequency_id
  LEFT JOIN public.employees e ON e.id = p.responsible_employee_id
  LEFT JOIN public.documents d ON d.id = p.quality_document_id
`;

const listPlanTasks = async (planId: number): Promise<HelpdeskMaintenancePlanRecord['tasks']> => {
  const result = await pool.query(
    `
      SELECT id, task_text, is_required, sort_order
      FROM public.helpdesk_maintenance_plan_tasks
      WHERE plan_id = $1
      ORDER BY sort_order ASC, id ASC;
    `,
    [planId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    task_text: String(row.task_text),
    is_required: Boolean(row.is_required),
    sort_order: Number(row.sort_order ?? 0),
  }));
};

const listPlanOrders = async (planId: number): Promise<HelpdeskMaintenancePlanRecord['orders']> => {
  const result = await pool.query(
    `
      SELECT id, order_code, scheduled_for, window_starts_on, window_ends_on, status
           , started_at, completed_at, result
      FROM public.helpdesk_maintenance_orders
      WHERE plan_id = $1
      ORDER BY scheduled_for ASC, id ASC;
    `,
    [planId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    order_code: String(row.order_code),
    scheduled_for: row.scheduled_for ? toIsoDate(row.scheduled_for) : '',
    window_starts_on: row.window_starts_on ? toIsoDate(row.window_starts_on) : null,
    window_ends_on: row.window_ends_on ? toIsoDate(row.window_ends_on) : null,
    status: String(row.status),
    started_at: row.started_at ? toIsoDateTime(row.started_at) : null,
    completed_at: row.completed_at ? toIsoDateTime(row.completed_at) : null,
    result: row.result ? String(row.result) : null,
  }));
};

const buildOrderQuery = () => `
  SELECT
    o.*,
    p.plan_code,
    p.title AS plan_title,
    p.schedule_mode,
    p.frequency_id,
    p.tolerance_before_days,
    p.tolerance_after_days,
    p.anchor_mode,
    p.executor_kind,
    p.checklist_required,
    p.evidence_required,
    f.interval_months,
    a.asset_code,
    a.name AS asset_name,
    a.responsible_employee_id AS asset_responsible_employee_id,
    a.assigned_employee_id AS asset_assigned_employee_id,
    cr.code AS criticality_code,
    cr.name AS criticality_name,
    un.name AS unit_name,
    ar.name AS area_name,
    ca.name AS category_name,
    re.full_name AS responsible_employee_name,
    ae.full_name AS assigned_employee_name,
    ex.full_name AS executed_by_employee_name,
    su.name AS supplier_name,
    t.ticket_code,
    dt.ticket_code AS derived_ticket_code
  FROM public.helpdesk_maintenance_orders o
  LEFT JOIN public.helpdesk_maintenance_plans p ON p.id = o.plan_id
  INNER JOIN public.helpdesk_assets a ON a.id = o.asset_id
  LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = p.frequency_id
  LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
  LEFT JOIN public.helpdesk_asset_units un ON un.id = a.unit_id
  LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
  LEFT JOIN public.helpdesk_asset_categories ca ON ca.id = a.category_id
  LEFT JOIN public.employees re ON re.id = a.responsible_employee_id
  LEFT JOIN public.employees ae ON ae.id = a.assigned_employee_id
  LEFT JOIN public.employees ex ON ex.id = o.executed_by_employee_id
  LEFT JOIN public.helpdesk_suppliers su ON su.id = o.supplier_id
  LEFT JOIN public.helpdesk_tickets t ON t.id = o.ticket_id
  LEFT JOIN public.helpdesk_tickets dt ON dt.id = o.derived_ticket_id
`;

const listOrderChecklist = async (orderId: number): Promise<HelpdeskMaintenanceOrderRecord['checklist']> => {
  const savedResult = await pool.query(
    `
      SELECT id, plan_task_id, task_text, result, notes, sort_order
      FROM public.helpdesk_maintenance_order_checklist
      WHERE order_id = $1
      ORDER BY sort_order ASC, id ASC;
    `,
    [orderId],
  );

  if (savedResult.rows.length > 0) {
    return savedResult.rows.map((row) => ({
      id: Number(row.id),
      plan_task_id: row.plan_task_id ? Number(row.plan_task_id) : null,
      task_text: String(row.task_text),
      result: String(row.result),
      notes: row.notes ? String(row.notes) : null,
      sort_order: Number(row.sort_order ?? 0),
    }));
  }

  const taskResult = await pool.query(
    `
      SELECT t.id AS plan_task_id, t.task_text, t.sort_order
      FROM public.helpdesk_maintenance_plan_tasks t
      INNER JOIN public.helpdesk_maintenance_orders o ON o.plan_id = t.plan_id
      WHERE o.id = $1
      ORDER BY t.sort_order ASC, t.id ASC;
    `,
    [orderId],
  );

  return taskResult.rows.map((row, index) => ({
    id: 0 - (index + 1),
    plan_task_id: Number(row.plan_task_id),
    task_text: String(row.task_text),
    result: 'PENDING',
    notes: null,
    sort_order: Number(row.sort_order ?? 0),
  }));
};

const mapOrderRow = async (row: any): Promise<HelpdeskMaintenanceOrderRecord> => {
  const orderId = Number(row.id);

  const order: HelpdeskMaintenanceOrderRecord = {
    id: orderId,
    order_code: String(row.order_code),
    plan_id: row.plan_id ? Number(row.plan_id) : null,
    asset_id: Number(row.asset_id),
    scheduled_for: row.scheduled_for ? toIsoDate(row.scheduled_for) : '',
    window_starts_on: row.window_starts_on ? toIsoDate(row.window_starts_on) : null,
    window_ends_on: row.window_ends_on ? toIsoDate(row.window_ends_on) : null,
    status: String(row.status),
    started_at: row.started_at ? toIsoDateTime(row.started_at) : null,
    completed_at: row.completed_at ? toIsoDateTime(row.completed_at) : null,
    completed_by_user_id: row.completed_by_user_id ? String(row.completed_by_user_id) : null,
    performed_activities: row.performed_activities ? String(row.performed_activities) : null,
    findings: row.findings ? String(row.findings) : null,
    provider_name: row.provider_name ? String(row.provider_name) : null,
    result: row.result ? String(row.result) : null,
    evidence_notes: row.evidence_notes ? String(row.evidence_notes) : null,
    rescheduled_from: row.rescheduled_from ? toIsoDate(row.rescheduled_from) : null,
    rescheduled_at: row.rescheduled_at ? toIsoDateTime(row.rescheduled_at) : null,
    reschedule_reason: row.reschedule_reason ? String(row.reschedule_reason) : null,
    is_projected: Boolean(row.is_projected),
    program_version: row.program_version !== null && row.program_version !== undefined ? Number(row.program_version) : null,
    service_kind: (row.service_kind ?? 'PREVENTIVE') as MaintenanceServiceKind,
    executor_kind: (row.executor_kind ?? 'INTERNAL_TECH') as MaintenanceExecutorKind,
    checklist_required: row.checklist_required === undefined || row.checklist_required === null ? true : Boolean(row.checklist_required),
    evidence_required: row.evidence_required === undefined || row.evidence_required === null ? true : Boolean(row.evidence_required),
    requires_responsible_signature: requiresResponsibleSignature(
      (row.executor_kind ?? 'INTERNAL_TECH') as MaintenanceExecutorKind,
      row.criticality_code ? String(row.criticality_code) : null,
    ),
    window_state:
      String(row.status) === 'CLOSED'
        ? null
        : windowState(
            row.window_starts_on ? toIsoDate(row.window_starts_on) : null,
            row.window_ends_on ? toIsoDate(row.window_ends_on) : null,
            todayIso(),
          ),
    ticket_id: row.ticket_id ? Number(row.ticket_id) : null,
    ticket_code: row.ticket_code ? String(row.ticket_code) : null,
    derived_ticket_id: row.derived_ticket_id ? Number(row.derived_ticket_id) : null,
    derived_ticket_code: row.derived_ticket_code ? String(row.derived_ticket_code) : null,
    executed_by_employee_id: row.executed_by_employee_id ? Number(row.executed_by_employee_id) : null,
    executed_by_employee_name: row.executed_by_employee_name ? String(row.executed_by_employee_name) : null,
    supplier_id: row.supplier_id ? Number(row.supplier_id) : null,
    supplier_name: row.supplier_name ? String(row.supplier_name) : null,
    downtime_minutes: row.downtime_minutes !== null && row.downtime_minutes !== undefined ? Number(row.downtime_minutes) : null,
    has_technician_signature: Boolean(row.technician_signature_path),
    has_responsible_signature: Boolean(row.responsible_signature_path),
    validated_at: row.validated_at ? toIsoDateTime(row.validated_at) : null,
    validated_by_user_id: row.validated_by_user_id ? String(row.validated_by_user_id) : null,
    lifecycle_event_id: row.lifecycle_event_id ? Number(row.lifecycle_event_id) : null,
    constancia_document_id: row.constancia_document_id ? Number(row.constancia_document_id) : null,
    plan: row.plan_id
      ? {
          id: Number(row.plan_id),
          plan_code: String(row.plan_code ?? ''),
          title: String(row.plan_title ?? ''),
          schedule_mode: normalizeScheduleMode(row.schedule_mode),
          frequency_id: row.frequency_id ? Number(row.frequency_id) : null,
          interval_months: row.interval_months ? Number(row.interval_months) : null,
          tolerance_before_days: Number(row.tolerance_before_days ?? 0),
          tolerance_after_days: Number(row.tolerance_after_days ?? 0),
          anchor_mode: row.anchor_mode === 'FLOATING' ? 'FLOATING' : 'FIXED',
        }
      : null,
    asset: row.asset_id
      ? {
          id: Number(row.asset_id),
          asset_code: String(row.asset_code ?? ''),
          name: String(row.asset_name ?? ''),
          criticality_code: row.criticality_code ? String(row.criticality_code) : null,
          criticality_name: row.criticality_name ? String(row.criticality_name) : null,
          unit_name: row.unit_name ? String(row.unit_name) : null,
          area_name: row.area_name ? String(row.area_name) : null,
          category_name: row.category_name ? String(row.category_name) : null,
          responsible_employee_id: row.asset_responsible_employee_id ? Number(row.asset_responsible_employee_id) : null,
          responsible_employee_name: row.responsible_employee_name ? String(row.responsible_employee_name) : null,
          assigned_employee_id: row.asset_assigned_employee_id ? Number(row.asset_assigned_employee_id) : null,
          assigned_employee_name: row.assigned_employee_name ? String(row.assigned_employee_name) : null,
        }
      : null,
    checklist: await listOrderChecklist(orderId),
  };

  if (row.created_at) {
    order.created_at = toIsoDateTime(row.created_at);
  }
  if (row.updated_at) {
    order.updated_at = toIsoDateTime(row.updated_at);
  }

  return order;
};

const mapPlanRow = async (row: any): Promise<HelpdeskMaintenancePlanRecord> => {
  const planId = Number(row.id);

  return {
    id: planId,
    plan_code: String(row.plan_code),
    asset_id: Number(row.asset_id),
    frequency_id: row.frequency_id ? Number(row.frequency_id) : null,
    schedule_mode: normalizeScheduleMode(row.schedule_mode),
    responsible_employee_id: row.responsible_employee_id ? Number(row.responsible_employee_id) : null,
    quality_document_id: row.quality_document_id ? String(row.quality_document_id) : null,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    provider_name: row.provider_name ? String(row.provider_name) : null,
    starts_on: row.starts_on ? toIsoDate(row.starts_on) : '',
    next_due_on: row.next_due_on ? toIsoDate(row.next_due_on) : '',
    tolerance_before_days: Number(row.tolerance_before_days ?? 0),
    tolerance_after_days: Number(row.tolerance_after_days ?? 0),
    checklist_required: Boolean(row.checklist_required),
    evidence_required: Boolean(row.evidence_required),
    is_active: Boolean(row.is_active),
    created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
    updated_at: row.updated_at ? toIsoDateTime(row.updated_at) : undefined,
    asset: row.asset_id
      ? {
          id: Number(row.asset_id),
          asset_code: String(row.asset_code ?? ''),
          name: String(row.asset_name ?? ''),
        }
      : null,
    frequency: row.frequency_id
      ? {
          id: Number(row.frequency_id),
          code: String(row.frequency_code ?? ''),
          name: String(row.frequency_name ?? ''),
          description: row.frequency_description ? String(row.frequency_description) : null,
          interval_months: Number(row.interval_months ?? 0),
          is_active: true,
        }
      : null,
    responsible_employee: row.responsible_employee_id
      ? {
          id: Number(row.responsible_employee_id),
          employee_code: String(row.responsible_employee_code ?? ''),
          full_name: String(row.responsible_employee_name ?? ''),
          area: row.responsible_employee_area ? String(row.responsible_employee_area) : null,
          position: row.responsible_employee_position ? String(row.responsible_employee_position) : null,
        }
      : null,
    quality_document: row.quality_document_id
      ? {
          id: String(row.quality_document_id),
          title: String(row.quality_document_title ?? ''),
          filename: row.quality_document_filename ? String(row.quality_document_filename) : null,
        }
      : null,
    tasks: await listPlanTasks(planId),
    orders: await listPlanOrders(planId),
  };
};

export const listMaintenanceCatalogs = async (): Promise<HelpdeskMaintenanceCatalogs> => {
  await assertMaintenanceTables();

  const result = await pool.query(`
    SELECT id, code, name, description, interval_months, is_active, sort_order
    FROM public.helpdesk_maintenance_frequencies
    WHERE is_active = TRUE
    ORDER BY sort_order ASC, name ASC;
  `);

  return {
    frequencies: result.rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      interval_months: Number(row.interval_months ?? 0),
      is_active: Boolean(row.is_active),
      sort_order: Number(row.sort_order ?? 0),
    })),
  };
};

export const listMaintenancePlans = async (): Promise<HelpdeskMaintenancePlanRecord[]> => {
  await assertMaintenanceTables();

  const result = await pool.query(`
    ${buildPlanQuery()}
    WHERE p.is_active = TRUE
    ORDER BY p.next_due_on ASC, p.updated_at DESC;
  `);

  return Promise.all(result.rows.map(mapPlanRow));
};

const ORDER_SEARCH_COLUMNS = [
  'a.asset_code',
  'a.name',
  'p.plan_code',
  'p.title',
  'o.status',
];

export interface MaintenanceOrderListOptions extends PaginationInput {
  search?: string | undefined;
}

export const listMaintenanceOrders = async (
  options: MaintenanceOrderListOptions = {},
): Promise<PaginatedResult<HelpdeskMaintenanceOrderRecord>> => {
  await assertMaintenanceTables();

  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const search = buildIlikeSearch(ORDER_SEARCH_COLUMNS, options.search, 0);
  const whereClause = search.clause ? `WHERE ${search.clause}` : '';

  const base = buildOrderQuery();
  const orderBy = `
    ORDER BY
      CASE o.status
        WHEN 'IN_PROGRESS' THEN 1
        WHEN 'SCHEDULED' THEN 2
        WHEN 'RESCHEDULED' THEN 3
        WHEN 'CLOSED' THEN 4
        ELSE 5
      END,
      o.scheduled_for ASC,
      o.updated_at DESC
  `;
  const limitSql = paginate
    ? `LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`
    : '';
  const dataValues = paginate ? [...search.values, limit, offset] : search.values;

  const dataResult = await pool.query(
    `${base} ${whereClause} ${orderBy} ${limitSql};`,
    dataValues,
  );
  const data = await Promise.all(dataResult.rows.map(mapOrderRow));

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM (${base} ${whereClause}) sub;`,
    search.values,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

export const getMaintenanceOrderById = async (orderId: number): Promise<HelpdeskMaintenanceOrderRecord | null> => {
  await assertMaintenanceTables();

  const result = await pool.query(
    `
      ${buildOrderQuery()}
      WHERE o.id = $1
      LIMIT 1;
    `,
    [orderId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapOrderRow(result.rows[0]);
};

export const getMaintenancePlanById = async (planId: number): Promise<HelpdeskMaintenancePlanRecord | null> => {
  await assertMaintenanceTables();

  const result = await pool.query(
    `
      ${buildPlanQuery()}
      WHERE p.id = $1
      LIMIT 1;
    `,
    [planId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapPlanRow(result.rows[0]);
};

const createScheduledOrder = async (
  planId: number,
  assetId: number,
  nextDueOn: string,
  toleranceBeforeDays: number,
  toleranceAfterDays: number,
  userId?: string | null,
  executor: Queryable = pool,
) => {
  const ctx = await executor.query(
    `SELECT p.service_kind, g.version, cr.code AS criticality_code
       FROM public.helpdesk_maintenance_plans p
       LEFT JOIN public.helpdesk_asset_maintenance_programs g ON g.id = p.program_id
       LEFT JOIN public.helpdesk_assets a ON a.id = p.asset_id
       LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
      WHERE p.id = $1 LIMIT 1;`,
    [planId],
  );
  const row = ctx.rows[0] ?? {};
  await insertScheduledOrder(executor, {
    planId,
    assetId,
    scheduledFor: nextDueOn,
    beforeDays: toleranceBeforeDays,
    afterDays: toleranceAfterDays,
    criticalityCode: row.criticality_code ? String(row.criticality_code) : null,
    serviceKind: (row.service_kind ?? 'PREVENTIVE') as MaintenanceServiceKind,
    programVersion: row.version ? Number(row.version) : null,
    isProjected: false,
    userId: userId ?? null,
  });
};

export const createMaintenancePlan = async (
  payload: HelpdeskMaintenancePlanPayload,
  userId?: string | null,
): Promise<HelpdeskMaintenancePlanRecord> => {
  await assertMaintenanceTables();

  const planCode = await generatePlanCode();
  const planId = await withTransaction(async (client) => {
    const result = await client.query(
      `
        INSERT INTO public.helpdesk_maintenance_plans (
          plan_code,
          asset_id,
          frequency_id,
          schedule_mode,
          responsible_employee_id,
          provider_name,
          quality_document_id,
          title,
          description,
          starts_on,
          next_due_on,
          tolerance_before_days,
          tolerance_after_days,
          checklist_required,
          evidence_required,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $16
        )
        RETURNING id;
      `,
      [
        planCode,
        payload.asset_id,
        payload.frequency_id ?? null,
        normalizeScheduleMode(payload.schedule_mode),
        payload.responsible_employee_id ?? null,
        normalizeOptionalText(payload.provider_name),
        payload.quality_document_id ?? null,
        payload.title.trim(),
        normalizeOptionalText(payload.description),
        payload.starts_on,
        payload.next_due_on,
        Math.max(Number(payload.tolerance_before_days ?? 0), 0),
        Math.max(Number(payload.tolerance_after_days ?? 0), 0),
        payload.checklist_required ?? true,
        payload.evidence_required ?? true,
        userId ?? null,
      ],
    );

    const id = Number(result.rows[0]?.id);
    const tasks = (payload.tasks ?? []).map((task) => task.trim()).filter(Boolean);

    for (const [index, task] of tasks.entries()) {
      await client.query(
        `
          INSERT INTO public.helpdesk_maintenance_plan_tasks (plan_id, task_text, sort_order)
          VALUES ($1, $2, $3);
        `,
        [id, task, (index + 1) * 10],
      );
    }

    await createScheduledOrder(
      id,
      payload.asset_id,
      payload.next_due_on,
      Math.max(Number(payload.tolerance_before_days ?? 0), 0),
      Math.max(Number(payload.tolerance_after_days ?? 0), 0),
      userId,
      client,
    );
    await ensurePlanProjection(id, { userId }, client);

    return id;
  });

  const created = await getMaintenancePlanById(planId);
  if (!created) {
    const error = new Error('HELPDESK_MAINTENANCE_PLAN_CREATION_FAILED');
    (error as any).code = 'HELPDESK_MAINTENANCE_PLAN_CREATION_FAILED';
    throw error;
  }

  return created;
};

export const updateMaintenancePlan = async (
  planId: number,
  payload: HelpdeskMaintenancePlanPayload,
  userId?: string | null,
): Promise<HelpdeskMaintenancePlanRecord | null> => {
  await assertMaintenanceTables();

  const current = await getMaintenancePlanById(planId);
  if (!current) {
    return null;
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_maintenance_plans
        SET
          asset_id = $1,
          frequency_id = $2,
          schedule_mode = $3,
          responsible_employee_id = $4,
          provider_name = $5,
          quality_document_id = $6,
          title = $7,
          description = $8,
          starts_on = $9,
          next_due_on = $10,
          tolerance_before_days = $11,
          tolerance_after_days = $12,
          checklist_required = $13,
          evidence_required = $14,
          updated_by_user_id = $15,
          updated_at = NOW()
        WHERE id = $16;
      `,
      [
        payload.asset_id,
        payload.frequency_id ?? null,
        normalizeScheduleMode(payload.schedule_mode),
        payload.responsible_employee_id ?? null,
        normalizeOptionalText(payload.provider_name),
        payload.quality_document_id ?? null,
        payload.title.trim(),
        normalizeOptionalText(payload.description),
        payload.starts_on,
        payload.next_due_on,
        Math.max(Number(payload.tolerance_before_days ?? 0), 0),
        Math.max(Number(payload.tolerance_after_days ?? 0), 0),
        payload.checklist_required ?? true,
        payload.evidence_required ?? true,
        userId ?? null,
        planId,
      ],
    );

    await client.query('DELETE FROM public.helpdesk_maintenance_plan_tasks WHERE plan_id = $1;', [planId]);
    const tasks = (payload.tasks ?? []).map((task) => task.trim()).filter(Boolean);
    for (const [index, task] of tasks.entries()) {
      await client.query(
        `
          INSERT INTO public.helpdesk_maintenance_plan_tasks (plan_id, task_text, sort_order)
          VALUES ($1, $2, $3);
        `,
        [planId, task, (index + 1) * 10],
      );
    }

    await createScheduledOrder(
      planId,
      payload.asset_id,
      payload.next_due_on,
      Math.max(Number(payload.tolerance_before_days ?? 0), 0),
      Math.max(Number(payload.tolerance_after_days ?? 0), 0),
      userId,
      client,
    );
    await ensurePlanProjection(planId, { userId }, client);
  });

  return getMaintenancePlanById(planId);
};

// Resincroniza next_due_on del plan con la orden SCHEDULED mas proxima. Se usa
// tras cargar un cronograma (modo CALENDAR) para que el plan refleje la
// siguiente fecha pendiente en listados y estados.
const resyncNextDueOn = async (planId: number, userId: string | null | undefined, executor: Queryable) => {
  await executor.query(
    `
      UPDATE public.helpdesk_maintenance_plans p
      SET next_due_on = COALESCE(
            (SELECT MIN(o.scheduled_for) FROM public.helpdesk_maintenance_orders o
              WHERE o.plan_id = p.id AND o.status IN ('SCHEDULED', 'RESCHEDULED')),
            p.next_due_on),
          updated_by_user_id = $2,
          updated_at = NOW()
      WHERE p.id = $1;
    `,
    [planId, userId ?? null],
  );
};

// Carga masiva de fechas provistas por el proveedor/responsable (modo CALENDAR):
// crea una orden SCHEDULED por fecha, ignorando las ya existentes (idempotente).
export const addMaintenanceScheduleDates = async (
  planId: number,
  dates: string[],
  userId?: string | null,
): Promise<HelpdeskMaintenancePlanRecord | null> => {
  await assertMaintenanceTables();

  const plan = await getMaintenancePlanById(planId);
  if (!plan) {
    return null;
  }

  const uniqueDates = Array.from(new Set(dates.map((d) => d.trim()).filter(Boolean)));

  await withTransaction(async (client) => {
    for (const date of uniqueDates) {
      await createScheduledOrder(
        planId,
        plan.asset_id,
        date,
        plan.tolerance_before_days ?? 0,
        plan.tolerance_after_days ?? 0,
        userId,
        client,
      );
    }
    await resyncNextDueOn(planId, userId, client);
  });

  return getMaintenancePlanById(planId);
};

/**
 * Construye un error de "estado previo invalido" para transiciones de orden.
 * El controller lo mapea a HTTP 409 usando `publicMessage`.
 */
const invalidOrderState = (message: string): Error => {
  const error = new Error('HELPDESK_MAINTENANCE_ORDER_INVALID_STATE');
  (error as any).code = 'HELPDESK_MAINTENANCE_ORDER_INVALID_STATE';
  (error as any).publicMessage = message;
  return error;
};

export const startMaintenanceOrder = async (
  orderId: number,
  userId?: string | null,
): Promise<HelpdeskMaintenanceOrderRecord | null> => {
  await assertMaintenanceTables();

  const current = await getMaintenanceOrderById(orderId);
  if (!current) {
    return null;
  }

  if (current.status !== 'SCHEDULED' && current.status !== 'RESCHEDULED') {
    throw invalidOrderState('Solo se puede iniciar una orden programada o reprogramada.');
  }

  await pool.query(
    `
      UPDATE public.helpdesk_maintenance_orders
      SET
        status = 'IN_PROGRESS',
        started_at = COALESCE(started_at, NOW()),
        is_projected = FALSE,
        updated_by_user_id = $2,
        updated_at = NOW()
      WHERE id = $1
        AND status IN ('SCHEDULED', 'RESCHEDULED');
    `,
    [orderId, userId ?? null],
  );

  return getMaintenanceOrderById(orderId);
};

export const rescheduleMaintenanceOrder = async (
  orderId: number,
  payload: HelpdeskMaintenanceOrderReschedulePayload,
  userId?: string | null,
): Promise<HelpdeskMaintenanceOrderRecord | null> => {
  await assertMaintenanceTables();

  const current = await getMaintenanceOrderById(orderId);
  if (!current) {
    return null;
  }

  if (current.status !== 'SCHEDULED' && current.status !== 'RESCHEDULED') {
    throw invalidOrderState('Solo se puede reprogramar una orden programada o reprogramada.');
  }

  const beforeDays = current.plan?.tolerance_before_days ?? 0;
  const afterDays = current.plan?.tolerance_after_days ?? 0;
  const window = computeWindow({
    scheduledFor: payload.scheduled_for,
    beforeDays,
    afterDays,
    criticalityCode: current.asset?.criticality_code ?? null,
  });

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_maintenance_orders
        SET
          status = 'RESCHEDULED',
          rescheduled_from = scheduled_for,
          scheduled_for = $2,
          window_starts_on = $3,
          window_ends_on = $4,
          rescheduled_at = NOW(),
          reschedule_reason = $5,
          reminder_sent_at = NULL,
          is_projected = FALSE,
          updated_by_user_id = $6,
          updated_at = NOW()
        WHERE id = $1
          AND status IN ('SCHEDULED', 'RESCHEDULED');
      `,
      [orderId, payload.scheduled_for, window.starts_on, window.ends_on, payload.reschedule_reason.trim(), userId ?? null],
    );

    if (current.plan_id) {
      await resyncPlanNextDue(current.plan_id, userId, client);
    }
  });

  return getMaintenanceOrderById(orderId);
};

export const getPreventiveDueCount = async (): Promise<number> => {
  const exists = await maintenanceTableExists();
  if (!exists) {
    return 0;
  }

  const result = await pool.query(`
    SELECT COUNT(*)::int AS due_count
    FROM public.helpdesk_maintenance_orders
    WHERE status = 'SCHEDULED'
      AND scheduled_for <= CURRENT_DATE + INTERVAL '30 days';
  `);

  return Number(result.rows[0]?.due_count ?? 0);
};
