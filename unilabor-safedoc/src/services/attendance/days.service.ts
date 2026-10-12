import pool from '../../config/db';
import { registerAuditEvent } from '../audit.service';
import { buildPaginatedResult, resolvePagination } from '../../utils/pagination';
import type { DaysQuery, RecalculateBody } from '../../schemas/attendance/days.schema';
import { invalid } from './attendance-errors';
import { getAttendanceSettings } from './attendance-settings.service';
import { recalculateRange, type RecalculationSummary } from './day-recalculation.service';
import { addDays, daysBetween } from './engine/time';
import { todayInZone } from './timezone';

export const MAX_LIST_RANGE_DAYS = 366;
export const MAX_RECALCULATE_RANGE_DAYS = 92;

/** Rango del listado: por defecto la ultima semana (hasta hoy en la zona de ajustes). */
const resolveRange = async (query: { from?: string | undefined; to?: string | undefined }) => {
  const settings = await getAttendanceSettings();
  const to = query.to ?? todayInZone(settings.timezone);
  const from = query.from ?? addDays(to, -6);
  if (from > to) invalid('La fecha inicial no puede ser posterior a la final.');
  if (daysBetween(from, to) + 1 > MAX_LIST_RANGE_DAYS) {
    invalid(`El rango maximo es de ${MAX_LIST_RANGE_DAYS} dias.`);
  }
  return { from, to };
};

const ISSUE_RESULTS = ['absent', 'late', 'partial_absence', 'early_departure'];

