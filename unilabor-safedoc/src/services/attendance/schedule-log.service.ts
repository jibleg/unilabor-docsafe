import pool from '../../config/db';
import type { Queryable } from '../../utils/transaction';
import { getAttendanceSettings } from './attendance-settings.service';
import type { DateString } from './engine/time';
import type { ScheduleLogQuery } from '../../schemas/attendance/schedule.schema';

/** Bitacora de cambios de horario (attendance.schedule_changes). */

export type ScheduleChangeAction = 'schedule' | 'edit' | 'remove' | 'end' | 'copy';

export interface ScheduleChangeEntry {
  employeeId: number;
  action: ScheduleChangeAction;
  shiftName: string | null;
  description: string;
  startDate: DateString | null;
  endDate: DateString | null;
  repeatsWeekly: boolean | null;
  weekdays: readonly number[] | null;
  userId: string | null;
}

/** Escribe un renglon de bitacora; se llama DENTRO de la transaccion del cambio. */
export const insertScheduleChange = async (db: Queryable, entry: ScheduleChangeEntry): Promise<void> => {
  await db.query(
    `INSERT INTO attendance.schedule_changes
       (employee_id, change_action, shift_name, description, start_date, end_date,
        repeats_weekly, weekdays, changed_by_user_id)
     VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8::smallint[], $9)`,
    [
      entry.employeeId,
      entry.action,
      entry.shiftName,
      entry.description,
      entry.startDate,
      entry.endDate,
      entry.repeatsWeekly,
      entry.weekdays === null ? null : [...entry.weekdays],
      entry.userId,
    ],
  );
};

interface LogRow {
  id: number | string;
  employee_id: number | string;
  employee_name: string;
  change_action: ScheduleChangeAction;
  shift_name: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  repeats_weekly: boolean | null;
  weekdays: number[] | null;
  changed_by_user_id: string | null;
  user_name: string | null;
  changed_at: Date;
}

export const listScheduleLog = async (query: ScheduleLogQuery) => {
  const settings = await getAttendanceSettings();
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown): void => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };
  const localDate = (): string => {
    params.push(settings.timezone);
    return `(c.changed_at AT TIME ZONE $${params.length})::date`;
  };
  if (query.from) add(`${localDate()} >= ?::date`, query.from);
  if (query.to) add(`${localDate()} <= ?::date`, query.to);
  if (query.employee_id) add('c.employee_id = ?', query.employee_id);
  if (query.action) add('c.change_action = ?', query.action);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: countRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM attendance.schedule_changes c ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);

  const offset = (query.page - 1) * query.limit;
  const { rows } = await pool.query<LogRow>(
    `SELECT c.id, c.employee_id, e.full_name AS employee_name, c.change_action, c.shift_name,
            c.description, to_char(c.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(c.end_date, 'YYYY-MM-DD') AS end_date, c.repeats_weekly, c.weekdays,
            c.changed_by_user_id, u.full_name AS user_name, c.changed_at
       FROM attendance.schedule_changes c
       JOIN public.employees e ON e.id = c.employee_id
       LEFT JOIN public.users u ON u.id = c.changed_by_user_id
       ${where}
      ORDER BY c.changed_at DESC, c.id DESC
      LIMIT ${query.limit} OFFSET ${offset}`,
    params,
  );

  return {
    data: rows.map((row) => ({
      id: Number(row.id),
      employee_id: Number(row.employee_id),
      employee_name: row.employee_name,
      action: row.change_action,
      shift_name: row.shift_name,
      description: row.description,
      start_date: row.start_date,
      end_date: row.end_date,
      repeats_weekly: row.repeats_weekly,
      weekdays: row.weekdays,
      changed_by_user_id: row.changed_by_user_id,
      changed_by_name: row.user_name,
      changed_at: row.changed_at,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
};
