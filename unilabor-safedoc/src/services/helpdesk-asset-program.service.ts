import pool from '../config/db';
import { withTransaction, type Queryable } from '../utils/transaction';
import { toIsoDate, toIsoDateTime } from '../utils/date-serialization';
import {
  describeInterval,
  requiresResponsibleSignature,
  todayIso,
  type MaintenanceAnchorMode,
  type MaintenanceExecutorKind,
  type MaintenanceIntervalUnit,
  type MaintenanceProgramSourceKind,
  type MaintenanceServiceKind,
} from './helpdesk-maintenance-recurrence';
import {
  clearUntouchedProjection,
  ensurePlanProjection,
  insertScheduledOrder,
  regeneratePlanProjection,
  regenerateProgramProjection,
  resyncPlanNextDue,
} from './helpdesk-maintenance-projection.service';

/**
 * Programa de mantenimiento personalizado por activo (ISO 15189:2022 6.4.5).
 * Un programa agrupa rutinas (planes del motor de mantenimiento) bajo una
 * version con fuente documentada. Crear una version nueva sustituye a la
 * activa: las rutinas que se conservan se re-apuntan, las que no se desactivan.
 * Las ordenes ejecutadas nunca se tocan (conservan program_version).
 */

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export interface RoutineTaskInput {
  id?: number | null | undefined;
  task_text: string;
  is_required?: boolean | undefined;
}

export interface RoutineInput {
  plan_id?: number | null | undefined;
  template_routine_id?: number | null | undefined;
  service_kind: MaintenanceServiceKind;
  title: string;
  description?: string | null | undefined;
  schedule_mode?: 'FREQUENCY' | 'CALENDAR' | undefined;
  frequency_id?: number | null | undefined;
  custom_interval_value?: number | null | undefined;
  custom_interval_unit?: MaintenanceIntervalUnit | null | undefined;
  anchor_mode?: MaintenanceAnchorMode | undefined;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days?: number | undefined;
  tolerance_after_days?: number | undefined;
  recurrence_end_on?: string | null | undefined;
  recurrence_max_occurrences?: number | null | undefined;
  executor_kind: MaintenanceExecutorKind;
  supplier_id?: number | null | undefined;
  responsible_employee_id?: number | null | undefined;
  quality_document_id?: string | null | undefined;
  checklist_required?: boolean | undefined;
  evidence_required?: boolean | undefined;
  deviates_from_template?: boolean | undefined;
  deviation_reason?: string | null | undefined;
  tasks: RoutineTaskInput[];
}

export interface ProgramPayload {
  template_id?: number | null | undefined;
  source_kind: MaintenanceProgramSourceKind;
  source_document_id?: string | null | undefined;
  source_asset_document_id?: number | null | undefined;
  source_reference?: string | null | undefined;
  source_notes?: string | null | undefined;
  effective_from?: string | null | undefined;
  change_reason?: string | null | undefined;
  deviates_from_template?: boolean | undefined;
  deviation_reason?: string | null | undefined;
  projection_months?: number | undefined;
  routines: RoutineInput[];
}

export interface ProgramVersionRecord {
  id: number;
  version: number;
  status: 'ACTIVE' | 'SUPERSEDED';
  template_id: number | null;
  template_name: string | null;
  source_kind: MaintenanceProgramSourceKind;
  source_document_id: string | null;
  source_document_title: string | null;
  source_asset_document_id: number | null;
  source_asset_document_title: string | null;
  source_reference: string | null;
  source_notes: string | null;
  effective_from: string;
  effective_to: string | null;
  change_reason: string | null;
  deviates_from_template: boolean;
  deviation_reason: string | null;
  projection_months: number;
  created_by_name: string | null;
  created_at: string | undefined;
}

export interface RoutineOrderSummary {
  id: number;
  order_code: string;
  scheduled_for: string;
  window_starts_on: string | null;
  window_ends_on: string | null;
  status: string;
  is_projected: boolean;
  completed_at: string | null;
  result: string | null;
}

