import pool from '../../config/db';
import type { Queryable } from '../../utils/transaction';
import { getAttendanceSettings } from './attendance-settings.service';
import {
  calculateDay,
  dayWindow,
  type DayCalculation,
  type EnginePunch,
  type FullDayIncident,
  type PunchType,
  type ReviewStatus,
} from './engine/day-calculator';
import { latePeriodBounds, markLateAccumulation, type DayOutcome } from './engine/late-accumulation';
import {
  hasScheduleOn,
  resolveDay,
  type EngineAssignment,
  type EngineShift,
} from './engine/schedule';
import type { AttendanceSettings } from './engine/settings';
import {
  addDays,
  dateToLocalMs,
  daysBetween,
  minutesToTime,
  type DateString,
  type LocalMs,
} from './engine/time';
import { instantToLocalMs, localMsToInstant, todayInZone } from './timezone';

/**
 * Recalculo de attendance.daily_results. Carga los datos UNA vez por rango (y
 * por lote de colaboradores), calcula cada dia con el motor puro y hace UPSERT
 * idempotente. Despues aplica la falta por retardos acumulados sobre el periodo
 * completo (mes/quincena/semana) para que un recalculo reinicie bien el conteo.
 */
export interface RecalculationScope {
  /** Fecha inicial 'YYYY-MM-DD' (inclusive). */
  from: string;
  /** Fecha final 'YYYY-MM-DD' (inclusive). */
  to: string;
  /** Si se omite, se recalculan todos los colaboradores habilitados. */
  employeeIds?: number[];
}

export interface RecalculationSummary {
  employees: number;
  days: number;
}

/** Opciones internas (pruebas): cliente transaccional y ajustes fijos. */
export interface RecalculationOptions {
  client?: Queryable;
  settings?: AttendanceSettings;
}

const EMPLOYEE_BATCH_SIZE = 50;
const UPSERT_CHUNK_SIZE = 500;
const LOOKBACK_SCHEDULE_DAYS = 60;
const MAX_PAST_DAYS = 60;

interface EmployeeRow {
  id: number;
  branch_id: number | null;
  hire_date: string | null;
}

interface ShiftRow {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  shift_type: string;
  is_active: boolean;
  entry_before_min: number;
  entry_after_min: number;
  exit_before_min: number;
  exit_after_min: number;
}

interface AssignmentRow {
  id: number;
  employee_id: number;
  shift_id: number | null;
  start_date: string;
  end_date: string | null;
  repeats_weekly: boolean;
  week_interval: number;
  weekdays: number[];
}

interface IncidentRow {
  id: number;
  employee_id: number;
  start_date: string;
  end_date: string;
  hours: string | null;
  code: string;
  is_hourly: boolean;
  counts_as_attendance: boolean;
}

interface PunchRow {
  id: string;
  employee_id: number;
  punched_at: Date;
  punch_type: PunchType | null;
  review_status: ReviewStatus;
}

interface ResultRow {
  employeeId: number;
  workDate: DateString;
  branchId: number | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  dayResult: string;
  lateMinutes: number;
  earlyMinutes: number;
  workedHours: number | null;
  overtimeHours: number;
  incidentId: number | null;
  hasPendingReview: boolean;
  detail: Record<string, unknown>;
  segments: unknown[];
}

const toEngineShift = (row: ShiftRow): EngineShift => ({
  id: Number(row.id),
  name: row.name,
  startTime: row.start_time,
  endTime: row.end_time,
  breakMinutes: Number(row.break_minutes),
  flexible: row.shift_type === 'flexible',
  isActive: row.is_active,
  entryBeforeMin: Number(row.entry_before_min),
  entryAfterMin: Number(row.entry_after_min),
  exitBeforeMin: Number(row.exit_before_min),
  exitAfterMin: Number(row.exit_after_min),
});

const toEngineAssignment = (row: AssignmentRow): EngineAssignment => ({
  id: Number(row.id),
  shiftId: row.shift_id === null ? null : Number(row.shift_id),
  startDate: row.start_date,
  endDate: row.end_date,
  repeatsWeekly: row.repeats_weekly,
  weekInterval: Number(row.week_interval),
  weekdays: row.weekdays.map(Number),
});