export const listDays = async (query: DaysQuery) => {
  const { from, to } = await resolveRange(query);
  const { page, limit, offset } = resolvePagination(query, { defaultLimit: 50, maxLimit: 200 });

  const values: unknown[] = [from, to];
  const where: string[] = ['d.work_date BETWEEN $1::date AND $2::date'];
  const push = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (query.branch_id) where.push(`d.branch_id = ${push(query.branch_id)}`);
  if (query.employee_id) where.push(`d.employee_id = ${push(query.employee_id)}`);
  if (query.result.length > 0) where.push(`d.day_result = ANY(${push(query.result)}::text[])`);
  if (query.search) {
    const term = push(`%${query.search}%`);
    where.push(`(e.full_name ILIKE ${term} OR e.employee_code ILIKE ${term})`);
  }
  if (query.only_issues) {
    where.push(
      `(d.day_result = ANY(${push(ISSUE_RESULTS)}::text[]) OR d.is_late_accumulation_absence OR d.has_pending_review)`,
    );
  }
  const whereSql = where.join(' AND ');
  const fromSql = `
    FROM attendance.daily_results d
    JOIN public.employees e ON e.id = d.employee_id
    LEFT JOIN public.helpdesk_asset_units b ON b.id = d.branch_id
    LEFT JOIN attendance.incidents i ON i.id = d.incident_id
    LEFT JOIN attendance.incident_types it ON it.id = i.incident_type_id
   WHERE ${whereSql}`;

  const limitParam = `$${values.length + 1}`;
  const offsetParam = `$${values.length + 2}`;
  const [rowsResult, summaryResult] = await Promise.all([
    pool.query(
      `SELECT d.id, to_char(d.work_date, 'YYYY-MM-DD') AS work_date,
              e.id AS employee_id, e.employee_code, e.full_name, e.area,
              d.branch_id, b.name AS branch_name,
              to_char(d.expected_start_time, 'HH24:MI') AS expected_start_time,
              to_char(d.expected_end_time, 'HH24:MI') AS expected_end_time,
              d.clock_in_at, d.clock_out_at, d.late_minutes, d.early_departure_minutes,
              d.worked_hours::float8 AS worked_hours, d.overtime_hours::float8 AS overtime_hours,
              d.day_result, d.calculation_detail->>'reason' AS reason,
              d.incident_id, it.code AS incident_code, it.name AS incident_name,
              d.is_late_accumulation_absence, d.has_pending_review, d.segments
         ${fromSql}
        ORDER BY d.work_date DESC, e.full_name, e.id
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE d.day_result = 'absent')::int AS absent,
              COUNT(*) FILTER (WHERE d.day_result = 'late')::int AS late,
              COUNT(*) FILTER (WHERE d.day_result = 'partial_absence')::int AS partial_absence,
              COUNT(*) FILTER (WHERE d.day_result = 'early_departure')::int AS early_departure,
              COUNT(*) FILTER (WHERE d.is_late_accumulation_absence)::int AS late_accumulation_absence,
              COUNT(*) FILTER (WHERE d.has_pending_review)::int AS pending_review
         ${fromSql}`,
      values,
    ),
  ]);

  const summaryRow = summaryResult.rows[0] ?? {};
  const data = rowsResult.rows.map((row) => ({
    id: Number(row.id),
    work_date: row.work_date as string,
    employee: {
      id: Number(row.employee_id),
      code: row.employee_code as string,
      full_name: row.full_name as string,
      area: (row.area as string | null) ?? null,
      branch_id: row.branch_id === null ? null : Number(row.branch_id),
      branch_name: (row.branch_name as string | null) ?? null,
    },
    expected_start_time: row.expected_start_time as string | null,
    expected_end_time: row.expected_end_time as string | null,
    clock_in_at: row.clock_in_at ? (row.clock_in_at as Date).toISOString() : null,
    clock_out_at: row.clock_out_at ? (row.clock_out_at as Date).toISOString() : null,
    late_minutes: Number(row.late_minutes),
    early_departure_minutes: Number(row.early_departure_minutes),
    worked_hours: row.worked_hours as number | null,
    overtime_hours: row.overtime_hours as number,
    day_result: row.day_result as string,
    reason: (row.reason as string | null) ?? null,
    incident:
      row.incident_id === null
        ? null
        : { id: Number(row.incident_id), code: row.incident_code as string, name: row.incident_name as string },
    is_late_accumulation_absence: row.is_late_accumulation_absence as boolean,
    has_pending_review: row.has_pending_review as boolean,
    segments: row.segments as unknown[],
  }));

  return {
    ...buildPaginatedResult(data, summaryRow.total, page, limit),
    summary: {
      absent: Number(summaryRow.absent ?? 0),
      late: Number(summaryRow.late ?? 0),
      partial_absence: Number(summaryRow.partial_absence ?? 0),
      early_departure: Number(summaryRow.early_departure ?? 0),
      late_accumulation_absence: Number(summaryRow.late_accumulation_absence ?? 0),
      pending_review: Number(summaryRow.pending_review ?? 0),
    },
    range: { from, to },
  };
};

/** Recalculo manual de un rango (ya validado el cuerpo). Los dias futuros no se calculan. */
export const recalculateDaysManually = async (
  body: RecalculateBody,
  userId: string,
): Promise<RecalculationSummary> => {
  if (body.from > body.to) invalid('La fecha inicial no puede ser posterior a la final.');
  if (daysBetween(body.from, body.to) + 1 > MAX_RECALCULATE_RANGE_DAYS) {
    invalid(`El rango maximo por recalculo es de ${MAX_RECALCULATE_RANGE_DAYS} dias.`);
  }
  const settings = await getAttendanceSettings();
  const yesterday = addDays(todayInZone(settings.timezone), -1);
  if (body.from > yesterday) invalid('Solo se pueden recalcular dias ya cerrados (hasta ayer).');
  const to = body.to > yesterday ? yesterday : body.to;

  const summary = await recalculateRange({
    from: body.from,
    to,
    ...(body.employee_ids ? { employeeIds: body.employee_ids } : {}),
  });

  await registerAuditEvent({
    user_id: userId,
    action: 'attendance_days_recalculated',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_daily_results',
    metadata: { from: body.from, to, employee_ids: body.employee_ids ?? null, ...summary },
  }).catch(() => undefined);

  return summary;
};
