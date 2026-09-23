import pool from '../config/db';
import type { Queryable } from '../utils/transaction';
import { toIsoDate } from '../utils/date-serialization';
import {
  addMonthsIso,
  computeNextDate,
  computeWindow,
  projectDates,
  todayIso,
  type MaintenanceAnchorMode,
  type MaintenanceIntervalUnit,
  type MaintenanceServiceKind,
  type RecurrenceRule,
} from './helpdesk-maintenance-recurrence';

/**
 * Proyeccion de ordenes del Programa de Mantenimiento.
 *
 * Cada rutina (plan) mantiene ordenes futuras "proyectadas" (is_projected) hasta
 * el horizonte del programa (projection_months) para que el calendario y el
 * programa anual muestren todo el periodo. Las proyectadas que nadie ha tocado
 * (sin inicio, sin recordatorio enviado, sin evidencia) se regeneran cuando la
 * rutina cambia; las iniciadas, cerradas o con evidencia nunca se borran.
 */

export interface PlanRecurrenceContext {
  id: number;
  asset_id: number;
  is_active: boolean;
  schedule_mode: 'FREQUENCY' | 'CALENDAR';
  service_kind: MaintenanceServiceKind;
  next_due_on: string;
  tolerance_before_days: number;
  tolerance_after_days: number;
  paused_at: string | null;
  program_version: number | null;
  projection_months: number;
  criticality_code: string | null;
  rule: RecurrenceRule;
}

const PROJECTED_UNTOUCHED_CONDITION = `
  o.is_projected = TRUE
  AND o.status = 'SCHEDULED'
  AND o.started_at IS NULL
  AND o.reminder_sent_at IS NULL
  AND o.scheduled_for > CURRENT_DATE
  AND NOT EXISTS (SELECT 1 FROM public.helpdesk_asset_documents d WHERE d.maintenance_order_id = o.id)
`;

