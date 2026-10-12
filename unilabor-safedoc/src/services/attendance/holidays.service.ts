import pool from '../../config/db';
import type { CreateHolidayInput, UpdateHolidayInput } from '../../schemas/attendance/holidays.schema';
import { registerAuditEvent } from '../audit.service';
import { conflict, notFound } from './attendance-errors';
import { recalculateRange } from './day-recalculation.service';

/** Festivos oficiales (iguales para todas las sucursales). */

export interface HolidayRow {
  id: number;
  holiday_date: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const HOLIDAY_COLUMNS = `id::int AS id, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date, name, is_active,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`;

const DUPLICATE_MESSAGE = 'Ya existe un festivo en esa fecha.';

/** Recalculo best-effort de un dia: nunca hace fallar la peticion. */
const recalculateDateSafely = async (date: string): Promise<void> => {
  try {
    await recalculateRange({ from: date, to: date });
  } catch (error) {
    console.error(`[attendance] recalculo por festivo ${date} fallo:`, error);
  }
};

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string })?.code === '23505';

export const listHolidays = async (year?: number): Promise<HolidayRow[]> => {
  const values: unknown[] = [];
  let where = '';
  if (year !== undefined) {
    values.push(year);
    where = 'WHERE EXTRACT(YEAR FROM holiday_date) = $1';
  }
  const { rows } = await pool.query<HolidayRow>(
    `SELECT ${HOLIDAY_COLUMNS} FROM attendance.holidays ${where} ORDER BY holiday_date`,
    values,
  );
  return rows;
};

const getHoliday = async (id: number): Promise<HolidayRow> => {
  const { rows } = await pool.query<HolidayRow>(
    `SELECT ${HOLIDAY_COLUMNS} FROM attendance.holidays WHERE id = $1`,
    [id],
  );
  return rows[0] ?? notFound('Festivo no encontrado.');
};

const audit = (userId: string, action: string, id: number, metadata: Record<string, unknown>) =>
  registerAuditEvent({
    user_id: userId,
    action,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_holiday',
    entity_id: id,
    metadata,
  }).catch(() => undefined);

export const createHoliday = async (input: CreateHolidayInput, userId: string): Promise<HolidayRow> => {
  try {
    const { rows } = await pool.query<{ id: number }>(
      'INSERT INTO attendance.holidays (holiday_date, name) VALUES ($1, $2) RETURNING id::int AS id',
      [input.holiday_date, input.name],
    );
    const holiday = await getHoliday(rows[0]!.id);
    await audit(userId, 'attendance_holiday_created', holiday.id, { ...input });
    await recalculateDateSafely(holiday.holiday_date);
    return holiday;
  } catch (error) {
    if (isUniqueViolation(error)) return conflict(DUPLICATE_MESSAGE);
    throw error;
  }
};

export const updateHoliday = async (id: number, input: UpdateHolidayInput, userId: string): Promise<HolidayRow> => {
  const before = await getHoliday(id);
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (input.holiday_date !== undefined) push('holiday_date', input.holiday_date);
  if (input.name !== undefined) push('name', input.name);
  if (input.is_active !== undefined) push('is_active', input.is_active);
  values.push(id);

  try {
    await pool.query(`UPDATE attendance.holidays SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  } catch (error) {
    if (isUniqueViolation(error)) return conflict(DUPLICATE_MESSAGE);
    throw error;
  }
  const after = await getHoliday(id);
  await audit(userId, 'attendance_holiday_updated', id, { before, changes: { ...input } });
  await recalculateDateSafely(before.holiday_date);
  if (after.holiday_date !== before.holiday_date) await recalculateDateSafely(after.holiday_date);
  return after;
};

/** Los festivos no son evidencia: se permite borrado fisico. */
export const deleteHoliday = async (id: number, userId: string): Promise<void> => {
  const before = await getHoliday(id);
  await pool.query('DELETE FROM attendance.holidays WHERE id = $1', [id]);
  await audit(userId, 'attendance_holiday_deleted', id, { ...before });
  await recalculateDateSafely(before.holiday_date);
};
