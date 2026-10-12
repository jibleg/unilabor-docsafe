import pool from '../../config/db';
import { getAttendanceSettings } from './attendance-settings.service';
import { loadDailyRows, weightsFromSettings } from './board-commitment.service';
import { compareRanking, pct, summarizeCommitment, trendByBlock } from './engine/commitment';
import { dayWindow, type DayResult, type EnginePunch, type PunchType, type ReviewStatus } from './engine/day-calculator';
import {
  LIVE_STATUS_ORDER, liveStatus, statusFromDailyResult, type LiveState, type LiveStatus,
} from './engine/live-status';
import { resolveDay, type EngineAssignment, type EngineShift } from './engine/schedule';
import {
  MS_PER_DAY, MS_PER_MINUTE, addDays, dateToLocalMs, minutesToTime, monthBounds, timeToMinutes, type DateString,
} from './engine/time';
import { instantToLocalMs, localMsToInstant, todayInZone } from './timezone';

/**
 * Tablero "Hoy en vivo". Para hoy calcula el estado en el momento (sin
 * persistir); para fechas pasadas usa attendance.daily_results.
 */

interface LiveEmployee {
  id: number;
  code: string;
  fullName: string;
  area: string | null;
  branchId: number | null;
  branchName: string | null;
  hasSchedule: boolean;
  deviceNumber: string | null;
  syncStatus: string;
}

interface PersonRow {
  employee_id: number;
  code: string;
  full_name: string;
  area: string | null;
  branch_id: number | null;
  branch_name: string | null;
  status: LiveStatus;
  expected_start: string | null;
  expected_end: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  late_minutes: number;
}

const loadEmployees = async (date: DateString, branchId: number | null): Promise<LiveEmployee[]> => {
  const { rows } = await pool.query<{
    id: string; code: string; full_name: string; area: string | null; branch_id: string | null; branch_name: string | null;
    has_schedule: boolean; device_number: string | null; sync_status: string;
  }>(
    `SELECT e.id, e.employee_code AS code, e.full_name, e.area, e.branch_id, b.name AS branch_name,
            EXISTS (SELECT 1 FROM attendance.shift_assignments sa
                     WHERE sa.employee_id = e.id AND sa.shift_id IS NOT NULL
                       AND sa.start_date <= $1::date
                       AND (sa.end_date IS NULL OR sa.end_date >= $1::date - 60)) AS has_schedule,
            p.device_employee_number AS device_number, p.device_sync_status AS sync_status
       FROM public.employees e
       JOIN attendance.employee_profiles p ON p.employee_id = e.id AND p.is_enabled
       LEFT JOIN public.helpdesk_asset_units b ON b.id = e.branch_id
      WHERE e.is_active AND ($2::bigint IS NULL OR e.branch_id = $2)
      ORDER BY e.full_name`,
    [date, branchId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    fullName: row.full_name,
    area: row.area,
    branchId: row.branch_id === null ? null : Number(row.branch_id),
    branchName: row.branch_name,
    hasSchedule: row.has_schedule,
    deviceNumber: row.device_number,
    syncStatus: row.sync_status,
  }));
};

const groupBy = <T>(items: readonly T[], keyOf: (item: T) => number): Map<number, T[]> => {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
};

