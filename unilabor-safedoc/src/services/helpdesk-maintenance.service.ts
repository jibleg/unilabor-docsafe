import pool from '../config/db';
import type { HelpdeskCatalogItem } from './helpdesk-asset.service';

export interface HelpdeskMaintenancePlanPayload {
  asset_id: number;
  frequency_id?: number | null;
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
  plan_id: number;
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
  created_at?: string;
  updated_at?: string;
  plan?: {
    id: number;
    plan_code: string;
    title: string;
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

const generatePlanCode = async (): Promise<string> => {
  const result = await pool.query(`
    SELECT COALESCE(MAX(id), 0) + 1 AS next_id
    FROM public.helpdesk_maintenance_plans;
  `);
  return `MP-${String(Number(result.rows[0]?.next_id ?? 0)).padStart(6, '0')}`;
};

const generateOrderCode = async (): Promise<string> => {
  const result = await pool.query(`
    SELECT COALESCE(MAX(id), 0) + 1 AS next_id
    FROM public.helpdesk_maintenance_orders;
  `);
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
    d.filename AS quality_document_filename
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
    scheduled_for: row.scheduled_for ? String(row.scheduled_for) : '',
    window_starts_on: row.window_starts_on ? String(row.window_starts_on) : null,
    window_ends_on: row.window_ends_on ? String(row.window_ends_on) : null,
    status: String(row.status),
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    result: row.result ? String(row.result) : null,
  }));
};