export interface RoutineRecord {
  id: number;
  plan_code: string;
  program_id: number | null;
  template_routine_id: number | null;
  service_kind: MaintenanceServiceKind;
  title: string;
  description: string | null;
  schedule_mode: 'FREQUENCY' | 'CALENDAR';
  frequency_id: number | null;
  frequency_name: string | null;
  interval_months: number | null;
  custom_interval_value: number | null;
  custom_interval_unit: MaintenanceIntervalUnit | null;
  interval_label: string;
  anchor_mode: MaintenanceAnchorMode;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days: number;
  tolerance_after_days: number;
  recurrence_end_on: string | null;
  recurrence_max_occurrences: number | null;
  paused_at: string | null;
  pause_reason: string | null;
  executor_kind: MaintenanceExecutorKind;
  supplier_id: number | null;
  supplier_name: string | null;
  responsible_employee_id: number | null;
  responsible_employee_name: string | null;
  quality_document_id: string | null;
  quality_document_title: string | null;
  checklist_required: boolean;
  evidence_required: boolean;
  requires_responsible_signature: boolean;
  deviates_from_template: boolean;
  deviation_reason: string | null;
  is_active: boolean;
  tasks: Array<{ id: number; task_text: string; is_required: boolean; sort_order: number }>;
  next_order: RoutineOrderSummary | null;
  overdue_count: number;
  closed_count: number;
  projected_count: number;
  upcoming: RoutineOrderSummary[];
  history: RoutineOrderSummary[];
}

export interface AssetProgramOverview {
  asset: {
    id: number;
    asset_code: string;
    name: string;
    category_name: string | null;
    category_id: number | null;
    criticality_code: string | null;
    criticality_name: string | null;
    unit_name: string | null;
    area_name: string | null;
    responsible_employee_name: string | null;
    assigned_employee_name: string | null;
    operational_status_name: string | null;
    brand_name: string | null;
    model: string | null;
    serial_number: string | null;
  };
  program: ProgramVersionRecord | null;
  routines: RoutineRecord[];
  versions: ProgramVersionRecord[];
}

const mapVersionRow = (row: any): ProgramVersionRecord => ({
  id: Number(row.id),
  version: Number(row.version),
  status: row.status === 'SUPERSEDED' ? 'SUPERSEDED' : 'ACTIVE',
  template_id: row.template_id ? Number(row.template_id) : null,
  template_name: row.template_name ? String(row.template_name) : null,
  source_kind: (row.source_kind ?? 'INTERNAL') as MaintenanceProgramSourceKind,
  source_document_id: row.source_document_id ? String(row.source_document_id) : null,
  source_document_title: row.source_document_title ? String(row.source_document_title) : null,
  source_asset_document_id: row.source_asset_document_id ? Number(row.source_asset_document_id) : null,
  source_asset_document_title: row.source_asset_document_title ? String(row.source_asset_document_title) : null,
  source_reference: row.source_reference ? String(row.source_reference) : null,
  source_notes: row.source_notes ? String(row.source_notes) : null,
  effective_from: row.effective_from ? toIsoDate(row.effective_from) : '',
  effective_to: row.effective_to ? toIsoDate(row.effective_to) : null,
  change_reason: row.change_reason ? String(row.change_reason) : null,
  deviates_from_template: Boolean(row.deviates_from_template),
  deviation_reason: row.deviation_reason ? String(row.deviation_reason) : null,
  projection_months: Number(row.projection_months ?? 12),
  created_by_name: row.created_by_name ? String(row.created_by_name) : null,
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
});

const VERSION_QUERY = `
  SELECT g.*, t.name AS template_name, d.title AS source_document_title, ad.title AS source_asset_document_title,
         u.full_name AS created_by_name
    FROM public.helpdesk_asset_maintenance_programs g
    LEFT JOIN public.helpdesk_maintenance_templates t ON t.id = g.template_id
    LEFT JOIN public.documents d ON d.id = g.source_document_id
    LEFT JOIN public.helpdesk_asset_documents ad ON ad.id = g.source_asset_document_id
    LEFT JOIN public.users u ON u.id = g.created_by_user_id
`;

const mapOrderSummary = (row: any): RoutineOrderSummary => ({
  id: Number(row.id),
  order_code: String(row.order_code),
  scheduled_for: row.scheduled_for ? toIsoDate(row.scheduled_for) : '',
  window_starts_on: row.window_starts_on ? toIsoDate(row.window_starts_on) : null,
  window_ends_on: row.window_ends_on ? toIsoDate(row.window_ends_on) : null,
  status: String(row.status),
  is_projected: Boolean(row.is_projected),
  completed_at: row.completed_at ? toIsoDateTime(row.completed_at) : null,
  result: row.result ? String(row.result) : null,
});