/** Estado de cada colaborador a partir de la programacion, checadas e incidencias de la fecha. */
const computeLivePeople = async (
  employees: readonly LiveEmployee[],
  date: DateString,
  isToday: boolean,
  timeZone: string,
): Promise<Map<number, { state: LiveState }>> => {
  const settings = await getAttendanceSettings();
  const ids = employees.map((e) => e.id);
  const [assignmentRes, shiftRes, holidayRes, incidentRes] = await Promise.all([
    pool.query<{
      id: string; employee_id: string; shift_id: string | null; start_date: string; end_date: string | null;
      repeats_weekly: boolean; week_interval: number; weekdays: number[];
    }>(
      `SELECT id, employee_id, shift_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date, repeats_weekly, week_interval, weekdays
         FROM attendance.shift_assignments
        WHERE employee_id = ANY($1::bigint[]) AND start_date <= $2::date
          AND (end_date IS NULL OR end_date >= $2::date - 60)`,
      [ids, date],
    ),
    pool.query<{
      id: string; name: string; start_time: string; end_time: string; break_minutes: number; shift_type: string; is_active: boolean;
    }>('SELECT id, name, start_time::text, end_time::text, break_minutes, shift_type, is_active FROM attendance.shifts'),
    pool.query('SELECT 1 FROM attendance.holidays WHERE holiday_date = $1::date AND is_active', [date]),
    pool.query<{ employee_id: string }>(
      `SELECT DISTINCT i.employee_id
         FROM attendance.incidents i
         JOIN attendance.incident_types t ON t.id = i.incident_type_id
        WHERE i.employee_id = ANY($1::bigint[]) AND i.incident_status = 'authorized' AND NOT t.is_hourly
          AND $2::date BETWEEN i.start_date AND i.end_date`,
      [ids, date],
    ),
  ]);

  const shiftsById = new Map<number, EngineShift>(
    shiftRes.rows.map((row) => [Number(row.id), {
      id: Number(row.id), name: row.name, startTime: row.start_time, endTime: row.end_time,
      breakMinutes: row.break_minutes, flexible: row.shift_type === 'flexible', isActive: row.is_active,
    }]),
  );
  const assignments = groupBy(
    assignmentRes.rows.map((row): EngineAssignment & { employeeId: number } => ({
      id: Number(row.id), employeeId: Number(row.employee_id),
      shiftId: row.shift_id === null ? null : Number(row.shift_id),
      startDate: row.start_date, endDate: row.end_date, repeatsWeekly: row.repeats_weekly,
      weekInterval: row.week_interval, weekdays: row.weekdays.map(Number),
    })),
    (a) => a.employeeId,
  );
  const incidentIds = new Set(incidentRes.rows.map((row) => Number(row.employee_id)));
  const isHoliday = (holidayRes.rowCount ?? 0) > 0;

  const midnight = dateToLocalMs(date);
  const nowLocal = isToday ? instantToLocalMs(new Date(), timeZone) : midnight;

  // Checadas del dia laboral de hoy (ventana 04:00 -> 04:00 o 12:00 -> 12:00 para turnos nocturnos).
  const punchesByEmployee = new Map<number, EnginePunch[]>();
  if (isToday && ids.length > 0) {
    const cutoff = timeToMinutes(settings.cutoff_time);
    const from = localMsToInstant(midnight + Math.min(cutoff, 720) * MS_PER_MINUTE, timeZone);
    const to = localMsToInstant(midnight + Math.max(cutoff, 720) * MS_PER_MINUTE + MS_PER_DAY, timeZone);
    const { rows } = await pool.query<{
      id: string; employee_id: string; punched_at: Date; punch_type: PunchType | null; review_status: ReviewStatus;
    }>(
      `SELECT id, employee_id, punched_at, punch_type, review_status
         FROM attendance.punches
        WHERE employee_id = ANY($1::bigint[]) AND punched_at >= $2 AND punched_at < $3
          AND review_status <> 'rejected'`,
      [ids, from, to],
    );
    for (const row of rows) {
      const list = punchesByEmployee.get(Number(row.employee_id)) ?? [];
      list.push({ ref: Number(row.id), at: instantToLocalMs(row.punched_at, timeZone), type: row.punch_type, reviewStatus: row.review_status });
      punchesByEmployee.set(Number(row.employee_id), list);
    }
  }

  const result = new Map<number, { state: LiveState }>();
  for (const employee of employees) {
    const employeeAssignments = assignments.get(employee.id) ?? [];
    const plan = resolveDay(employeeAssignments, shiftsById, date, settings.week_start);
    const window = dayWindow(date, settings.cutoff_time, plan.segments[0]?.crossesMidnight ?? false);
    const punches = (punchesByEmployee.get(employee.id) ?? []).filter((p) => p.at >= window.from && p.at < window.to);
    result.set(employee.id, {
      state: liveStatus({
        workDate: date, assignments: employeeAssignments, shiftsById, isHoliday,
        hasFullDayIncident: incidentIds.has(employee.id), punches, nowLocal, settings,
      }),
    });
  }
  return result;
};

