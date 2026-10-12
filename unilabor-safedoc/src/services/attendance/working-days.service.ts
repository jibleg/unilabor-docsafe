import pool from '../../config/db';
import type { Queryable } from '../../utils/transaction';
import { getAttendanceSettings } from './attendance-settings.service';
import { countWorkingDays } from './engine/vacations';
import type { EngineAssignment, EngineShift } from './engine/schedule';
import { addDays } from './engine/time';

/**
 * Dias laborables de un rango para un colaborador: carga programacion y
 * festivos y delega el conteo al motor puro (engine/vacations.ts).
 */

interface ShiftRow {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  shift_type: string;
  is_active: boolean;
}

interface AssignmentRow {
  id: string;
  shift_id: string | null;
  start_date: string;
  end_date: string | null;
  repeats_weekly: boolean;
  week_interval: number;
  weekdays: number[];
}

export const getWorkingDays = async (
  employeeId: number,
  from: string,
  to: string,
  db: Queryable = pool,
): Promise<number> => {
  if (to < from) return 0;
  const settings = await getAttendanceSettings();
  // Margen de una semana a cada lado: la semana del primer/ultimo dia puede empezar antes o terminar despues.
  const windowStart = addDays(from, -7);
  const windowEnd = addDays(to, 7);

  const [assignments, shifts, holidays] = await Promise.all([
    db.query<AssignmentRow>(
      `SELECT id::text, shift_id::text, start_date::text, end_date::text, repeats_weekly, week_interval, weekdays::int[] AS weekdays
         FROM attendance.shift_assignments
        WHERE employee_id = $1 AND start_date <= $3::date AND (end_date IS NULL OR end_date >= $2::date)`,
      [employeeId, windowStart, windowEnd],
    ),
    db.query<ShiftRow>(
      `SELECT id::text, name, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
              break_minutes, shift_type, is_active
         FROM attendance.shifts`,
    ),
    db.query<{ holiday_date: string }>(
      `SELECT holiday_date::text FROM attendance.holidays
        WHERE is_active AND holiday_date BETWEEN $1::date AND $2::date`,
      [from, to],
    ),
  ]);

  const engineAssignments: EngineAssignment[] = assignments.rows.map((row) => ({
    id: Number(row.id),
    shiftId: row.shift_id === null ? null : Number(row.shift_id),
    startDate: row.start_date,
    endDate: row.end_date,
    repeatsWeekly: row.repeats_weekly,
    weekInterval: row.week_interval,
    weekdays: row.weekdays,
  }));
  const shiftsById = new Map<number, EngineShift>(
    shifts.rows.map((row) => [
      Number(row.id),
      {
        id: Number(row.id),
        name: row.name,
        startTime: row.start_time,
        endTime: row.end_time,
        breakMinutes: row.break_minutes,
        flexible: row.shift_type === 'flexible',
        isActive: row.is_active,
      },
    ]),
  );

  return countWorkingDays({
    from,
    to,
    assignments: engineAssignments,
    shiftsById,
    holidays: new Set(holidays.rows.map((row) => row.holiday_date)),
    weekStart: settings.week_start,
  });
};