const listRoutineOrders = async (planId: number, executor: Queryable) => {
  const result = await executor.query(
    `
      SELECT id, order_code, scheduled_for, window_starts_on, window_ends_on, status, is_projected, completed_at, result
        FROM public.helpdesk_maintenance_orders
       WHERE plan_id = $1
       ORDER BY scheduled_for ASC, id ASC;
    `,
    [planId],
  );
  const all = result.rows.map(mapOrderSummary);
  const today = todayIso();
  const open = all.filter((o) => o.status !== 'CLOSED');
  return {
    next_order: open[0] ?? null,
    upcoming: open.slice(0, 12),
    history: all.filter((o) => o.status === 'CLOSED').slice(-12).reverse(),
    overdue_count: open.filter((o) => o.window_ends_on && o.window_ends_on < today).length,
    closed_count: all.filter((o) => o.status === 'CLOSED').length,
    projected_count: all.filter((o) => o.is_projected && o.status === 'SCHEDULED').length,
  };
};

const ROUTINE_QUERY = `
  SELECT p.*, f.name AS frequency_name, f.interval_months,
         s.name AS supplier_name, e.full_name AS responsible_employee_name, d.title AS quality_document_title,
         cr.code AS criticality_code
    FROM public.helpdesk_maintenance_plans p
    LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = p.frequency_id
    LEFT JOIN public.helpdesk_suppliers s ON s.id = p.supplier_id
    LEFT JOIN public.employees e ON e.id = p.responsible_employee_id
    LEFT JOIN public.documents d ON d.id = p.quality_document_id
    LEFT JOIN public.helpdesk_assets a ON a.id = p.asset_id
    LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
`;

const mapRoutineRow = async (row: any, executor: Queryable): Promise<RoutineRecord> => {
  const planId = Number(row.id);
  const tasks = await executor.query(
    `SELECT id, task_text, is_required, sort_order FROM public.helpdesk_maintenance_plan_tasks WHERE plan_id = $1 ORDER BY sort_order, id;`,
    [planId],
  );
  const intervalMonths = row.interval_months ? Number(row.interval_months) : null;
  const customValue = row.custom_interval_value ? Number(row.custom_interval_value) : null;
  const customUnit = (row.custom_interval_unit as MaintenanceIntervalUnit | null) ?? null;
  const executorKind = (row.executor_kind ?? 'INTERNAL_TECH') as MaintenanceExecutorKind;
  const orders = await listRoutineOrders(planId, executor);
  return {
    id: planId,
    plan_code: String(row.plan_code),
    program_id: row.program_id ? Number(row.program_id) : null,
    template_routine_id: row.template_routine_id ? Number(row.template_routine_id) : null,
    service_kind: (row.service_kind ?? 'PREVENTIVE') as MaintenanceServiceKind,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    schedule_mode: row.schedule_mode === 'CALENDAR' ? 'CALENDAR' : 'FREQUENCY',
    frequency_id: row.frequency_id ? Number(row.frequency_id) : null,
    frequency_name: row.frequency_name ? String(row.frequency_name) : null,
    interval_months: intervalMonths,
    custom_interval_value: customValue,
    custom_interval_unit: customUnit,
    interval_label:
      row.schedule_mode === 'CALENDAR'
        ? 'Cronograma provisto'
        : describeInterval({
            interval_months: intervalMonths,
            custom_interval_value: customValue,
            custom_interval_unit: customUnit,
            anchor_mode: 'FIXED',
            recurrence_end_on: null,
            recurrence_max_occurrences: null,
          }),
    anchor_mode: row.anchor_mode === 'FLOATING' ? 'FLOATING' : 'FIXED',
    starts_on: row.starts_on ? toIsoDate(row.starts_on) : '',
    next_due_on: row.next_due_on ? toIsoDate(row.next_due_on) : '',
    tolerance_before_days: Number(row.tolerance_before_days ?? 0),
    tolerance_after_days: Number(row.tolerance_after_days ?? 0),
    recurrence_end_on: row.recurrence_end_on ? toIsoDate(row.recurrence_end_on) : null,
    recurrence_max_occurrences: row.recurrence_max_occurrences ? Number(row.recurrence_max_occurrences) : null,
    paused_at: row.paused_at ? toIsoDateTime(row.paused_at) : null,
    pause_reason: row.pause_reason ? String(row.pause_reason) : null,
    executor_kind: executorKind,
    supplier_id: row.supplier_id ? Number(row.supplier_id) : null,
    supplier_name: row.supplier_name ? String(row.supplier_name) : null,
    responsible_employee_id: row.responsible_employee_id ? Number(row.responsible_employee_id) : null,
    responsible_employee_name: row.responsible_employee_name ? String(row.responsible_employee_name) : null,
    quality_document_id: row.quality_document_id ? String(row.quality_document_id) : null,
    quality_document_title: row.quality_document_title ? String(row.quality_document_title) : null,
    checklist_required: Boolean(row.checklist_required),
    evidence_required: Boolean(row.evidence_required),
    requires_responsible_signature: requiresResponsibleSignature(executorKind, row.criticality_code ? String(row.criticality_code) : null),
    deviates_from_template: Boolean(row.deviates_from_template),
    deviation_reason: row.deviation_reason ? String(row.deviation_reason) : null,
    is_active: Boolean(row.is_active),
    tasks: tasks.rows.map((t) => ({
      id: Number(t.id),
      task_text: String(t.task_text),
      is_required: Boolean(t.is_required),
      sort_order: Number(t.sort_order ?? 0),
    })),
    ...orders,
  };
};