const loadPastPeople = async (
  employees: readonly LiveEmployee[],
  date: DateString,
): Promise<{ map: Map<number, PersonRow>; pending: number }> => {
  const { rows } = await pool.query<{
    employee_id: string; day_result: DayResult; expected_start: string | null; expected_end: string | null;
    clock_in_at: Date | null; clock_out_at: Date | null; late_minutes: number; has_pending_review: boolean;
  }>(
    `SELECT employee_id, day_result, to_char(expected_start_time, 'HH24:MI') AS expected_start,
            to_char(expected_end_time, 'HH24:MI') AS expected_end, clock_in_at, clock_out_at,
            late_minutes, has_pending_review
       FROM attendance.daily_results
      WHERE work_date = $1::date AND employee_id = ANY($2::bigint[])`,
    [date, employees.map((e) => e.id)],
  );
  const map = new Map<number, PersonRow>();
  let pending = 0;
  const byId = new Map(employees.map((e) => [e.id, e]));
  for (const row of rows) {
    const employee = byId.get(Number(row.employee_id));
    if (!employee) continue;
    map.set(employee.id, {
      employee_id: employee.id, code: employee.code, full_name: employee.fullName, area: employee.area,
      branch_id: employee.branchId, branch_name: employee.branchName,
      status: statusFromDailyResult(row.day_result, row.clock_out_at !== null),
      expected_start: row.expected_start, expected_end: row.expected_end,
      clock_in_at: row.clock_in_at?.toISOString() ?? null, clock_out_at: row.clock_out_at?.toISOString() ?? null,
      late_minutes: row.late_minutes,
    });
    if (row.has_pending_review) pending += 1;
  }
  return { map, pending };
};