export const loadPlanRecurrenceContext = async (
  planId: number,
  executor: Queryable = pool,
): Promise<PlanRecurrenceContext | null> => {
  const result = await executor.query(
    `
      SELECT p.id, p.asset_id, p.is_active, p.schedule_mode, p.service_kind, p.next_due_on,
             p.tolerance_before_days, p.tolerance_after_days, p.paused_at,
             p.custom_interval_value, p.custom_interval_unit, p.anchor_mode,
             p.recurrence_end_on, p.recurrence_max_occurrences,
             f.interval_months,
             g.version AS program_version, COALESCE(g.projection_months, 12) AS projection_months,
             cr.code AS criticality_code
        FROM public.helpdesk_maintenance_plans p
        LEFT JOIN public.helpdesk_maintenance_frequencies f ON f.id = p.frequency_id
        LEFT JOIN public.helpdesk_asset_maintenance_programs g ON g.id = p.program_id
        LEFT JOIN public.helpdesk_assets a ON a.id = p.asset_id
        LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
       WHERE p.id = $1
       LIMIT 1;
    `,
    [planId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: Number(row.id),
    asset_id: Number(row.asset_id),
    is_active: Boolean(row.is_active),
    schedule_mode: row.schedule_mode === 'CALENDAR' ? 'CALENDAR' : 'FREQUENCY',
    service_kind: (row.service_kind ?? 'PREVENTIVE') as MaintenanceServiceKind,
    next_due_on: row.next_due_on ? toIsoDate(row.next_due_on) : todayIso(),
    tolerance_before_days: Number(row.tolerance_before_days ?? 0),
    tolerance_after_days: Number(row.tolerance_after_days ?? 0),
    paused_at: row.paused_at ? String(row.paused_at) : null,
    program_version: row.program_version !== null && row.program_version !== undefined ? Number(row.program_version) : null,
    projection_months: Number(row.projection_months ?? 12),
    criticality_code: row.criticality_code ? String(row.criticality_code) : null,
    rule: {
      interval_months: row.interval_months ? Number(row.interval_months) : null,
      custom_interval_value: row.custom_interval_value ? Number(row.custom_interval_value) : null,
      custom_interval_unit: (row.custom_interval_unit as MaintenanceIntervalUnit | null) ?? null,
      anchor_mode: (row.anchor_mode === 'FLOATING' ? 'FLOATING' : 'FIXED') as MaintenanceAnchorMode,
      recurrence_end_on: row.recurrence_end_on ? toIsoDate(row.recurrence_end_on) : null,
      recurrence_max_occurrences: row.recurrence_max_occurrences ? Number(row.recurrence_max_occurrences) : null,
    },
  };
};

const generateOrderCode = async (executor: Queryable): Promise<string> => {
  const result = await executor.query(`SELECT nextval('public.helpdesk_maintenance_order_code_seq') AS next_id;`);
  return `OM-${String(Number(result.rows[0]?.next_id ?? 0)).padStart(6, '0')}`;
};

export interface InsertScheduledOrderInput {
  planId: number | null;
  assetId: number;
  scheduledFor: string;
  beforeDays: number;
  afterDays: number;
  criticalityCode?: string | null | undefined;
  serviceKind: MaintenanceServiceKind;
  programVersion?: number | null | undefined;
  isProjected: boolean;
  ticketId?: number | null | undefined;
  userId?: string | null | undefined;
}

/** Inserta una orden programada (idempotente por plan+fecha). Devuelve el id o null si ya existia. */
export const insertScheduledOrder = async (executor: Queryable, input: InsertScheduledOrderInput): Promise<number | null> => {
  const orderCode = await generateOrderCode(executor);
  const window = computeWindow({
    scheduledFor: input.scheduledFor,
    beforeDays: input.beforeDays,
    afterDays: input.afterDays,
    criticalityCode: input.criticalityCode ?? null,
  });
  const result = await executor.query(
    `
      INSERT INTO public.helpdesk_maintenance_orders (
        order_code, plan_id, asset_id, scheduled_for, window_starts_on, window_ends_on,
        created_by_user_id, is_projected, program_version, service_kind, ticket_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (plan_id, scheduled_for) DO NOTHING
      RETURNING id;
    `,
    [
      orderCode,
      input.planId,
      input.assetId,
      input.scheduledFor,
      window.starts_on,
      window.ends_on,
      input.userId ?? null,
      input.isProjected,
      input.programVersion ?? null,
      input.serviceKind,
      input.ticketId ?? null,
    ],
  );
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

/** Apunta next_due_on del plan a la orden pendiente mas proxima (o lo deja igual). */
export const resyncPlanNextDue = async (planId: number, userId: string | null | undefined, executor: Queryable = pool): Promise<void> => {
  await executor.query(
    `
      UPDATE public.helpdesk_maintenance_plans p
         SET next_due_on = COALESCE(
               (SELECT MIN(o.scheduled_for) FROM public.helpdesk_maintenance_orders o
                 WHERE o.plan_id = p.id AND o.status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')),
               p.next_due_on),
             updated_by_user_id = $2,
             updated_at = NOW()
       WHERE p.id = $1;
    `,
    [planId, userId ?? null],
  );
};

/** Borra las ordenes proyectadas futuras que nadie ha tocado. Devuelve cuantas borro. */
export const clearUntouchedProjection = async (planId: number, executor: Queryable = pool): Promise<number> => {
  const result = await executor.query(
    `DELETE FROM public.helpdesk_maintenance_orders o WHERE o.plan_id = $1 AND ${PROJECTED_UNTOUCHED_CONDITION};`,
    [planId],
  );
  return result.rowCount ?? 0;
};

export interface EnsureProjectionOptions {
  /** Fecha base desde la que calcular la siguiente (anclaje flotante tras cerrar). */
  baseDate?: string | null | undefined;
  userId?: string | null | undefined;
}

/**
 * Completa las ordenes proyectadas de la rutina hasta el horizonte del programa.
 * Idempotente: no duplica fechas ya existentes. Devuelve cuantas creo.
 */
export const ensurePlanProjection = async (
  planId: number,
  options: EnsureProjectionOptions = {},
  executor: Queryable = pool,
): Promise<number> => {
  const ctx = await loadPlanRecurrenceContext(planId, executor);
  if (!ctx || !ctx.is_active || ctx.paused_at || ctx.schedule_mode === 'CALENDAR') {
    return 0;
  }

  const stats = await executor.query(
    `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS', 'PENDING_VALIDATION'))::int AS pending,
             MAX(scheduled_for) AS last_scheduled,
             MAX(completed_at)::date AS last_completed
        FROM public.helpdesk_maintenance_orders
       WHERE plan_id = $1;
    `,
    [planId],
  );
  const total = Number(stats.rows[0]?.total ?? 0);
  const pending = Number(stats.rows[0]?.pending ?? 0);
  const lastScheduled = stats.rows[0]?.last_scheduled ? toIsoDate(stats.rows[0].last_scheduled) : null;
  const lastCompleted = stats.rows[0]?.last_completed ? toIsoDate(stats.rows[0].last_completed) : null;

  let start: string | null;
  if (options.baseDate) {
    start = computeNextDate(ctx.rule, options.baseDate);
  } else if (pending === 0 && total === 0) {
    start = ctx.next_due_on;
  } else if (pending === 0) {
    const base = ctx.rule.anchor_mode === 'FLOATING' && lastCompleted ? lastCompleted : lastScheduled ?? ctx.next_due_on;
    start = computeNextDate(ctx.rule, base);
  } else {
    start = lastScheduled ? computeNextDate(ctx.rule, lastScheduled) : null;
  }
  if (!start) {
    return 0;
  }

  const horizonEnd = addMonthsIso(todayIso(), ctx.projection_months);
  const dates = projectDates({ rule: ctx.rule, fromDate: start, horizonEnd, occurrencesSoFar: total });

  let created = 0;
  for (const date of dates) {
    const id = await insertScheduledOrder(executor, {
      planId: ctx.id,
      assetId: ctx.asset_id,
      scheduledFor: date,
      beforeDays: ctx.tolerance_before_days,
      afterDays: ctx.tolerance_after_days,
      criticalityCode: ctx.criticality_code,
      serviceKind: ctx.service_kind,
      programVersion: ctx.program_version,
      isProjected: true,
      userId: options.userId ?? null,
    });
    if (id) {
      created += 1;
    }
  }
  await resyncPlanNextDue(planId, options.userId, executor);
  return created;
};

/** Regenera la proyeccion: borra las proyectadas intactas y vuelve a proyectar. */
export const regeneratePlanProjection = async (
  planId: number,
  options: EnsureProjectionOptions = {},
  executor: Queryable = pool,
): Promise<{ removed: number; created: number }> => {
  const removed = await clearUntouchedProjection(planId, executor);
  const created = await ensurePlanProjection(planId, options, executor);
  return { removed, created };
};

/** Regenera la proyeccion de todas las rutinas activas de un programa. */
export const regenerateProgramProjection = async (
  programId: number,
  userId: string | null | undefined,
  executor: Queryable = pool,
): Promise<number> => {
  const plans = await executor.query(
    `SELECT id FROM public.helpdesk_maintenance_plans WHERE program_id = $1 AND is_active = TRUE;`,
    [programId],
  );
  let created = 0;
  for (const row of plans.rows) {
    const result = await regeneratePlanProjection(Number(row.id), { userId }, executor);
    created += result.created;
  }
  return created;
};