export const getRoutineById = async (planId: number, executor: Queryable = pool): Promise<RoutineRecord | null> => {
  const result = await executor.query(`${ROUTINE_QUERY} WHERE p.id = $1 LIMIT 1;`, [planId]);
  return result.rows[0] ? mapRoutineRow(result.rows[0], executor) : null;
};

export const getAssetProgramOverview = async (assetId: number): Promise<AssetProgramOverview | null> => {
  const assetResult = await pool.query(
    `
      SELECT a.id, a.asset_code, a.name, a.model, a.serial_number, a.category_id,
             c.name AS category_name, cr.code AS criticality_code, cr.name AS criticality_name,
             u.name AS unit_name, ar.name AS area_name, os.name AS operational_status_name, b.name AS brand_name,
             re.full_name AS responsible_employee_name, ae.full_name AS assigned_employee_name
        FROM public.helpdesk_assets a
        LEFT JOIN public.helpdesk_asset_categories c ON c.id = a.category_id
        LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
        LEFT JOIN public.helpdesk_asset_units u ON u.id = a.unit_id
        LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
        LEFT JOIN public.helpdesk_operational_statuses os ON os.id = a.operational_status_id
        LEFT JOIN public.helpdesk_asset_brands b ON b.id = a.brand_id
        LEFT JOIN public.employees re ON re.id = a.responsible_employee_id
        LEFT JOIN public.employees ae ON ae.id = a.assigned_employee_id
       WHERE a.id = $1
       LIMIT 1;
    `,
    [assetId],
  );
  const a = assetResult.rows[0];
  if (!a) {
    return null;
  }
  const versionsResult = await pool.query(`${VERSION_QUERY} WHERE g.asset_id = $1 ORDER BY g.version DESC;`, [assetId]);
  const versions = versionsResult.rows.map(mapVersionRow);
  const program = versions.find((v) => v.status === 'ACTIVE') ?? null;
  const routinesResult = program
    ? await pool.query(`${ROUTINE_QUERY} WHERE p.program_id = $1 AND p.is_active = TRUE ORDER BY p.service_kind, p.next_due_on, p.id;`, [program.id])
    : { rows: [] as any[] };
  const routines = await Promise.all(routinesResult.rows.map((row) => mapRoutineRow(row, pool)));
  return {
    asset: {
      id: Number(a.id),
      asset_code: String(a.asset_code),
      name: String(a.name),
      category_id: a.category_id ? Number(a.category_id) : null,
      category_name: a.category_name ? String(a.category_name) : null,
      criticality_code: a.criticality_code ? String(a.criticality_code) : null,
      criticality_name: a.criticality_name ? String(a.criticality_name) : null,
      unit_name: a.unit_name ? String(a.unit_name) : null,
      area_name: a.area_name ? String(a.area_name) : null,
      responsible_employee_name: a.responsible_employee_name ? String(a.responsible_employee_name) : null,
      assigned_employee_name: a.assigned_employee_name ? String(a.assigned_employee_name) : null,
      operational_status_name: a.operational_status_name ? String(a.operational_status_name) : null,
      brand_name: a.brand_name ? String(a.brand_name) : null,
      model: a.model ? String(a.model) : null,
      serial_number: a.serial_number ? String(a.serial_number) : null,
    },
    program,
    routines,
    versions,
  };
};

const generatePlanCode = async (executor: Queryable): Promise<string> => {
  const result = await executor.query(`SELECT nextval('public.helpdesk_maintenance_plan_code_seq') AS next_id;`);
  return `MP-${String(Number(result.rows[0]?.next_id ?? 0)).padStart(6, '0')}`;
};