export const getLiveBoard = async (filters: { date?: DateString | undefined; branchId?: number | undefined }) => {
  const settings = await getAttendanceSettings();
  const timeZone = settings.timezone;
  const today = todayInZone(timeZone);
  const date = filters.date ?? today;
  const isToday = date === today;
  const branchId = filters.branchId ?? null;

  const employees = await loadEmployees(date, branchId);
  const people: PersonRow[] = [];
  let pendingReview = 0;

  if (date >= today) {
    const states = await computeLivePeople(employees, date, isToday, timeZone);
    for (const employee of employees) {
      const state = states.get(employee.id)?.state;
      if (!state) continue;
      if (state.hasPendingReview) pendingReview += 1;
      people.push({
        employee_id: employee.id, code: employee.code, full_name: employee.fullName, area: employee.area,
        branch_id: employee.branchId, branch_name: employee.branchName, status: state.status,
        expected_start: state.expectedStartMinute === null ? null : minutesToTime(state.expectedStartMinute),
        expected_end: state.expectedEndMinute === null ? null : minutesToTime(state.expectedEndMinute),
        clock_in_at: state.clockIn === null ? null : localMsToInstant(state.clockIn, timeZone).toISOString(),
        clock_out_at: state.clockOut === null ? null : localMsToInstant(state.clockOut, timeZone).toISOString(),
        late_minutes: state.lateMinutes,
      });
    }
  } else {
    const { map: past, pending } = await loadPastPeople(employees, date);
    pendingReview = pending;
    for (const employee of employees) {
      people.push(past.get(employee.id) ?? {
        employee_id: employee.id, code: employee.code, full_name: employee.fullName, area: employee.area,
        branch_id: employee.branchId, branch_name: employee.branchName, status: 'no_schedule',
        expected_start: null, expected_end: null, clock_in_at: null, clock_out_at: null, late_minutes: 0,
      });
    }
  }

  const order = (status: LiveStatus): number => LIVE_STATUS_ORDER.indexOf(status);
  people.sort((a, b) => order(a.status) - order(b.status) || a.full_name.localeCompare(b.full_name, 'es'));

  const count = (...statuses: LiveStatus[]): number => people.filter((p) => statuses.includes(p.status)).length;
  const expected = count('present', 'left', 'late', 'upcoming', 'missing');
  const arrived = count('present', 'left', 'late');
  const byStatus = LIVE_STATUS_ORDER.map((status) => ({ status, count: count(status) })).filter((item) => item.count > 0);

  const [absences, devices, history] = await Promise.all([
    loadUpcomingAbsences(date, branchId),
    loadDevices(branchId, employees, settings.agent_offline_min),
    loadHistory(date, today, employees, settings.week_start, settings.timezone),
  ]);

  return {
    date,
    is_today: isToday,
    kpis: {
      expected, present: arrived, late: count('late'), missing: count('missing'),
      incident: count('incident'), pending_review: pendingReview,
    },
    progress_percent: pct(arrived, expected) ?? 0,
    by_status: byStatus,
    people,
    absences_next_7_days: absences,
    devices,
    trend_14_days: history.trend,
    month_ranking: history.ranking,
    alerts: {
      without_schedule: employees.filter((e) => !e.hasSchedule).length,
      without_device_number: employees.filter((e) => e.deviceNumber === null).length,
      pending_sync: employees.filter((e) => e.syncStatus === 'pending' || e.syncStatus === 'error').length,
    },
  };
};

const UPCOMING_ABSENCES_MAX = 8;

const loadUpcomingAbsences = async (date: DateString, branchId: number | null) => {
  const { rows } = await pool.query<{
    incident_id: string; employee_id: string; full_name: string; type_code: string; type_name: string;
    start_date: string; end_date: string; days: string | null; total: string;
  }>(
    `SELECT i.id AS incident_id, i.employee_id, e.full_name, t.code AS type_code, t.name AS type_name,
            to_char(i.start_date, 'YYYY-MM-DD') AS start_date, to_char(i.end_date, 'YYYY-MM-DD') AS end_date,
            i.days, COUNT(*) OVER () AS total
       FROM attendance.incidents i
       JOIN attendance.incident_types t ON t.id = i.incident_type_id
       JOIN public.employees e ON e.id = i.employee_id AND e.is_active
       JOIN attendance.employee_profiles p ON p.employee_id = e.id AND p.is_enabled
      WHERE i.incident_status = 'authorized' AND NOT t.is_hourly
        AND i.start_date <= $1::date + 7 AND i.end_date >= $1::date + 1
        AND ($2::bigint IS NULL OR e.branch_id = $2)
      ORDER BY i.start_date, e.full_name
      LIMIT ${UPCOMING_ABSENCES_MAX}`,
    [date, branchId],
  );
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    items: rows.map((row) => ({
      incident_id: Number(row.incident_id), employee_id: Number(row.employee_id), full_name: row.full_name,
      type_code: row.type_code, type_name: row.type_name, start_date: row.start_date, end_date: row.end_date,
      days: row.days === null ? null : Number(row.days),
    })),
  };
};

