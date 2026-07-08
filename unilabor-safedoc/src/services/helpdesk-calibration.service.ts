import pool from '../config/db';
import { toIsoDate, toIsoDateTime } from '../utils/date-serialization';
import { withTransaction, type Queryable } from '../utils/transaction';
import type { HelpdeskCatalogItem } from './helpdesk-asset.service';
import { createLifecycleEvent } from './helpdesk-lifecycle.service';
import {
  PaginatedResult,
  PaginationInput,
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';

export type CalibrationScheduleMode = 'FREQUENCY' | 'CALENDAR';

export interface HelpdeskCalibrationPlanPayload {
  asset_id: number;
  frequency_id?: number | null;
  schedule_mode?: CalibrationScheduleMode;
  responsible_employee_id?: number | null;
  quality_document_id?: string | null;
  title: string;
  description?: string | null;
  provider_name?: string | null;
  standard_ref?: string | null;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days?: number;
  tolerance_after_days?: number;
  certificate_required?: boolean;
  evidence_required?: boolean;
}

export interface HelpdeskCalibrationPlanRecord extends Omit<HelpdeskCalibrationPlanPayload, never> {
  id: number;
  plan_code: string;
  schedule_mode: CalibrationScheduleMode;
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
    certificate_no?: string | null;
    calibration_due_on?: string | null;
  }>;
}

export interface HelpdeskCalibrationCatalogs {
  frequencies: Array<HelpdeskCatalogItem & { interval_months: number }>;
}

export interface HelpdeskCalibrationOrderClosePayload {
  completed_at: string;
  result: string;
  certificate_no?: string | null;
  calibration_due_on?: string | null;
  findings?: string | null;
  provider_name?: string | null;
  evidence_notes?: string | null;
}

export interface HelpdeskCalibrationOrderReschedulePayload {
  scheduled_for: string;
  reschedule_reason: string;
}

export interface HelpdeskCalibrationOrderRecord {
  id: number;
  order_code: string;
  plan_id: number;
  asset_id: number;
  scheduled_for: string;
  window_starts_on: string | null;
  window_ends_on: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
  provider_name: string | null;
  result: string | null;
  certificate_no: string | null;
  calibration_due_on: string | null;
  findings: string | null;
  evidence_notes: string | null;
  lifecycle_event_id: number | null;
  rescheduled_from: string | null;
  rescheduled_at: string | null;
  reschedule_reason: string | null;
  created_at?: string;
  updated_at?: string;
  plan?: {
    id: number;
    plan_code: string;
    title: string;
    schedule_mode: CalibrationScheduleMode;
    frequency_id: number | null;
    interval_months: number | null;
    tolerance_before_days: number;
    tolerance_after_days: number;
  } | null;
  asset?: {
    id: number;
    asset_code: string;
    name: string;
  } | null;
}

const calibrationTableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.helpdesk_calibration_plans') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const assertCalibrationTables = async () => {
  const exists = await calibrationTableExists();
  if (!exists) {
    const error = new Error('HELPDESK_CALIBRATION_TABLES_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_CALIBRATION_TABLES_NOT_AVAILABLE';
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

const normalizeScheduleMode = (value: unknown): CalibrationScheduleMode =>
  value === 'CALENDAR' ? 'CALENDAR' : 'FREQUENCY';

const generatePlanCode = async (): Promise<string> => {
  const result = await pool.query(`SELECT nextval('public.helpdesk_calibration_plan_code_seq') AS next_id;`);
  return `CP-${String(Number(result.rows[0]?.next_id ?? 0)).padStart(6, '0')}`;
};

const generateOrderCode = async (): Promise<string> => {
  const result = await pool.query(`SELECT nextval('public.helpdesk_calibration_order_code_seq') AS next_id;`);
  return `OC-${String(Number(result.rows[0]?.next_id ?? 0)).padStart(6, '0')}`;
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
  FROM public.helpdesk_calibration_plans p
  LEFT JOIN public.helpdesk_assets a ON a.id = p.asset_id
  LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = p.frequency_id
  LEFT JOIN public.employees e ON e.id = p.responsible_employee_id
  LEFT JOIN public.documents d ON d.id = p.quality_document_id
`;

const listPlanOrders = async (planId: number): Promise<HelpdeskCalibrationPlanRecord['orders']> => {
  const result = await pool.query(
    `
      SELECT id, order_code, scheduled_for, window_starts_on, window_ends_on, status
           , started_at, completed_at, result, certificate_no, calibration_due_on
      FROM public.helpdesk_calibration_orders
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
    certificate_no: row.certificate_no ? String(row.certificate_no) : null,
    calibration_due_on: row.calibration_due_on ? toIsoDate(row.calibration_due_on) : null,
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
    f.interval_months,
    a.asset_code,
    a.name AS asset_name
  FROM public.helpdesk_calibration_orders o
  INNER JOIN public.helpdesk_calibration_plans p ON p.id = o.plan_id
  INNER JOIN public.helpdesk_assets a ON a.id = o.asset_id
  LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = p.frequency_id
`;

const mapOrderRow = (row: any): HelpdeskCalibrationOrderRecord => {
  const order: HelpdeskCalibrationOrderRecord = {
    id: Number(row.id),
    order_code: String(row.order_code),
    plan_id: Number(row.plan_id),
    asset_id: Number(row.asset_id),
    scheduled_for: row.scheduled_for ? toIsoDate(row.scheduled_for) : '',
    window_starts_on: row.window_starts_on ? toIsoDate(row.window_starts_on) : null,
    window_ends_on: row.window_ends_on ? toIsoDate(row.window_ends_on) : null,
    status: String(row.status),
    started_at: row.started_at ? toIsoDateTime(row.started_at) : null,
    completed_at: row.completed_at ? toIsoDateTime(row.completed_at) : null,
    completed_by_user_id: row.completed_by_user_id ? String(row.completed_by_user_id) : null,
    provider_name: row.provider_name ? String(row.provider_name) : null,
    result: row.result ? String(row.result) : null,
    certificate_no: row.certificate_no ? String(row.certificate_no) : null,
    calibration_due_on: row.calibration_due_on ? toIsoDate(row.calibration_due_on) : null,
    findings: row.findings ? String(row.findings) : null,
    evidence_notes: row.evidence_notes ? String(row.evidence_notes) : null,
    lifecycle_event_id: row.lifecycle_event_id ? Number(row.lifecycle_event_id) : null,
    rescheduled_from: row.rescheduled_from ? String(row.rescheduled_from) : null,
    rescheduled_at: row.rescheduled_at ? toIsoDateTime(row.rescheduled_at) : null,
    reschedule_reason: row.reschedule_reason ? String(row.reschedule_reason) : null,
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
        }
      : null,
    asset: row.asset_id
      ? {
          id: Number(row.asset_id),
          asset_code: String(row.asset_code ?? ''),
          name: String(row.asset_name ?? ''),
        }
      : null,
  };

  if (row.created_at) {
    order.created_at = toIsoDateTime(row.created_at);
  }
  if (row.updated_at) {
    order.updated_at = toIsoDateTime(row.updated_at);
  }

  return order;
};

const mapPlanRow = async (row: any): Promise<HelpdeskCalibrationPlanRecord> => {
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
    standard_ref: row.standard_ref ? String(row.standard_ref) : null,
    starts_on: row.starts_on ? toIsoDate(row.starts_on) : '',
    next_due_on: row.next_due_on ? toIsoDate(row.next_due_on) : '',
    tolerance_before_days: Number(row.tolerance_before_days ?? 0),
    tolerance_after_days: Number(row.tolerance_after_days ?? 0),
    certificate_required: Boolean(row.certificate_required),
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
    orders: await listPlanOrders(planId),
  };
};

export const listCalibrationCatalogs = async (): Promise<HelpdeskCalibrationCatalogs> => {
  await assertCalibrationTables();

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

export const listCalibrationPlans = async (): Promise<HelpdeskCalibrationPlanRecord[]> => {
  await assertCalibrationTables();

  const result = await pool.query(`
    ${buildPlanQuery()}
    WHERE p.is_active = TRUE
    ORDER BY p.next_due_on ASC, p.updated_at DESC;
  `);

  return Promise.all(result.rows.map(mapPlanRow));
};

const ORDER_SEARCH_COLUMNS = ['a.asset_code', 'a.name', 'p.plan_code', 'p.title', 'o.status', 'o.certificate_no'];

export interface CalibrationOrderListOptions extends PaginationInput {
  search?: string | undefined;
}

export const listCalibrationOrders = async (
  options: CalibrationOrderListOptions = {},
): Promise<PaginatedResult<HelpdeskCalibrationOrderRecord>> => {
  await assertCalibrationTables();

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
  const limitSql = paginate ? `LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}` : '';
  const dataValues = paginate ? [...search.values, limit, offset] : search.values;

  const dataResult = await pool.query(`${base} ${whereClause} ${orderBy} ${limitSql};`, dataValues);
  const data = dataResult.rows.map(mapOrderRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM (${base} ${whereClause}) sub;`,
    search.values,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

export const getCalibrationOrderById = async (orderId: number): Promise<HelpdeskCalibrationOrderRecord | null> => {
  await assertCalibrationTables();

  const result = await pool.query(`${buildOrderQuery()} WHERE o.id = $1 LIMIT 1;`, [orderId]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapOrderRow(result.rows[0]);
};

export const getCalibrationPlanById = async (planId: number): Promise<HelpdeskCalibrationPlanRecord | null> => {
  await assertCalibrationTables();

  const result = await pool.query(`${buildPlanQuery()} WHERE p.id = $1 LIMIT 1;`, [planId]);
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
  const orderCode = await generateOrderCode();

  await executor.query(
    `
      INSERT INTO public.helpdesk_calibration_orders (
        order_code, plan_id, asset_id, scheduled_for, window_starts_on, window_ends_on, created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (plan_id, scheduled_for) DO NOTHING;
    `,
    [
      orderCode,
      planId,
      assetId,
      nextDueOn,
      addDays(nextDueOn, -Math.max(toleranceBeforeDays, 0)),
      addDays(nextDueOn, Math.max(toleranceAfterDays, 0)),
      userId ?? null,
    ],
  );
};

export const createCalibrationPlan = async (
  payload: HelpdeskCalibrationPlanPayload,
  userId?: string | null,
): Promise<HelpdeskCalibrationPlanRecord> => {
  await assertCalibrationTables();

  const planCode = await generatePlanCode();
  const beforeDays = Math.max(Number(payload.tolerance_before_days ?? 0), 0);
  const afterDays = Math.max(Number(payload.tolerance_after_days ?? 0), 0);

  const planId = await withTransaction(async (client) => {
    const result = await client.query(
      `
        INSERT INTO public.helpdesk_calibration_plans (
          plan_code, asset_id, frequency_id, schedule_mode, responsible_employee_id,
          provider_name, standard_ref, quality_document_id, title, description,
          starts_on, next_due_on, tolerance_before_days, tolerance_after_days,
          certificate_required, evidence_required, created_by_user_id, updated_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $17
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
        normalizeOptionalText(payload.standard_ref),
        payload.quality_document_id ?? null,
        payload.title.trim(),
        normalizeOptionalText(payload.description),
        payload.starts_on,
        payload.next_due_on,
        beforeDays,
        afterDays,
        payload.certificate_required ?? true,
        payload.evidence_required ?? true,
        userId ?? null,
      ],
    );

    const id = Number(result.rows[0]?.id);
    await createScheduledOrder(id, payload.asset_id, payload.next_due_on, beforeDays, afterDays, userId, client);
    return id;
  });

  const created = await getCalibrationPlanById(planId);
  if (!created) {
    const error = new Error('HELPDESK_CALIBRATION_PLAN_CREATION_FAILED');
    (error as any).code = 'HELPDESK_CALIBRATION_PLAN_CREATION_FAILED';
    throw error;
  }

  return created;
};

export const updateCalibrationPlan = async (
  planId: number,
  payload: HelpdeskCalibrationPlanPayload,
  userId?: string | null,
): Promise<HelpdeskCalibrationPlanRecord | null> => {
  await assertCalibrationTables();

  const current = await getCalibrationPlanById(planId);
  if (!current) {
    return null;
  }

  const beforeDays = Math.max(Number(payload.tolerance_before_days ?? 0), 0);
  const afterDays = Math.max(Number(payload.tolerance_after_days ?? 0), 0);

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_calibration_plans
        SET
          asset_id = $1, frequency_id = $2, schedule_mode = $3, responsible_employee_id = $4,
          provider_name = $5, standard_ref = $6, quality_document_id = $7, title = $8, description = $9,
          starts_on = $10, next_due_on = $11, tolerance_before_days = $12, tolerance_after_days = $13,
          certificate_required = $14, evidence_required = $15, updated_by_user_id = $16, updated_at = NOW()
        WHERE id = $17;
      `,
      [
        payload.asset_id,
        payload.frequency_id ?? null,
        normalizeScheduleMode(payload.schedule_mode),
        payload.responsible_employee_id ?? null,
        normalizeOptionalText(payload.provider_name),
        normalizeOptionalText(payload.standard_ref),
        payload.quality_document_id ?? null,
        payload.title.trim(),
        normalizeOptionalText(payload.description),
        payload.starts_on,
        payload.next_due_on,
        beforeDays,
        afterDays,
        payload.certificate_required ?? true,
        payload.evidence_required ?? true,
        userId ?? null,
        planId,
      ],
    );

    await createScheduledOrder(planId, payload.asset_id, payload.next_due_on, beforeDays, afterDays, userId, client);
  });

  return getCalibrationPlanById(planId);
};

// Resincroniza next_due_on del plan con la orden SCHEDULED mas proxima (tras
// cargar un cronograma en modo CALENDAR).
const resyncNextDueOn = async (planId: number, userId: string | null | undefined, executor: Queryable) => {
  await executor.query(
    `
      UPDATE public.helpdesk_calibration_plans p
      SET next_due_on = COALESCE(
            (SELECT MIN(o.scheduled_for) FROM public.helpdesk_calibration_orders o
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
// una orden SCHEDULED por fecha, ignorando duplicados (idempotente).
export const addCalibrationScheduleDates = async (
  planId: number,
  dates: string[],
  userId?: string | null,
): Promise<HelpdeskCalibrationPlanRecord | null> => {
  await assertCalibrationTables();

  const plan = await getCalibrationPlanById(planId);
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

  return getCalibrationPlanById(planId);
};

/**
 * Error de "estado previo invalido" para transiciones de orden.
 * El controller lo mapea a HTTP 409 usando `publicMessage`.
 */
const invalidOrderState = (message: string): Error => {
  const error = new Error('HELPDESK_CALIBRATION_ORDER_INVALID_STATE');
  (error as any).code = 'HELPDESK_CALIBRATION_ORDER_INVALID_STATE';
  (error as any).publicMessage = message;
  return error;
};

export const startCalibrationOrder = async (
  orderId: number,
  userId?: string | null,
): Promise<HelpdeskCalibrationOrderRecord | null> => {
  await assertCalibrationTables();

  const current = await getCalibrationOrderById(orderId);
  if (!current) {
    return null;
  }

  if (current.status !== 'SCHEDULED' && current.status !== 'RESCHEDULED') {
    throw invalidOrderState('Solo se puede iniciar una orden programada o reprogramada.');
  }

  await pool.query(
    `
      UPDATE public.helpdesk_calibration_orders
      SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, NOW()),
          updated_by_user_id = $2, updated_at = NOW()
      WHERE id = $1 AND status IN ('SCHEDULED', 'RESCHEDULED');
    `,
    [orderId, userId ?? null],
  );

  return getCalibrationOrderById(orderId);
};

export const rescheduleCalibrationOrder = async (
  orderId: number,
  payload: HelpdeskCalibrationOrderReschedulePayload,
  userId?: string | null,
): Promise<HelpdeskCalibrationOrderRecord | null> => {
  await assertCalibrationTables();

  const current = await getCalibrationOrderById(orderId);
  if (!current) {
    return null;
  }

  if (current.status !== 'SCHEDULED' && current.status !== 'RESCHEDULED') {
    throw invalidOrderState('Solo se puede reprogramar una orden programada o reprogramada.');
  }

  const beforeDays = current.plan?.tolerance_before_days ?? 0;
  const afterDays = current.plan?.tolerance_after_days ?? 0;

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_calibration_orders
        SET status = 'RESCHEDULED', rescheduled_from = scheduled_for, scheduled_for = $2,
            window_starts_on = $3, window_ends_on = $4, rescheduled_at = NOW(),
            reschedule_reason = $5, reminder_sent_at = NULL, updated_by_user_id = $6, updated_at = NOW()
        WHERE id = $1 AND status IN ('SCHEDULED', 'RESCHEDULED');
      `,
      [
        orderId,
        payload.scheduled_for,
        addDays(payload.scheduled_for, -Math.max(beforeDays, 0)),
        addDays(payload.scheduled_for, Math.max(afterDays, 0)),
        payload.reschedule_reason.trim(),
        userId ?? null,
      ],
    );

    await client.query(
      `
        UPDATE public.helpdesk_calibration_plans
        SET next_due_on = $2, updated_by_user_id = $3, updated_at = NOW()
        WHERE id = $1;
      `,
      [current.plan_id, payload.scheduled_for, userId ?? null],
    );
  });

  return getCalibrationOrderById(orderId);
};

