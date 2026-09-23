import pool from '../config/db';
import type { CalendarFilters } from './helpdesk-service-calendar.service';

/**
 * Indicadores del Programa de Mantenimiento (ISO 15189:2022 6.4.5 / 8.4):
 * cumplimiento en ventana, vencidas por criticidad, tiempo medio fuera de
 * servicio, correctivos repetidos y servicios externos. Mismos filtros que el
 * calendario (unidad, area, responsable, categoria, criticidad, activo).
 */

export interface ProgramKpis {
  from: string;
  to: string;
  compliance: { due: number; on_time: number; late: number; open_overdue: number; pct: number | null };
  overdue_by_criticality: Array<{ criticality: string; count: number }>;
  by_kind: Array<{ kind: string; scheduled: number; closed: number; overdue: number }>;
  downtime: { orders_avg_minutes: number | null; tickets_avg_minutes: number | null; tickets_total_minutes: number };
  pending_validation: number;
  external_services: { scheduled: number; closed: number; without_evidence: number };
  repeated_correctives: Array<{ asset_id: number; asset_code: string; name: string; tickets_6m: number; last_reported_at: string | null }>;
}

const buildAssetWhere = (filters: Omit<CalendarFilters, 'from' | 'to'>, values: unknown[]): string => {
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
  return clauses.join(' AND ');
};

export const getProgramKpis = async (filters: CalendarFilters): Promise<ProgramKpis> => {
  const values: unknown[] = [filters.from, filters.to];
  const assetWhere = buildAssetWhere(filters, values);

  const orders = await pool.query(
    `
      SELECT o.service_kind, o.status, o.window_ends_on, o.completed_at, o.downtime_minutes,
             COALESCE(p.executor_kind, 'INTERNAL_TECH') AS executor_kind,
             UPPER(COALESCE(cr.code, 'NONE')) AS criticality,
             (o.status = 'CLOSED' AND (o.window_ends_on IS NULL OR o.completed_at::date <= o.window_ends_on)) AS on_time,
             (o.status <> 'CLOSED' AND o.window_ends_on IS NOT NULL AND o.window_ends_on < CURRENT_DATE) AS overdue,
             EXISTS (SELECT 1 FROM public.helpdesk_asset_documents d WHERE d.maintenance_order_id = o.id) AS has_evidence
        FROM public.helpdesk_maintenance_orders o
        LEFT JOIN public.helpdesk_maintenance_plans p ON p.id = o.plan_id
        INNER JOIN public.helpdesk_assets a ON a.id = o.asset_id
        LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
       WHERE ${assetWhere} AND o.scheduled_for BETWEEN $1 AND $2;
    `,
    values,
  );
  const rows = orders.rows;
  const closed = rows.filter((r) => r.status === 'CLOSED');
  const onTime = closed.filter((r) => Boolean(r.on_time));
  const openOverdue = rows.filter((r) => Boolean(r.overdue));
  const due = closed.length + openOverdue.length;

  const overdueByCrit = new Map<string, number>();
  for (const r of openOverdue) {
    overdueByCrit.set(String(r.criticality), (overdueByCrit.get(String(r.criticality)) ?? 0) + 1);
  }
  const byKindMap = new Map<string, { scheduled: number; closed: number; overdue: number }>();
  for (const r of rows) {
    const k = byKindMap.get(String(r.service_kind)) ?? { scheduled: 0, closed: 0, overdue: 0 };
    k.scheduled += 1;
    if (r.status === 'CLOSED') k.closed += 1;
    if (r.overdue) k.overdue += 1;
    byKindMap.set(String(r.service_kind), k);
  }
  const downtimes = closed.map((r) => (r.downtime_minutes !== null ? Number(r.downtime_minutes) : null)).filter((v): v is number => v !== null);
  const external = rows.filter((r) => r.executor_kind === 'EXTERNAL_PROVIDER');

  const ticketValues: unknown[] = [filters.from, filters.to];
  const ticketWhere = buildAssetWhere(filters, ticketValues);
  const tickets = await pool.query(
    `
      SELECT COUNT(*) FILTER (WHERE t.downtime_minutes IS NOT NULL)::int AS with_downtime,
             COALESCE(AVG(t.downtime_minutes) FILTER (WHERE t.downtime_minutes IS NOT NULL), 0)::float AS avg_downtime,
             COALESCE(SUM(t.downtime_minutes), 0)::int AS total_downtime
        FROM public.helpdesk_tickets t
        INNER JOIN public.helpdesk_assets a ON a.id = t.asset_id
       WHERE ${ticketWhere} AND t.is_active = TRUE AND t.validated_at::date BETWEEN $1 AND $2;
    `,
    ticketValues,
  );

  const repeatedValues: unknown[] = [];
  const repeatedWhere = buildAssetWhere(filters, repeatedValues);
  const repeated = await pool.query(
    `
      SELECT a.id AS asset_id, a.asset_code, a.name, COUNT(t.id)::int AS tickets_6m, MAX(t.reported_at) AS last_reported_at
        FROM public.helpdesk_tickets t
        INNER JOIN public.helpdesk_assets a ON a.id = t.asset_id
        LEFT JOIN public.helpdesk_request_types rt ON rt.id = t.request_type_id
       WHERE ${repeatedWhere} AND t.is_active = TRUE
         AND t.reported_at >= CURRENT_DATE - INTERVAL '6 months'
         AND UPPER(COALESCE(rt.code, '')) IN ('CORRECTIVE_MAINTENANCE', 'REPAIR', 'FAILURE')
       GROUP BY a.id, a.asset_code, a.name
      HAVING COUNT(t.id) >= 3
       ORDER BY COUNT(t.id) DESC, MAX(t.reported_at) DESC
       LIMIT 50;
    `,
    repeatedValues,
  );

  return {
    from: filters.from,
    to: filters.to,
    compliance: {
      due,
      on_time: onTime.length,
      late: closed.length - onTime.length,
      open_overdue: openOverdue.length,
      pct: due > 0 ? Math.min(100, Math.round((onTime.length / due) * 100)) : null,
    },
    overdue_by_criticality: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'].map((c) => ({ criticality: c, count: overdueByCrit.get(c) ?? 0 })),
    by_kind: [...byKindMap.entries()].map(([kind, v]) => ({ kind, ...v })),
    downtime: {
      orders_avg_minutes: downtimes.length > 0 ? Math.round(downtimes.reduce((s, v) => s + v, 0) / downtimes.length) : null,
      tickets_avg_minutes: Number(tickets.rows[0]?.with_downtime ?? 0) > 0 ? Math.round(Number(tickets.rows[0]?.avg_downtime ?? 0)) : null,
      tickets_total_minutes: Number(tickets.rows[0]?.total_downtime ?? 0),
    },
    pending_validation: rows.filter((r) => r.status === 'PENDING_VALIDATION').length,
    external_services: {
      scheduled: external.length,
      closed: external.filter((r) => r.status === 'CLOSED').length,
      without_evidence: external.filter((r) => r.status === 'CLOSED' && !r.has_evidence).length,
    },
    repeated_correctives: repeated.rows.map((r) => ({
      asset_id: Number(r.asset_id),
      asset_code: String(r.asset_code),
      name: String(r.name),
      tickets_6m: Number(r.tickets_6m),
      last_reported_at: r.last_reported_at ? new Date(r.last_reported_at).toISOString() : null,
    })),
  };
};