const loadDevices = async (branchId: number | null, employees: readonly LiveEmployee[], offlineMinutes: number) => {
  const { rows } = await pool.query<{
    branch_id: string; branch_name: string; agent_id: string | null; agent_name: string | null;
    agent_last_heartbeat_at: Date | null; agent_online: boolean | null;
    terminals_total: string; terminals_online: string; last_event_at: Date | null;
  }>(
    `SELECT b.id AS branch_id, b.name AS branch_name, a.id AS agent_id, a.name AS agent_name,
            a.last_heartbeat_at AS agent_last_heartbeat_at,
            (a.is_active AND a.last_heartbeat_at > NOW() - make_interval(mins => $2)) AS agent_online,
            COUNT(t.id) AS terminals_total,
            COUNT(t.id) FILTER (WHERE t.is_online AND t.last_heartbeat_at > NOW() - make_interval(mins => $2)) AS terminals_online,
            MAX(t.last_event_at) AS last_event_at
       FROM public.helpdesk_asset_units b
       LEFT JOIN attendance.agents a ON a.branch_id = b.id
       LEFT JOIN attendance.terminals t ON t.branch_id = b.id AND t.is_active
      WHERE b.is_active AND ($1::bigint IS NULL OR b.id = $1)
      GROUP BY b.id, b.name, b.sort_order, a.id
      ORDER BY b.sort_order, b.name`,
    [branchId, offlineMinutes],
  );
  const branchesWithPeople = new Set(employees.map((e) => e.branchId));
  return rows
    .filter((row) => row.agent_id !== null || Number(row.terminals_total) > 0 || branchesWithPeople.has(Number(row.branch_id)))
    .map((row) => ({
      branch_id: Number(row.branch_id),
      branch_name: row.branch_name,
      agent: row.agent_id === null ? null : {
        id: Number(row.agent_id), name: row.agent_name, online: row.agent_online === true,
        last_heartbeat_at: row.agent_last_heartbeat_at?.toISOString() ?? null,
      },
      terminals_total: Number(row.terminals_total),
      terminals_online: Number(row.terminals_online),
      last_event_at: row.last_event_at?.toISOString() ?? null,
    }));
};

const TREND_DAYS = 14;
const RANKING_SIZE = 10;

/** Tendencia de 14 dias y ranking del mes, ambos con dias cerrados (hasta ayer). */
const loadHistory = async (
  date: DateString,
  today: DateString,
  employees: readonly LiveEmployee[],
  weekStart: 'sunday' | 'monday',
  timeZone: string,
) => {
  const settings = await getAttendanceSettings();
  const lastClosed = addDays(date < today ? date : today, -1);
  const trendFrom = addDays(lastClosed, -(TREND_DAYS - 1));
  const monthStart = monthBounds(date).start;
  const rows = await loadDailyRows(
    trendFrom < monthStart ? trendFrom : monthStart, lastClosed, employees.map((e) => e.id), timeZone,
  );

  const byDay = new Map(trendByBlock(rows.filter((r) => r.workDate >= trendFrom), 'day', weekStart).map((b) => [b.date, b]));
  const trend = Array.from({ length: TREND_DAYS }, (_, index) => {
    const day = addDays(trendFrom, index);
    const block = byDay.get(day);
    return {
      date: day,
      attendances: block?.attendances ?? 0,
      incidents: block?.incidents ?? 0,
      lates: block?.lates ?? 0,
      absences: block?.absences ?? 0,
    };
  });

  const weights = weightsFromSettings(settings);
  const monthRows = groupBy(rows.filter((r) => r.workDate >= monthStart), (r) => r.employeeId);
  const ranking = employees
    .map((employee) => ({ employee, summary: summarizeCommitment(monthRows.get(employee.id) ?? [], weights) }))
    .filter((entry) => entry.summary.expected > 0)
    .sort((a, b) => compareRanking({ name: a.employee.fullName, summary: a.summary }, { name: b.employee.fullName, summary: b.summary }))
    .slice(0, RANKING_SIZE)
    .map((entry) => ({
      employee_id: entry.employee.id, code: entry.employee.code, full_name: entry.employee.fullName,
      branch_name: entry.employee.branchName, index: entry.summary.index, lates: entry.summary.lates,
      absences: entry.summary.absences, streak: entry.summary.currentStreak,
    }));
  return { trend, ranking };
};
