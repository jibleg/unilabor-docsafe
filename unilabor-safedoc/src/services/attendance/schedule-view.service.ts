import pool from '../../config/db';
import type { ScheduleQuery } from '../../schemas/attendance/schedule.schema';
import { getAttendanceSettings } from './attendance-settings.service';
import { invalid, notFound } from './attendance-errors';
import { resolveDay, segmentHours, type EngineShift } from './engine/schedule';
import { addDays, daysBetween, isoWeekday, roundTo, startOfWeek, type DateString, type WeekStart } from './engine/time';
import {
  loadAssignmentsByEmployee,
  loadShiftRows,
  toEngineShift,
  toShiftView,
  type AssignmentRecord,
} from './schedule-data.service';
import { todayInZone } from './timezone';

/** Vistas de lectura de la programacion: calendario semanal y ficha por colaborador. */

const assignmentTiming = (a: AssignmentRecord) => ({
  start_date: a.startDate,
  end_date: a.endDate,
  repeats_weekly: a.repeatsWeekly,
  week_interval: a.weekInterval,
  weekdays: a.weekdays,
  notes: a.notes,
});

export const REST_COLOR = '#9CA3AF';
const MAX_RANGE_DAYS = 366;

export interface ScheduleChip {
  assignment_id: number;
  shift_id: number | null;
  name: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  color_hex: string;
  is_recurring: boolean;
  duplicate_count: number;
  /** Vigencia y repeticion de la programacion principal del chip (para precargar la edicion). */
  start_date: DateString;
  end_date: DateString | null;
  repeats_weekly: boolean;
  week_interval: number;
  weekdays: number[];
  notes: string | null;
}

export interface DayView {
  date: DateString;
  weekday: number;
  chips: ScheduleChip[];
  is_rest_day: boolean;
  has_schedule: boolean;
  has_conflict_limit: boolean;
  is_split: boolean;
  total_hours: number;
}

interface ShiftDisplay {
  engine: Map<number, EngineShift>;
  colors: Map<number, string>;
}

/**
 * Chips de un dia resuelto con la misma logica del motor. Para MOSTRAR, los
 * turnos inactivos se siguen viendo (la programacion existe); el calculo si
 * los ignora.
 */
export const buildDayView = (
  assignments: readonly AssignmentRecord[],
  display: ShiftDisplay,
  date: DateString,
  weekStart: WeekStart,
  maxShiftsPerDay: number,
): DayView => {
  const plan = resolveDay(assignments, display.engine, date, weekStart);
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const effective = plan.assignmentIds.map((id) => byId.get(id)).filter((a): a is AssignmentRecord => a !== undefined);
  const chips: ScheduleChip[] = [];

  if (plan.isRestDay) {
    const rest = effective.filter((a) => a.shiftId === null);
    const first = rest[0];
    if (first) {
      chips.push({
        assignment_id: first.id,
        shift_id: null,
        name: 'Descanso',
        start_time: null,
        end_time: null,
        hours: 0,
        color_hex: REST_COLOR,
        is_recurring: first.repeatsWeekly,
        duplicate_count: rest.length,
        ...assignmentTiming(first),
      });
    }
  } else {
    for (const segment of plan.segments) {
      const mine = effective.filter((a) => a.shiftId === segment.shiftId);
      const first = mine[0];
      const shift = display.engine.get(segment.shiftId);
      if (!first || !shift) continue;
      chips.push({
        assignment_id: first.id,
        shift_id: segment.shiftId,
        name: shift.name,
        start_time: shift.startTime.slice(0, 5),
        end_time: shift.endTime.slice(0, 5),
        hours: roundTo(segmentHours(segment), 2),
        color_hex: display.colors.get(segment.shiftId) ?? REST_COLOR,
        is_recurring: first.repeatsWeekly,
        duplicate_count: mine.length,
        ...assignmentTiming(first),
      });
    }
  }

  const working = chips.filter((chip) => chip.shift_id !== null);
  return {
    date,
    weekday: isoWeekday(date),
    chips,
    is_rest_day: plan.isRestDay,
    has_schedule: chips.length > 0,
    has_conflict_limit: working.length >= maxShiftsPerDay,
    is_split: working.length > 1,
    total_hours: roundTo(working.reduce((sum, chip) => sum + chip.hours, 0), 2),
  };
};

const loadDisplayShifts = async () => {
  const rows = await loadShiftRows(pool);
  // Para mostrar: todos los turnos como activos
  const engine = new Map(rows.map((row) => [Number(row.id), { ...toEngineShift(row), isActive: true }]));
  const colors = new Map(rows.map((row) => [Number(row.id), row.color_hex]));
  return { rows, display: { engine, colors } satisfies ShiftDisplay };
};

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

interface EmployeeRow {
  employee_id: number | string;
  full_name: string;
  employee_code: string;
  position: string | null;
  branch_id: number | string | null;
  branch_name: string | null;
  device_employee_number: string | null;
  is_enabled: boolean;
}