// Registra en el expediente del activo un evento CALIBRATION con el certificado y
// la proxima fecha. Best-effort: si algo falla no invalida el cierre ya persistido.
const archiveCalibrationEvent = async (
  order: HelpdeskCalibrationOrderRecord,
  payload: HelpdeskCalibrationOrderClosePayload,
  userId?: string | null,
): Promise<number | null> => {
  const typeResult = await pool.query(
    `SELECT id FROM public.helpdesk_lifecycle_event_types WHERE UPPER(code) = 'CALIBRATION' LIMIT 1;`,
  );
  const eventTypeId = typeResult.rows[0]?.id ? Number(typeResult.rows[0].id) : null;
  if (!eventTypeId) {
    return null;
  }

  const event = await createLifecycleEvent(
    order.asset_id,
    {
      event_type_id: eventTypeId,
      event_date: payload.completed_at.slice(0, 10),
      title: `Calibracion — ${order.order_code}`,
      description: `Resultado: ${payload.result.trim()}.`,
      calibration_certificate_no: normalizeOptionalText(payload.certificate_no),
      calibration_due_on: normalizeOptionalText(payload.calibration_due_on),
      performed_by_provider: normalizeOptionalText(payload.provider_name),
      notes: normalizeOptionalText(payload.findings),
    },
    userId,
  );
  return event.id;
};