const saveRoutineTasks = async (planId: number, tasks: RoutineTaskInput[], executor: Queryable): Promise<void> => {
  const keep: number[] = [];
  for (const [index, task] of tasks.entries()) {
    const text = normalizeText(task.task_text);
    if (!text) {
      continue;
    }
    if (task.id) {
      const updated = await executor.query(
        `UPDATE public.helpdesk_maintenance_plan_tasks SET task_text = $2, is_required = $3, sort_order = $4 WHERE id = $1 AND plan_id = $5 RETURNING id;`,
        [task.id, text, task.is_required ?? true, (index + 1) * 10, planId],
      );
      if (updated.rows[0]) {
        keep.push(Number(updated.rows[0].id));
        continue;
      }
    }
    const inserted = await executor.query(
      `INSERT INTO public.helpdesk_maintenance_plan_tasks (plan_id, task_text, is_required, sort_order) VALUES ($1, $2, $3, $4) RETURNING id;`,
      [planId, text, task.is_required ?? true, (index + 1) * 10],
    );
    keep.push(Number(inserted.rows[0].id));
  }
  // El checklist de las ordenes cerradas conserva el texto (plan_task_id pasa a NULL): no se pierde evidencia.
  await executor.query(`DELETE FROM public.helpdesk_maintenance_plan_tasks WHERE plan_id = $1 AND NOT (id = ANY($2::bigint[]));`, [planId, keep]);
};

const routineValues = (routine: RoutineInput, userId: string | null | undefined) => [
  routine.service_kind,
  routine.title.trim(),
  normalizeText(routine.description),
  routine.schedule_mode === 'CALENDAR' ? 'CALENDAR' : 'FREQUENCY',
  routine.frequency_id ?? null,
  routine.custom_interval_value ?? null,
  routine.custom_interval_unit ?? null,
  routine.anchor_mode === 'FLOATING' ? 'FLOATING' : 'FIXED',
  routine.starts_on,
  routine.next_due_on,
  Math.max(Number(routine.tolerance_before_days ?? 0), 0),
  Math.max(Number(routine.tolerance_after_days ?? 0), 0),
  routine.recurrence_end_on ?? null,
  routine.recurrence_max_occurrences ?? null,
  routine.executor_kind,
  routine.supplier_id ?? null,
  routine.responsible_employee_id ?? null,
  routine.quality_document_id ?? null,
  routine.checklist_required ?? true,
  routine.evidence_required ?? true,
  routine.template_routine_id ?? null,
  routine.deviates_from_template ?? false,
  normalizeText(routine.deviation_reason),
  userId ?? null,
];

const ROUTINE_COLUMNS = `
  service_kind = $2, title = $3, description = $4, schedule_mode = $5, frequency_id = $6, custom_interval_value = $7,
  custom_interval_unit = $8, anchor_mode = $9, starts_on = $10, next_due_on = $11, tolerance_before_days = $12,
  tolerance_after_days = $13, recurrence_end_on = $14, recurrence_max_occurrences = $15, executor_kind = $16,
  supplier_id = $17, responsible_employee_id = $18, quality_document_id = $19, checklist_required = $20,
  evidence_required = $21, template_routine_id = $22, deviates_from_template = $23, deviation_reason = $24,
  updated_by_user_id = $25, updated_at = NOW()
`;

const assertRoutineInput = (routine: RoutineInput): void => {
  if (routine.schedule_mode !== 'CALENDAR' && !routine.frequency_id && !(routine.custom_interval_value && routine.custom_interval_unit)) {
    throwCoded('HELPDESK_PROGRAM_ROUTINE_WITHOUT_INTERVAL', `La rutina "${routine.title}" necesita una frecuencia o un intervalo personalizado.`);
  }
  if (routine.executor_kind === 'EXTERNAL_PROVIDER' && !routine.supplier_id) {
    throwCoded('HELPDESK_PROGRAM_ROUTINE_WITHOUT_SUPPLIER', `La rutina "${routine.title}" la ejecuta un proveedor: selecciona el proveedor del catalogo.`);
  }
};

const createRoutine = async (
  programId: number,
  programVersion: number,
  assetId: number,
  criticalityCode: string | null,
  routine: RoutineInput,
  userId: string | null | undefined,
  executor: Queryable,
): Promise<number> => {
  const planCode = await generatePlanCode(executor);
  const inserted = await executor.query(
    `
      INSERT INTO public.helpdesk_maintenance_plans (
        plan_code, asset_id, program_id, service_kind, title, description, schedule_mode, frequency_id,
        custom_interval_value, custom_interval_unit, anchor_mode, starts_on, next_due_on, tolerance_before_days,
        tolerance_after_days, recurrence_end_on, recurrence_max_occurrences, executor_kind, supplier_id,
        responsible_employee_id, quality_document_id, checklist_required, evidence_required, template_routine_id,
        deviates_from_template, deviation_reason, created_by_user_id, updated_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $27)
      RETURNING id;
    `,
    [planCode, assetId, programId, ...routineValues(routine, userId)],
  );
  const planId = Number(inserted.rows[0].id);
  await saveRoutineTasks(planId, routine.tasks, executor);
  if (routine.schedule_mode !== 'CALENDAR') {
    await insertScheduledOrder(executor, {
      planId,
      assetId,
      scheduledFor: routine.next_due_on,
      beforeDays: Math.max(Number(routine.tolerance_before_days ?? 0), 0),
      afterDays: Math.max(Number(routine.tolerance_after_days ?? 0), 0),
      criticalityCode,
      serviceKind: routine.service_kind,
      programVersion,
      isProjected: false,
      userId,
    });
    await ensurePlanProjection(planId, { userId }, executor);
  }
  return planId;
};