export const getWeekSchedule = async (query: ScheduleQuery) => {
  const settings = await getAttendanceSettings();
  const weekStart = settings.week_start;
  const anchor = query.week ?? todayInZone(settings.timezone);
  const weekStartDate = startOfWeek(anchor, weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const weekEndDate = addDays(weekStartDate, 6);

  const onlyEnabled = query.only_enabled ?? true;
  const params: unknown[] = [onlyEnabled];
  const conditions = ['e.is_active', '($1::boolean = FALSE OR COALESCE(p.is_enabled, FALSE))'];
  if (query.branch_id) {
    params.push(query.branch_id);
    conditions.push(`e.branch_id = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${escapeLike(query.search)}%`);
    const n = params.length;
    conditions.push(
      `(e.full_name ILIKE $${n} OR e.employee_code ILIKE $${n} OR p.device_employee_number ILIKE $${n})`,
    );
  }
  const from = `FROM public.employees e
       LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id
       LEFT JOIN public.helpdesk_asset_units b ON b.id = e.branch_id
      WHERE ${conditions.join(' AND ')}`;

  const page = query.page ?? 1;
  const limit = query.limit ?? 200;
  const { rows: countRows } = await pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total ${from}`, params);
  const total = Number(countRows[0]?.total ?? 0);

  const { rows: employees } = await pool.query<EmployeeRow>(
    `SELECT e.id AS employee_id, e.full_name, e.employee_code, e.position, e.branch_id,
            b.name AS branch_name, p.device_employee_number, COALESCE(p.is_enabled, FALSE) AS is_enabled
       ${from}
      ORDER BY COALESCE(b.name, ''), LOWER(e.full_name), e.id
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params,
  );

  const ids = employees.map((row) => Number(row.employee_id));
  const assignments = await loadAssignmentsByEmployee(pool, ids, { from: weekStartDate, to: weekEndDate });
  const { rows: shiftRows, display } = await loadDisplayShifts();

  const data = employees.map((row) => {
    const mine = assignments.get(Number(row.employee_id)) ?? [];
    const dayViews = days.map((date) => buildDayView(mine, display, date, weekStart, settings.max_shifts_per_day));
    return {
      employee_id: Number(row.employee_id),
      full_name: row.full_name,
      employee_code: row.employee_code,
      position: row.position,
      branch_id: row.branch_id === null ? null : Number(row.branch_id),
      branch_name: row.branch_name,
      device_employee_number: row.device_employee_number,
      is_enabled: row.is_enabled,
      week_hours: roundTo(dayViews.reduce((sum, d) => sum + d.total_hours, 0), 2),
      days: dayViews.map(({ date, chips, is_rest_day, has_conflict_limit, is_split, total_hours }) => ({
        date,
        chips,
        is_rest_day,
        has_conflict_limit,
        is_split,
        total_hours,
      })),
    };
  });

  return {
    data,
    pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
    shifts: shiftRows.filter((row) => row.is_active).map(toShiftView),
    max_shifts_per_day: settings.max_shifts_per_day,
    week_start: weekStart,
    week_start_date: weekStartDate,
    days,
  };
};

export const getEmployeeSchedule = async (employeeId: number, from?: DateString, to?: DateString) => {
  const settings = await getAttendanceSettings();
  const weekStart = settings.week_start;
  const { rows } = await pool.query<{ id: number | string; full_name: string; employee_code: string }>(
    'SELECT id, full_name, employee_code FROM public.employees WHERE id = $1',
    [employeeId],
  );
  const employee = rows[0];
  if (!employee) notFound('Colaborador no encontrado');

  const rangeFrom = from ?? startOfWeek(todayInZone(settings.timezone), weekStart);
  const rangeTo = to ?? addDays(rangeFrom, 6);
  if (rangeTo < rangeFrom) invalid('La fecha final no puede ser anterior a la inicial');
  if (daysBetween(rangeFrom, rangeTo) + 1 > MAX_RANGE_DAYS) invalid(`El rango maximo es de ${MAX_RANGE_DAYS} dias`);

  const assignments =
    (await loadAssignmentsByEmployee(pool, [employeeId], { from: rangeFrom, to: rangeTo })).get(employeeId) ?? [];
  const { display } = await loadDisplayShifts();

  const total = daysBetween(rangeFrom, rangeTo) + 1;
  const days = Array.from({ length: total }, (_, i) =>
    buildDayView(assignments, display, addDays(rangeFrom, i), weekStart, settings.max_shifts_per_day),
  );

  return {
    employee: {
      id: Number(employee?.id),
      full_name: employee?.full_name ?? '',
      employee_code: employee?.employee_code ?? '',
    },
    from: rangeFrom,
    to: rangeTo,
    days,
  };
};