export const closeCalibrationOrder = async (
  orderId: number,
  payload: HelpdeskCalibrationOrderClosePayload,
  userId?: string | null,
): Promise<HelpdeskCalibrationOrderRecord | null> => {
  await assertCalibrationTables();

  const current = await getCalibrationOrderById(orderId);
  if (!current) {
    return null;
  }

  if (current.status === 'CLOSED') {
    throw invalidOrderState('Esta orden de calibracion ya esta cerrada.');
  }

  // La proxima fecha la dicta el certificado si el proveedor la indica; en su
  // defecto se deriva de la frecuencia. Sin ninguna de las dos, no hay recurrencia.
  // En modo CALENDAR las fechas ya vienen cargadas: el cierre no autogenera la
  // siguiente (pero si conserva calibration_due_on como dato del certificado).
  const certificateDue = normalizeOptionalText(payload.calibration_due_on);
  const intervalMonths = current.plan?.interval_months ?? 0;
  const isFrequency = current.plan?.schedule_mode === 'FREQUENCY';
  const nextDueOn = isFrequency
    ? certificateDue ?? (intervalMonths > 0 ? addMonths(current.scheduled_for, intervalMonths) : null)
    : null;

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.helpdesk_calibration_orders
        SET status = 'CLOSED', started_at = COALESCE(started_at, NOW()), completed_at = $2,
            completed_by_user_id = $3, provider_name = $4, result = $5, certificate_no = $6,
            calibration_due_on = $7, findings = $8, evidence_notes = $9,
            updated_by_user_id = $3, updated_at = NOW()
        WHERE id = $1;
      `,
      [
        orderId,
        payload.completed_at,
        userId ?? null,
        normalizeOptionalText(payload.provider_name),
        payload.result.trim(),
        normalizeOptionalText(payload.certificate_no),
        certificateDue,
        normalizeOptionalText(payload.findings),
        normalizeOptionalText(payload.evidence_notes),
      ],
    );

    if (nextDueOn) {
      await client.query(
        `
          UPDATE public.helpdesk_calibration_plans
          SET next_due_on = $2, updated_by_user_id = $3, updated_at = NOW()
          WHERE id = $1;
        `,
        [current.plan_id, nextDueOn, userId ?? null],
      );

      await createScheduledOrder(
        current.plan_id,
        current.asset_id,
        nextDueOn,
        current.plan?.tolerance_before_days ?? 0,
        current.plan?.tolerance_after_days ?? 0,
        userId,
        client,
      );
    } else {
      // Modo CALENDAR (o sin recurrencia): apuntar next_due_on a la orden pendiente
      // mas proxima para que el plan no quede anclado a una fecha ya cerrada.
      await resyncNextDueOn(current.plan_id, userId, client);
    }
  });

  // Evento de ciclo de vida en el expediente (best-effort, ya persistido el cierre).
  try {
    const eventId = await archiveCalibrationEvent(current, payload, userId);
    if (eventId) {
      await pool.query(`UPDATE public.helpdesk_calibration_orders SET lifecycle_event_id = $1 WHERE id = $2;`, [
        eventId,
        orderId,
      ]);
    }
  } catch (eventError) {
    console.error(`No se pudo registrar el evento de calibracion de la orden ${current.order_code}:`, eventError);
  }

  return getCalibrationOrderById(orderId);
};

export const getCalibrationDueCount = async (): Promise<number> => {
  const exists = await calibrationTableExists();
  if (!exists) {
    return 0;
  }

  const result = await pool.query(`
    SELECT COUNT(*)::int AS due_count
    FROM public.helpdesk_calibration_orders
    WHERE status = 'SCHEDULED'
      AND scheduled_for <= CURRENT_DATE + INTERVAL '30 days';
  `);

  return Number(result.rows[0]?.due_count ?? 0);
};