const getAssetCriticality = async (assetId: number, executor: Queryable): Promise<string | null> => {
  const result = await executor.query(
    `SELECT cr.code FROM public.helpdesk_assets a LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id WHERE a.id = $1 LIMIT 1;`,
    [assetId],
  );
  if (result.rows.length === 0) {
    throwCoded('HELPDESK_ASSET_NOT_FOUND', 'El activo no existe.');
  }
  return result.rows[0]?.code ? String(result.rows[0].code) : null;
};

/**
 * Crea una version del programa del activo (v1 o siguiente). Si hay una activa,
 * la sustituye: rutinas con plan_id se conservan y actualizan; las demas de la
 * version anterior se desactivan (sus ordenes proyectadas intactas se retiran).
 */
export const createAssetProgramVersion = async (
  assetId: number,
  payload: ProgramPayload,
  userId?: string | null,
): Promise<AssetProgramOverview> => {
  if (payload.routines.length === 0) {
    throwCoded('HELPDESK_PROGRAM_WITHOUT_ROUTINES', 'El programa necesita al menos una rutina.');
  }
  payload.routines.forEach(assertRoutineInput);

  await withTransaction(async (client) => {
    const criticalityCode = await getAssetCriticality(assetId, client);
    const effectiveFrom = payload.effective_from ?? todayIso();

    const activeResult = await client.query(
      `SELECT id, version FROM public.helpdesk_asset_maintenance_programs WHERE asset_id = $1 AND status = 'ACTIVE' LIMIT 1 FOR UPDATE;`,
      [assetId],
    );
    const previous = activeResult.rows[0] ? { id: Number(activeResult.rows[0].id), version: Number(activeResult.rows[0].version) } : null;
    const nextVersion = previous ? previous.version + 1 : 1;
    if (previous) {
      if (!normalizeText(payload.change_reason)) {
        throwCoded('HELPDESK_PROGRAM_CHANGE_REASON_REQUIRED', 'Indica el motivo del cambio para crear la nueva version del programa.');
      }
      await client.query(
        `UPDATE public.helpdesk_asset_maintenance_programs SET status = 'SUPERSEDED', effective_to = $2::date - 1, updated_at = NOW() WHERE id = $1;`,
        [previous.id, effectiveFrom],
      );
    }

    const created = await client.query(
      `
        INSERT INTO public.helpdesk_asset_maintenance_programs (
          asset_id, version, status, template_id, source_kind, source_document_id, source_asset_document_id,
          source_reference, source_notes, effective_from, change_reason, deviates_from_template, deviation_reason,
          projection_months, created_by_user_id
        ) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id;
      `,
      [
        assetId,
        nextVersion,
        payload.template_id ?? null,
        payload.source_kind,
        payload.source_document_id ?? null,
        payload.source_asset_document_id ?? null,
        normalizeText(payload.source_reference),
        normalizeText(payload.source_notes),
        effectiveFrom,
        normalizeText(payload.change_reason),
        payload.deviates_from_template ?? false,
        normalizeText(payload.deviation_reason),
        Math.min(Math.max(Number(payload.projection_months ?? 12), 1), 36),
        userId ?? null,
      ],
    );
    const programId = Number(created.rows[0].id);

    const keptPlanIds: number[] = [];
    for (const routine of payload.routines) {
      if (routine.plan_id) {
        const updated = await client.query(
          `UPDATE public.helpdesk_maintenance_plans SET program_id = $26, ${ROUTINE_COLUMNS} WHERE id = $1 AND asset_id = $27 RETURNING id;`,
          [routine.plan_id, ...routineValues(routine, userId), programId, assetId],
        );
        if (!updated.rows[0]) {
          throwCoded('HELPDESK_PROGRAM_ROUTINE_NOT_FOUND', `La rutina ${routine.plan_id} no pertenece a este activo.`);
        }
        await saveRoutineTasks(routine.plan_id, routine.tasks, client);
        await regeneratePlanProjection(routine.plan_id, { userId }, client);
        keptPlanIds.push(routine.plan_id);
      } else {
        keptPlanIds.push(await createRoutine(programId, nextVersion, assetId, criticalityCode, routine, userId, client));
      }
    }

    if (previous) {
      const dropped = await client.query(
        `SELECT id FROM public.helpdesk_maintenance_plans WHERE program_id = $1 AND is_active = TRUE AND NOT (id = ANY($2::bigint[]));`,
        [previous.id, keptPlanIds],
      );
      for (const row of dropped.rows) {
        await clearUntouchedProjection(Number(row.id), client);
        await client.query(
          `UPDATE public.helpdesk_maintenance_plans SET is_active = FALSE, updated_by_user_id = $2, updated_at = NOW() WHERE id = $1;`,
          [Number(row.id), userId ?? null],
        );
      }
    }
  });

  const overview = await getAssetProgramOverview(assetId);
  if (!overview) {
    return throwCoded('HELPDESK_ASSET_NOT_FOUND', 'El activo no existe.');
  }
  return overview;
};