const listDates = (from: DateString, to: DateString): DateString[] => {
  const dates: DateString[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
};

const isoOrNull = (localMs: LocalMs | null, timeZone: string): string | null =>
  localMs === null ? null : localMsToInstant(localMs, timeZone).toISOString();

const buildResultRow = (
  employee: EmployeeRow,
  calc: DayCalculation,
  context: {
    timeZone: string;
    window: { from: LocalMs; to: LocalMs };
    hasSchedule: boolean;
    isHoliday: boolean;
    isRestDay: boolean;
    assignmentIds: number[];
    punchesConsidered: number;
    overtimeAuthorized: number;
  },
): ResultRow => {
  const { timeZone } = context;
  return {
    employeeId: Number(employee.id),
    workDate: calc.workDate,
    branchId: employee.branch_id === null ? null : Number(employee.branch_id),
    expectedStart: calc.expectedStartMinute === null ? null : minutesToTime(calc.expectedStartMinute),
    expectedEnd: calc.expectedEndMinute === null ? null : minutesToTime(calc.expectedEndMinute),
    clockInAt: calc.clockInAt === null ? null : localMsToInstant(calc.clockInAt, timeZone),
    clockOutAt: calc.clockOutAt === null ? null : localMsToInstant(calc.clockOutAt, timeZone),
    dayResult: calc.dayResult,
    lateMinutes: calc.lateMinutes,
    earlyMinutes: calc.earlyDepartureMinutes,
    workedHours: calc.workedHours,
    overtimeHours: calc.overtimeHours,
    incidentId: calc.incidentId,
    hasPendingReview: calc.hasPendingReview,
    detail: {
      reason: calc.reason,
      has_schedule: context.hasSchedule,
      is_holiday: context.isHoliday,
      is_rest_day: context.isRestDay,
      assignment_ids: context.assignmentIds,
      punches_considered: context.punchesConsidered,
      authorized_overtime_hours: context.overtimeAuthorized,
      clock_in_punch_id: calc.clockInRef,
      clock_out_punch_id: calc.clockOutRef,
      window_from: localMsToInstant(context.window.from, timeZone).toISOString(),
      window_to: localMsToInstant(context.window.to, timeZone).toISOString(),
    },
    segments: calc.segments.map((segment) => ({
      shift_id: segment.shiftId,
      name: segment.name,
      expected_start: segment.expectedStart,
      expected_end: segment.expectedEnd,
      clock_in_at: isoOrNull(segment.clockInAt, timeZone),
      clock_out_at: isoOrNull(segment.clockOutAt, timeZone),
      clock_in_punch_id: segment.clockInRef,
      clock_out_punch_id: segment.clockOutRef,
      late_minutes: segment.lateMinutes,
      early_departure_minutes: segment.earlyDepartureMinutes,
      hours: segment.hours,
      has_punches: segment.hasPunches,
    })),
  };
};

const upsertRows = async (db: Queryable, rows: readonly ResultRow[]): Promise<void> => {
  for (let offset = 0; offset < rows.length; offset += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + UPSERT_CHUNK_SIZE);
    await db.query(
      `INSERT INTO attendance.daily_results
         (employee_id, work_date, branch_id, expected_start_time, expected_end_time,
          clock_in_at, clock_out_at, day_result, late_minutes, early_departure_minutes,
          worked_hours, overtime_hours, incident_id, is_late_accumulation_absence,
          has_pending_review, calculation_detail, segments, calculated_at)
       SELECT t.employee_id, t.work_date, t.branch_id, t.expected_start::time, t.expected_end::time,
              t.clock_in_at, t.clock_out_at, t.day_result, t.late_minutes, t.early_minutes,
              t.worked_hours, t.overtime_hours, t.incident_id, FALSE,
              t.has_pending_review, t.detail::jsonb, t.segments::jsonb, NOW()
         FROM unnest(
           $1::bigint[], $2::date[], $3::bigint[], $4::text[], $5::text[],
           $6::timestamptz[], $7::timestamptz[], $8::text[], $9::int[], $10::int[],
           $11::numeric[], $12::numeric[], $13::bigint[], $14::boolean[], $15::text[], $16::text[]
         ) AS t(employee_id, work_date, branch_id, expected_start, expected_end,
                clock_in_at, clock_out_at, day_result, late_minutes, early_minutes,
                worked_hours, overtime_hours, incident_id, has_pending_review, detail, segments)
       ON CONFLICT (employee_id, work_date) DO UPDATE SET
         branch_id = EXCLUDED.branch_id,
         expected_start_time = EXCLUDED.expected_start_time,
         expected_end_time = EXCLUDED.expected_end_time,
         clock_in_at = EXCLUDED.clock_in_at,
         clock_out_at = EXCLUDED.clock_out_at,
         day_result = EXCLUDED.day_result,
         late_minutes = EXCLUDED.late_minutes,
         early_departure_minutes = EXCLUDED.early_departure_minutes,
         worked_hours = EXCLUDED.worked_hours,
         overtime_hours = EXCLUDED.overtime_hours,
         incident_id = EXCLUDED.incident_id,
         is_late_accumulation_absence = FALSE,
         has_pending_review = EXCLUDED.has_pending_review,
         calculation_detail = EXCLUDED.calculation_detail,
         segments = EXCLUDED.segments,
         calculated_at = NOW()`,
      [
        chunk.map((r) => r.employeeId),
        chunk.map((r) => r.workDate),
        chunk.map((r) => r.branchId),
        chunk.map((r) => r.expectedStart),
        chunk.map((r) => r.expectedEnd),
        chunk.map((r) => r.clockInAt),
        chunk.map((r) => r.clockOutAt),
        chunk.map((r) => r.dayResult),
        chunk.map((r) => r.lateMinutes),
        chunk.map((r) => r.earlyMinutes),
        chunk.map((r) => r.workedHours),
        chunk.map((r) => r.overtimeHours),
        chunk.map((r) => r.incidentId),
        chunk.map((r) => r.hasPendingReview),
        chunk.map((r) => JSON.stringify(r.detail)),
        chunk.map((r) => JSON.stringify(r.segments)),
      ],
    );
  }
};