const buildOrderQuery = () => `
  SELECT
    o.*,
    p.plan_code,
    p.title AS plan_title,
    p.frequency_id,
    p.tolerance_before_days,
    p.tolerance_after_days,
    f.interval_months,
    a.asset_code,
    a.name AS asset_name
  FROM public.helpdesk_maintenance_orders o
  INNER JOIN public.helpdesk_maintenance_plans p ON p.id = o.plan_id
  INNER JOIN public.helpdesk_assets a ON a.id = o.asset_id
  LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = p.frequency_id
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
    plan_id: Number(row.plan_id),
    asset_id: Number(row.asset_id),
    scheduled_for: row.scheduled_for ? String(row.scheduled_for) : '',
    window_starts_on: row.window_starts_on ? String(row.window_starts_on) : null,
    window_ends_on: row.window_ends_on ? String(row.window_ends_on) : null,
    status: String(row.status),
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    completed_by_user_id: row.completed_by_user_id ? String(row.completed_by_user_id) : null,
    performed_activities: row.performed_activities ? String(row.performed_activities) : null,
    findings: row.findings ? String(row.findings) : null,
    provider_name: row.provider_name ? String(row.provider_name) : null,
    result: row.result ? String(row.result) : null,
    evidence_notes: row.evidence_notes ? String(row.evidence_notes) : null,
    rescheduled_from: row.rescheduled_from ? String(row.rescheduled_from) : null,
    rescheduled_at: row.rescheduled_at ? String(row.rescheduled_at) : null,
    reschedule_reason: row.reschedule_reason ? String(row.reschedule_reason) : null,
    plan: row.plan_id
      ? {
          id: Number(row.plan_id),
          plan_code: String(row.plan_code ?? ''),
          title: String(row.plan_title ?? ''),
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
    checklist: await listOrderChecklist(orderId),
  };

  if (row.created_at) {
    order.created_at = String(row.created_at);
  }
  if (row.updated_at) {
    order.updated_at = String(row.updated_at);
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
    responsible_employee_id: row.responsible_employee_id ? Number(row.responsible_employee_id) : null,
    quality_document_id: row.quality_document_id ? String(row.quality_document_id) : null,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    provider_name: row.provider_name ? String(row.provider_name) : null,
    starts_on: row.starts_on ? String(row.starts_on) : '',
    next_due_on: row.next_due_on ? String(row.next_due_on) : '',
    tolerance_before_days: Number(row.tolerance_before_days ?? 0),
    tolerance_after_days: Number(row.tolerance_after_days ?? 0),
    checklist_required: Boolean(row.checklist_required),
    evidence_required: Boolean(row.evidence_required),
    is_active: Boolean(row.is_active),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
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

export const listMaintenanceOrders = async (): Promise<HelpdeskMaintenanceOrderRecord[]> => {
  await assertMaintenanceTables();

  const result = await pool.query(`
    ${buildOrderQuery()}
    ORDER BY
      CASE o.status
        WHEN 'IN_PROGRESS' THEN 1
        WHEN 'SCHEDULED' THEN 2
        WHEN 'RESCHEDULED' THEN 3
        WHEN 'CLOSED' THEN 4
        ELSE 5
      END,
      o.scheduled_for ASC,
      o.updated_at DESC;
  `);

  return Promise.all(result.rows.map(mapOrderRow));
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
) => {
  const orderCode = await generateOrderCode();

  await pool.query(
    `
      INSERT INTO public.helpdesk_maintenance_orders (
        order_code,
        plan_id,
        asset_id,
        scheduled_for,
        window_starts_on,
        window_ends_on,
        created_by_user_id
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

export const createMaintenancePlan = async (
  payload: HelpdeskMaintenancePlanPayload,
  userId?: string | null,
): Promise<HelpdeskMaintenancePlanRecord> => {
  await assertMaintenanceTables();

  const planCode = await generatePlanCode();
  const result = await pool.query(
    `
      INSERT INTO public.helpdesk_maintenance_plans (
        plan_code,
        asset_id,
        frequency_id,
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
        $9, $10, $11, $12, $13, $14, $15, $15
      )
      RETURNING id;
    `,
    [
      planCode,
      payload.asset_id,
      payload.frequency_id ?? null,
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

  const planId = Number(result.rows[0]?.id);
  const tasks = (payload.tasks ?? []).map((task) => task.trim()).filter(Boolean);

  for (const [index, task] of tasks.entries()) {
    await pool.query(
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
  );

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

  await pool.query(
    `
      UPDATE public.helpdesk_maintenance_plans
      SET
        asset_id = $1,
        frequency_id = $2,
        responsible_employee_id = $3,
        provider_name = $4,
        quality_document_id = $5,
        title = $6,
        description = $7,
        starts_on = $8,
        next_due_on = $9,
        tolerance_before_days = $10,
        tolerance_after_days = $11,
        checklist_required = $12,
        evidence_required = $13,
        updated_by_user_id = $14,
        updated_at = NOW()
      WHERE id = $15;
    `,
    [
      payload.asset_id,
      payload.frequency_id ?? null,
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

  await pool.query('DELETE FROM public.helpdesk_maintenance_plan_tasks WHERE plan_id = $1;', [planId]);
  const tasks = (payload.tasks ?? []).map((task) => task.trim()).filter(Boolean);
  for (const [index, task] of tasks.entries()) {
    await pool.query(
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
  );

  return getMaintenancePlanById(planId);
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

  await pool.query(
    `
      UPDATE public.helpdesk_maintenance_orders
      SET
        status = 'IN_PROGRESS',
        started_at = COALESCE(started_at, NOW()),
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

  const beforeDays = current.plan?.tolerance_before_days ?? 0;
  const afterDays = current.plan?.tolerance_after_days ?? 0;

  await pool.query(
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
        updated_by_user_id = $6,
        updated_at = NOW()
      WHERE id = $1
        AND status IN ('SCHEDULED', 'RESCHEDULED');
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

  await pool.query(
    `
      UPDATE public.helpdesk_maintenance_plans
      SET next_due_on = $2, updated_by_user_id = $3, updated_at = NOW()
      WHERE id = $1;
    `,
    [current.plan_id, payload.scheduled_for, userId ?? null],
  );

  return getMaintenanceOrderById(orderId);
};

export const closeMaintenanceOrder = async (
  orderId: number,
  payload: HelpdeskMaintenanceOrderClosePayload,
  userId?: string | null,
): Promise<HelpdeskMaintenanceOrderRecord | null> => {
  await assertMaintenanceTables();

  const current = await getMaintenanceOrderById(orderId);
  if (!current) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.helpdesk_maintenance_orders
      SET
        status = 'CLOSED',
        started_at = COALESCE(started_at, NOW()),
        completed_at = $2,
        completed_by_user_id = $3,
        performed_activities = $4,
        findings = $5,
        provider_name = $6,
        result = $7,
        evidence_notes = $8,
        updated_by_user_id = $3,
        updated_at = NOW()
      WHERE id = $1;
    `,
    [
      orderId,
      payload.completed_at,
      userId ?? null,
      payload.performed_activities.trim(),
      normalizeOptionalText(payload.findings),
      normalizeOptionalText(payload.provider_name),
      payload.result.trim(),
      normalizeOptionalText(payload.evidence_notes),
    ],
  );

  await pool.query('DELETE FROM public.helpdesk_maintenance_order_checklist WHERE order_id = $1;', [orderId]);

  const checklist = payload.checklist ?? [];
  for (const [index, item] of checklist.entries()) {
    const taskText = normalizeOptionalText(item.task_text);
    if (!taskText) {
      continue;
    }

    await pool.query(
      `
        INSERT INTO public.helpdesk_maintenance_order_checklist (
          order_id,
          plan_task_id,
          task_text,
          result,
          notes,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6);
      `,
      [
        orderId,
        item.plan_task_id ?? null,
        taskText,
        normalizeOptionalText(item.result) ?? 'PENDING',
        normalizeOptionalText(item.notes),
        (index + 1) * 10,
      ],
    );
  }

  if (current.plan?.interval_months && current.plan.interval_months > 0) {
    const nextDueOn = addMonths(current.scheduled_for, current.plan.interval_months);
    await pool.query(
      `
        UPDATE public.helpdesk_maintenance_plans
        SET next_due_on = $2, updated_by_user_id = $3, updated_at = NOW()
        WHERE id = $1;
      `,
      [current.plan_id, nextDueOn, userId ?? null],
    );

    await createScheduledOrder(
      current.plan_id,
      current.asset_id,
      nextDueOn,
      current.plan.tolerance_before_days,
      current.plan.tolerance_after_days,
      userId,
    );
  }

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