/** Actualiza una rutina de la version activa y regenera su proyeccion. */
export const updateRoutine = async (planId: number, routine: RoutineInput, userId?: string | null): Promise<RoutineRecord | null> => {
  assertRoutineInput(routine);
  const current = await getRoutineById(planId);
  if (!current) {
    return null;
  }
  await withTransaction(async (client) => {
    await client.query(`UPDATE public.helpdesk_maintenance_plans SET ${ROUTINE_COLUMNS} WHERE id = $1;`, [planId, ...routineValues(routine, userId)]);
    await saveRoutineTasks(planId, routine.tasks, client);
    if (routine.schedule_mode !== 'CALENDAR') {
      const pending = await client.query(
        `SELECT COUNT(*)::int AS n FROM public.helpdesk_maintenance_orders WHERE plan_id = $1 AND status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS', 'PENDING_VALIDATION');`,
        [planId],
      );
      await clearUntouchedProjection(planId, client);
      const stillPending = await client.query(
        `SELECT COUNT(*)::int AS n FROM public.helpdesk_maintenance_orders WHERE plan_id = $1 AND status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS', 'PENDING_VALIDATION');`,
        [planId],
      );
      if (Number(pending.rows[0]?.n ?? 0) === 0 || Number(stillPending.rows[0]?.n ?? 0) === 0) {
        // Sin ordenes pendientes: la nueva "proxima ejecucion" arranca la cadena.
        const planRow = await client.query(
          `SELECT p.asset_id, g.version FROM public.helpdesk_maintenance_plans p
             LEFT JOIN public.helpdesk_asset_maintenance_programs g ON g.id = p.program_id WHERE p.id = $1;`,
          [planId],
        );
        const assetId = Number(planRow.rows[0].asset_id);
        await insertScheduledOrder(client, {
          planId,
          assetId,
          scheduledFor: routine.next_due_on,
          beforeDays: Math.max(Number(routine.tolerance_before_days ?? 0), 0),
          afterDays: Math.max(Number(routine.tolerance_after_days ?? 0), 0),
          criticalityCode: await getAssetCriticality(assetId, client),
          serviceKind: routine.service_kind,
          programVersion: planRow.rows[0].version ? Number(planRow.rows[0].version) : null,
          isProjected: false,
          userId,
        });
      }
      await ensurePlanProjection(planId, { userId }, client);
    } else {
      await resyncPlanNextDue(planId, userId, client);
    }
  });
  return getRoutineById(planId);
};