interface RangeData {
  shifts: Map<number, EngineShift>;
  holidays: Set<DateString>;
  assignments: Map<number, EngineAssignment[]>;
  incidents: Map<number, IncidentRow[]>;
  punches: Map<number, Array<EnginePunch & { local: LocalMs }>>;
}

/** Datos comunes del rango (se cargan una sola vez). */
const loadSharedData = async (
  db: Queryable,
  from: DateString,
  to: DateString,
): Promise<Pick<RangeData, 'shifts' | 'holidays'>> => {
  const shiftRows = await db.query<ShiftRow>(
      `SELECT id, name, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
              break_minutes, shift_type, is_active,
              entry_before_min, entry_after_min, exit_before_min, exit_after_min
         FROM attendance.shifts`,
  );
  const holidayRows = await db.query<{ holiday_date: string }>(
      `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date
         FROM attendance.holidays
        WHERE is_active AND holiday_date BETWEEN $1::date AND $2::date`,
      [from, to],
  );
  return {
    shifts: new Map(shiftRows.rows.map((row) => [Number(row.id), toEngineShift(row)])),
    holidays: new Set(holidayRows.rows.map((row) => row.holiday_date)),
  };
};

/** Datos de un lote de colaboradores. */
const loadBatchData = async (
  db: Queryable,
  employeeIds: number[],
  from: DateString,
  to: DateString,
  timeZone: string,
): Promise<Pick<RangeData, 'assignments' | 'incidents' | 'punches'>> => {
  const scheduleFloor = addDays(from, -LOOKBACK_SCHEDULE_DAYS);
  // Margen amplio en instantes: el filtro fino lo hace la ventana de cada dia.
  const punchFrom = localMsToInstant(dateToLocalMs(addDays(from, -1)), timeZone);
  const punchTo = localMsToInstant(dateToLocalMs(addDays(to, 2)), timeZone);

  const assignmentRows = await db.query<AssignmentRow>(
      `SELECT id, employee_id, shift_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date, repeats_weekly, week_interval, weekdays
         FROM attendance.shift_assignments
        WHERE employee_id = ANY($1::bigint[])
          AND start_date <= $3::date
          AND (end_date IS NULL OR end_date >= $2::date)`,
      [employeeIds, scheduleFloor, to],
  );
  const incidentRows = await db.query<IncidentRow>(
      `SELECT i.id, i.employee_id, to_char(i.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(i.end_date, 'YYYY-MM-DD') AS end_date, i.hours::text AS hours,
              t.code, t.is_hourly, t.counts_as_attendance
         FROM attendance.incidents i
         JOIN attendance.incident_types t ON t.id = i.incident_type_id
        WHERE i.employee_id = ANY($1::bigint[])
          AND i.incident_status = 'authorized'
          AND i.start_date <= $3::date AND i.end_date >= $2::date
        ORDER BY i.created_at, i.id`,
      [employeeIds, from, to],
  );
  const punchRows = await db.query<PunchRow>(
      `SELECT id::text AS id, employee_id, punched_at, punch_type, review_status
         FROM attendance.punches
        WHERE employee_id = ANY($1::bigint[])
          AND punched_at >= $2 AND punched_at < $3
        ORDER BY punched_at, id`,
      [employeeIds, punchFrom, punchTo],
  );

  const assignments = new Map<number, EngineAssignment[]>();
  for (const row of assignmentRows.rows) {
    const list = assignments.get(Number(row.employee_id)) ?? [];
    list.push(toEngineAssignment(row));
    assignments.set(Number(row.employee_id), list);
  }
  const incidents = new Map<number, IncidentRow[]>();
  for (const row of incidentRows.rows) {
    const list = incidents.get(Number(row.employee_id)) ?? [];
    list.push(row);
    incidents.set(Number(row.employee_id), list);
  }
  const punches = new Map<number, Array<EnginePunch & { local: LocalMs }>>();
  for (const row of punchRows.rows) {
    const local = instantToLocalMs(row.punched_at, timeZone);
    const list = punches.get(Number(row.employee_id)) ?? [];
    list.push({
      ref: Number(row.id),
      at: local,
      local,
      type: row.punch_type,
      reviewStatus: row.review_status,
    });
    punches.set(Number(row.employee_id), list);
  }
  return { assignments, incidents, punches };
};

