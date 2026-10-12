import { conflict, invalid } from './attendance-errors';
import type { EngineAssignment, EngineShift } from './engine/schedule';
import { isoWeekday, type DateString } from './engine/time';
import type { Queryable } from '../../utils/transaction';

/**
 * Lectura y mapeo comun de turnos y asignaciones (filas de BD -> motor puro).
 * Las fechas y horas se seleccionan SIEMPRE como texto para evitar el desfase
 * de zona horaria de node-pg con columnas date.
 */

export const SHIFT_COLUMNS = `s.id, s.name,
  to_char(s.start_time, 'HH24:MI') AS start_time,
  to_char(s.end_time, 'HH24:MI') AS end_time,
  s.crosses_midnight, s.break_minutes, s.shift_type, s.color_hex, s.is_active`;

export interface ShiftRow {
  id: number | string;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  break_minutes: number;
  shift_type: 'fixed' | 'flexible';
  color_hex: string;
  is_active: boolean;
}

export interface ShiftView {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  break_minutes: number;
  shift_type: 'fixed' | 'flexible';
  color_hex: string;
  is_active: boolean;
}

export const toShiftView = (row: ShiftRow): ShiftView => ({
  id: Number(row.id),
  name: row.name,
  start_time: row.start_time,
  end_time: row.end_time,
  crosses_midnight: row.crosses_midnight,
  break_minutes: Number(row.break_minutes),
  shift_type: row.shift_type,
  color_hex: row.color_hex,
  is_active: row.is_active,
});

export const toEngineShift = (row: ShiftRow): EngineShift => ({
  id: Number(row.id),
  name: row.name,
  startTime: row.start_time,
  endTime: row.end_time,
  breakMinutes: Number(row.break_minutes),
  flexible: row.shift_type === 'flexible',
  isActive: row.is_active,
});

/** Todos los turnos (activos e inactivos) por id. */
export const loadShiftRows = async (db: Queryable): Promise<ShiftRow[]> => {
  const { rows } = await db.query<ShiftRow>(`SELECT ${SHIFT_COLUMNS} FROM attendance.shifts s ORDER BY s.id`);
  return rows;
};

export const loadShiftsMap = async (db: Queryable): Promise<Map<number, EngineShift>> =>
  new Map((await loadShiftRows(db)).map((row) => [Number(row.id), toEngineShift(row)]));

export const ASSIGNMENT_COLUMNS = `a.id, a.employee_id, a.shift_id,
  to_char(a.start_date, 'YYYY-MM-DD') AS start_date,
  to_char(a.end_date, 'YYYY-MM-DD') AS end_date,
  a.repeats_weekly, a.week_interval, a.weekdays, a.notes`;

export interface AssignmentRow {
  id: number | string;
  employee_id: number | string;
  shift_id: number | string | null;
  start_date: DateString;
  end_date: DateString | null;
  repeats_weekly: boolean;
  week_interval: number;
  weekdays: number[];
  notes: string | null;
}

/** Asignacion del motor + datos de persistencia. */
export interface AssignmentRecord extends EngineAssignment {
  employeeId: number;
  notes: string | null;
}

export const toAssignmentRecord = (row: AssignmentRow): AssignmentRecord => ({
  id: Number(row.id),
  employeeId: Number(row.employee_id),
  shiftId: row.shift_id === null ? null : Number(row.shift_id),
  startDate: row.start_date,
  endDate: row.end_date,
  repeatsWeekly: row.repeats_weekly,
  weekInterval: Number(row.week_interval),
  weekdays: (row.weekdays ?? []).map(Number),
  notes: row.notes,
});

/** Programacion completa de varios colaboradores, agrupada por colaborador. */
export const loadAssignmentsByEmployee = async (
  db: Queryable,
  employeeIds: readonly number[],
  window?: { from: DateString; to: DateString },
): Promise<Map<number, AssignmentRecord[]>> => {
  const result = new Map<number, AssignmentRecord[]>(employeeIds.map((id) => [id, []]));
  if (employeeIds.length === 0) return result;
  const params: unknown[] = [employeeIds];
  let windowSql = '';
  if (window) {
    params.push(window.from, window.to);
    windowSql = ' AND a.start_date <= $3::date AND (a.end_date IS NULL OR a.end_date >= $2::date)';
  }
  const { rows } = await db.query<AssignmentRow>(
    `SELECT ${ASSIGNMENT_COLUMNS}
       FROM attendance.shift_assignments a
      WHERE a.employee_id = ANY($1::bigint[])${windowSql}
      ORDER BY a.start_date, a.id`,
    params,
  );
  for (const row of rows) {
    const record = toAssignmentRecord(row);
    result.get(record.employeeId)?.push(record);
  }
  return result;
};

export interface EmployeeBasic {
  id: number;
  full_name: string;
  is_enabled: boolean;
}

/** Valida que existan y esten habilitados en el control de asistencia; devuelve nombres. */
export const requireEnabledEmployees = async (
  db: Queryable,
  employeeIds: readonly number[],
): Promise<Map<number, EmployeeBasic>> => {
  const { rows } = await db.query<{ id: number | string; full_name: string; is_enabled: boolean | null }>(
    `SELECT e.id, e.full_name, p.is_enabled
       FROM public.employees e
       LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE e.id = ANY($1::bigint[])`,
    [employeeIds],
  );
  const found = new Map<number, EmployeeBasic>(
    rows.map((row) => [
      Number(row.id),
      { id: Number(row.id), full_name: row.full_name, is_enabled: row.is_enabled === true },
    ]),
  );
  const missing = employeeIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    invalid(`Colaborador(es) no encontrado(s): ${missing.join(', ')}`);
  }
  const disabled = [...found.values()].filter((employee) => !employee.is_enabled);
  if (disabled.length > 0) {
    conflict(
      `Colaborador(es) no habilitado(s) en el control de asistencia: ${disabled.map((e) => e.full_name).join(', ')}`,
    );
  }
  return found;
};

const WEEKDAY_NAMES = ['', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

export const weekdayLabels = (weekdays: readonly number[]): string =>
  weekdays.map((day) => WEEKDAY_NAMES[day] ?? String(day)).join(', ');

export interface AssignmentTextFields {
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
  startDate: DateString;
  endDate: DateString | null;
  repeatsWeekly: boolean;
  weekInterval: number;
  weekdays: readonly number[];
}

/** Descripcion legible de una asignacion para la bitacora. */
export const describeAssignment = (fields: AssignmentTextFields): string => {
  const what = fields.startTime && fields.endTime ? `${fields.shiftName} ${fields.startTime}-${fields.endTime}` : fields.shiftName;
  if (!fields.repeatsWeekly) {
    return `${what} el ${fields.startDate}`;
  }
  const every = fields.weekInterval > 1 ? `cada ${fields.weekInterval} semanas` : 'cada semana';
  const days = weekdayLabels(fields.weekdays);
  const until = fields.endDate ? ` hasta ${fields.endDate}` : ' sin fecha fin';
  return `${what} (${days}, ${every}) desde ${fields.startDate}${until}`;
};

export const singleDayWeekdays = (date: DateString): number[] => [isoWeekday(date)];