export const pauseRoutine = async (planId: number, reason: string, userId?: string | null): Promise<RoutineRecord | null> => {
  const current = await getRoutineById(planId);
  if (!current) {
    return null;
  }
  if (current.paused_at) {
    throwCoded('HELPDESK_PROGRAM_ROUTINE_ALREADY_PAUSED', 'La rutina ya esta pausada.');
  }
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.helpdesk_maintenance_plans SET paused_at = NOW(), pause_reason = $2, updated_by_user_id = $3, updated_at = NOW() WHERE id = $1;`,
      [planId, reason.trim(), userId ?? null],
    );
    await clearUntouchedProjection(planId, client);
  });
  return getRoutineById(planId);
};

export const resumeRoutine = async (planId: number, nextDueOn: string | null, userId?: string | null): Promise<RoutineRecord | null> => {
  const current = await getRoutineById(planId);
  if (!current) {
    return null;
  }
  if (!current.paused_at) {
    throwCoded('HELPDESK_PROGRAM_ROUTINE_NOT_PAUSED', 'La rutina no esta pausada.');
  }
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.helpdesk_maintenance_plans SET paused_at = NULL, pause_reason = NULL, next_due_on = COALESCE($2, next_due_on), updated_by_user_id = $3, updated_at = NOW() WHERE id = $1;`,
      [planId, nextDueOn, userId ?? null],
    );
    if (nextDueOn && current.schedule_mode === 'FREQUENCY') {
      const assetRow = await client.query(
        `SELECT p.asset_id, cr.code AS criticality_code, g.version FROM public.helpdesk_maintenance_plans p
           LEFT JOIN public.helpdesk_assets a ON a.id = p.asset_id LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
           LEFT JOIN public.helpdesk_asset_maintenance_programs g ON g.id = p.program_id WHERE p.id = $1;`,
        [planId],
      );
      await insertScheduledOrder(client, {
        planId,
        assetId: Number(assetRow.rows[0].asset_id),
        scheduledFor: nextDueOn,
        beforeDays: current.tolerance_before_days,
        afterDays: current.tolerance_after_days,
        criticalityCode: assetRow.rows[0].criticality_code ? String(assetRow.rows[0].criticality_code) : null,
        serviceKind: current.service_kind,
        programVersion: assetRow.rows[0].version ? Number(assetRow.rows[0].version) : null,
        isProjected: false,
        userId,
      });
    }
    await ensurePlanProjection(planId, { userId }, client);
  });
  return getRoutineById(planId);
};

export const deactivateRoutine = async (planId: number, userId?: string | null): Promise<boolean> => {
  return withTransaction(async (client) => {
    await clearUntouchedProjection(planId, client);
    const result = await client.query(
      `UPDATE public.helpdesk_maintenance_plans SET is_active = FALSE, updated_by_user_id = $2, updated_at = NOW() WHERE id = $1 AND is_active = TRUE;`,
      [planId, userId ?? null],
    );
    return (result.rowCount ?? 0) > 0;
  });
};

export const setProgramProjectionMonths = async (programId: number, months: number, userId?: string | null): Promise<number> => {
  return withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE public.helpdesk_asset_maintenance_programs SET projection_months = $2, updated_at = NOW() WHERE id = $1 AND status = 'ACTIVE' RETURNING id;`,
      [programId, Math.min(Math.max(months, 1), 36)],
    );
    if (!updated.rows[0]) {
      throwCoded('HELPDESK_PROGRAM_NOT_FOUND', 'El programa activo no existe.');
    }
    return regenerateProgramProjection(programId, userId, client);
  });
};

/**
 * Propuesta de rutinas a partir de una plantilla, sin guardar: la UI la muestra
 * para que Help Desk la ajuste al plan del fabricante antes de activar.
 */
export const proposeRoutinesFromTemplate = async (templateId: number, startsOn: string): Promise<RoutineInput[]> => {
  const result = await pool.query(
    `SELECT r.* FROM public.helpdesk_maintenance_template_routines r WHERE r.template_id = $1 ORDER BY r.sort_order, r.id;`,
    [templateId],
  );
  return Promise.all(
    result.rows.map(async (row) => {
      const tasks = await pool.query(
        `SELECT task_text, is_required FROM public.helpdesk_maintenance_template_tasks WHERE routine_id = $1 ORDER BY sort_order, id;`,
        [row.id],
      );
      return {
        template_routine_id: Number(row.id),
        service_kind: (row.service_kind ?? 'PREVENTIVE') as MaintenanceServiceKind,
        title: String(row.title),
        description: row.description ? String(row.description) : null,
        schedule_mode: 'FREQUENCY' as const,
        frequency_id: row.frequency_id ? Number(row.frequency_id) : null,
        custom_interval_value: row.custom_interval_value ? Number(row.custom_interval_value) : null,
        custom_interval_unit: (row.custom_interval_unit as MaintenanceIntervalUnit | null) ?? null,
        anchor_mode: 'FIXED' as const,
        starts_on: startsOn,
        next_due_on: startsOn,
        tolerance_before_days: Number(row.window_before_days ?? 0),
        tolerance_after_days: Number(row.window_after_days ?? 0),
        executor_kind: (row.executor_kind ?? 'INTERNAL_TECH') as MaintenanceExecutorKind,
        checklist_required: Boolean(row.checklist_required),
        evidence_required: Boolean(row.evidence_required),
        tasks: tasks.rows.map((t) => ({ task_text: String(t.task_text), is_required: Boolean(t.is_required) })),
      };
    }),
  );
};