const pickIncidents = (
  rows: readonly IncidentRow[],
  date: DateString,
): { fullDay: FullDayIncident | null; overtimeHours: number } => {
  let fullDay: FullDayIncident | null = null;
  let overtimeHours = 0;
  for (const row of rows) {
    if (row.start_date > date || row.end_date < date) continue;
    if (row.is_hourly) {
      overtimeHours += row.hours === null ? 0 : Number(row.hours);
    } else if (!fullDay) {
      fullDay = { id: Number(row.id), code: row.code, countsAsAttendance: row.counts_as_attendance };
    }
  }
  return { fullDay, overtimeHours };
};

const calculateEmployee = (
  employee: EmployeeRow,
  dates: readonly DateString[],
  settings: AttendanceSettings,
  data: RangeData,
): ResultRow[] => {
  const assignments = data.assignments.get(Number(employee.id)) ?? [];
  const incidents = data.incidents.get(Number(employee.id)) ?? [];
  const allPunches = data.punches.get(Number(employee.id)) ?? [];
  const rows: ResultRow[] = [];

  for (const date of dates) {
    if (employee.hire_date && date < employee.hire_date) continue;

    const plan = resolveDay(assignments, data.shifts, date, settings.week_start);
    const window = dayWindow(date, settings.cutoff_time, plan.segments[0]?.crossesMidnight ?? false);
    const dayPunches = allPunches.filter((punch) => punch.local >= window.from && punch.local < window.to);
    const { fullDay, overtimeHours } = pickIncidents(incidents, date);
    const hasSchedule = hasScheduleOn(assignments, date, LOOKBACK_SCHEDULE_DAYS);
    const isHoliday = data.holidays.has(date);

    const calc = calculateDay({
      workDate: date,
      plan,
      hasSchedule,
      isHoliday,
      punches: dayPunches.map(({ ref, at, type, reviewStatus }) => ({ ref, at, type, reviewStatus })),
      fullDayIncident: fullDay,
      authorizedOvertimeHours: overtimeHours,
      settings,
    });
    rows.push(
      buildResultRow(employee, calc, {
        timeZone: settings.timezone,
        window,
        hasSchedule,
        isHoliday,
        isRestDay: plan.isRestDay,
        assignmentIds: plan.assignmentIds,
        punchesConsidered: dayPunches.length,
        overtimeAuthorized: overtimeHours,
      }),
    );
  }
  return rows;
};

/**
 * Falta por retardos acumulados: lee TODAS las filas del periodo (no solo del
 * rango recalculado) y deja la bandera en true solo en las marcadas.
 */
const applyLateAccumulation = async (
  db: Queryable,
  employeeIds: number[],
  from: DateString,
  to: DateString,
  settings: AttendanceSettings,
): Promise<void> => {
  const start = latePeriodBounds(from, settings.late_period, settings.week_start).start;
  const end = latePeriodBounds(to, settings.late_period, settings.week_start).end;

  const { rows } = await db.query<{
    id: string;
    employee_id: number;
    work_date: string;
    day_result: DayOutcome['dayResult'];
    is_late_accumulation_absence: boolean;
  }>(
    `SELECT id::text AS id, employee_id, to_char(work_date, 'YYYY-MM-DD') AS work_date,
            day_result, is_late_accumulation_absence
       FROM attendance.daily_results
      WHERE employee_id = ANY($1::bigint[]) AND work_date BETWEEN $2::date AND $3::date`,
    [employeeIds, start, end],
  );

  const byEmployee = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byEmployee.get(Number(row.employee_id)) ?? [];
    list.push(row);
    byEmployee.set(Number(row.employee_id), list);
  }

  const setTrue: string[] = [];
  const setFalse: string[] = [];
  for (const list of byEmployee.values()) {
    const marked = markLateAccumulation(
      list.map((row) => ({ date: row.work_date, dayResult: row.day_result })),
      settings,
    );
    for (const row of list) {
      const shouldBe = marked.has(row.work_date);
      if (shouldBe && !row.is_late_accumulation_absence) setTrue.push(row.id);
      if (!shouldBe && row.is_late_accumulation_absence) setFalse.push(row.id);
    }
  }
  if (setTrue.length > 0) {
    await db.query(
      'UPDATE attendance.daily_results SET is_late_accumulation_absence = TRUE WHERE id = ANY($1::bigint[])',
      [setTrue],
    );
  }
  if (setFalse.length > 0) {
    await db.query(
      'UPDATE attendance.daily_results SET is_late_accumulation_absence = FALSE WHERE id = ANY($1::bigint[])',
      [setFalse],
    );
  }
};

export const recalculateRange = async (
  scope: RecalculationScope,
  options: RecalculationOptions = {},
): Promise<RecalculationSummary> => {
  const { from, to } = scope;
  if (from > to) return { employees: 0, days: 0 };

  const db: Queryable = options.client ?? pool;
  const settings = options.settings ?? (await getAttendanceSettings());
  const dates = listDates(from, to);

  const employeeFilter = scope.employeeIds ? 'AND e.id = ANY($1::bigint[])' : '';
  const { rows: employees } = await db.query<EmployeeRow>(
    `SELECT e.id, e.branch_id, to_char(e.hire_date, 'YYYY-MM-DD') AS hire_date
       FROM public.employees e
       JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE p.is_enabled AND e.is_active ${employeeFilter}
      ORDER BY e.id`,
    scope.employeeIds ? [scope.employeeIds] : [],
  );
  if (employees.length === 0) return { employees: 0, days: 0 };

  const shared = await loadSharedData(db, from, to);
  let totalDays = 0;

  for (let offset = 0; offset < employees.length; offset += EMPLOYEE_BATCH_SIZE) {
    const batch = employees.slice(offset, offset + EMPLOYEE_BATCH_SIZE);
    const batchIds = batch.map((employee) => Number(employee.id));
    const batchData = await loadBatchData(db, batchIds, from, to, settings.timezone);
    const data: RangeData = { ...shared, ...batchData };

    const rows = batch.flatMap((employee) => calculateEmployee(employee, dates, settings, data));
    await upsertRows(db, rows);
    await applyLateAccumulation(db, batchIds, from, to, settings);
    totalDays += rows.length;
  }

  return { employees: employees.length, days: totalDays };
};

/**
 * Recalcula solo los dias YA PASADOS de un colaborador dentro de [from, to],
 * acotado a ayer como maximo y a 60 dias atras como minimo (los futuros los
 * calcula el proceso nocturno).
 */
export const recalculateAffectedPastDays = async (
  employeeId: number,
  from: string,
  to: string,
): Promise<RecalculationSummary> => {
  const settings = await getAttendanceSettings();
  const today = todayInZone(settings.timezone);
  const yesterday = addDays(today, -1);
  const floor = addDays(today, -MAX_PAST_DAYS);
  const boundedTo = to > yesterday ? yesterday : to;
  const boundedFrom = from < floor ? floor : from;
  if (daysBetween(boundedFrom, boundedTo) < 0) return { employees: 0, days: 0 };
  return recalculateRange({ from: boundedFrom, to: boundedTo, employeeIds: [employeeId] }, { settings });
};
