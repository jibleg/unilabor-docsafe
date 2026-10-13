import pool from '../../config/db';
import { registerAuditEvent } from '../audit.service';
import type { CreateShiftInput, UpdateShiftInput } from '../../schemas/attendance/shifts.schema';
import { conflict, notFound } from './attendance-errors';
import { SHIFT_COLUMNS, toShiftView, type ShiftRow, type ShiftView } from './schedule-data.service';
import { recalcAfterScheduleChange } from './schedule-recalc';
import { addDays } from './engine/time';
import { getAttendanceSettings } from './attendance-settings.service';
import { todayInZone } from './timezone';

/** Catalogo de turnos. */

export interface ShiftWithCount extends ShiftView {
  assignments_count: number;
}

interface ShiftCountRow extends ShiftRow {
  assignments_count: string | number;
}

const NAME_TAKEN = 'Ya existe un turno con ese nombre';

export const listShifts = async (includeInactive: boolean): Promise<ShiftWithCount[]> => {
  const { rows } = await pool.query<ShiftCountRow>(
    `SELECT ${SHIFT_COLUMNS},
            (SELECT COUNT(*) FROM attendance.shift_assignments a
              WHERE a.shift_id = s.id AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)) AS assignments_count
       FROM attendance.shifts s
      WHERE ($1::boolean OR s.is_active)
      ORDER BY s.is_active DESC, s.start_time, LOWER(s.name)`,
    [includeInactive],
  );
  return rows.map((row) => ({ ...toShiftView(row), assignments_count: Number(row.assignments_count) }));
};

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

const loadShift = async (id: number): Promise<ShiftView | null> => {
  const { rows } = await pool.query<ShiftRow>(`SELECT ${SHIFT_COLUMNS} FROM attendance.shifts s WHERE s.id = $1`, [id]);
  const row = rows[0];
  return row ? toShiftView(row) : null;
};

export const createShift = async (input: CreateShiftInput, userId: string, ip: string | null): Promise<ShiftView> => {
  try {
    const { rows } = await pool.query<{ id: number | string }>(
      `INSERT INTO attendance.shifts (name, start_time, end_time, break_minutes, shift_type, color_hex, is_active,
          entry_before_min, entry_after_min, exit_before_min, exit_after_min)
       VALUES ($1, $2::time, $3::time, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [input.name, input.start_time, input.end_time, input.break_minutes, input.shift_type, input.color_hex, input.is_active ?? true,
        input.entry_before_min, input.entry_after_min, input.exit_before_min, input.exit_after_min],
    );
    const id = Number(rows[0]?.id);
    const shift = (await loadShift(id)) as ShiftView;
    await registerAuditEvent({
      user_id: userId,
      action: 'ATTENDANCE_SHIFT_CREATE',
      ip_address: ip,
      module_code: 'ATTENDANCE',
      entity_type: 'attendance_shift',
      entity_id: id,
      metadata: { name: shift.name, start_time: shift.start_time, end_time: shift.end_time },
    });
    return shift;
  } catch (error) {
    if (isUniqueViolation(error)) conflict(NAME_TAKEN);
    throw error;
  }
};

export const updateShift = async (
  id: number,
  input: UpdateShiftInput,
  userId: string,
  ip: string | null,
): Promise<ShiftView> => {
  const before = await loadShift(id);
  if (!before) return notFound('Turno no encontrado');

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown, cast = ''): void => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };
  if (input.name !== undefined) push('name', input.name);
  if (input.start_time !== undefined) push('start_time', input.start_time, '::time');
  if (input.end_time !== undefined) push('end_time', input.end_time, '::time');
  if (input.break_minutes !== undefined) push('break_minutes', input.break_minutes);
  if (input.shift_type !== undefined) push('shift_type', input.shift_type);
  if (input.color_hex !== undefined) push('color_hex', input.color_hex);
  if (input.is_active !== undefined) push('is_active', input.is_active);
  if (input.entry_before_min !== undefined) push('entry_before_min', input.entry_before_min);
  if (input.entry_after_min !== undefined) push('entry_after_min', input.entry_after_min);
  if (input.exit_before_min !== undefined) push('exit_before_min', input.exit_before_min);
  if (input.exit_after_min !== undefined) push('exit_after_min', input.exit_after_min);
  sets.push('updated_at = NOW()');
  params.push(id);

  try {
    await pool.query(`UPDATE attendance.shifts SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (error) {
    if (isUniqueViolation(error)) conflict(NAME_TAKEN);
    throw error;
  }

  const shift = (await loadShift(id)) as ShiftView;
  await registerAuditEvent({
    user_id: userId,
    action: 'ATTENDANCE_SHIFT_UPDATE',
    ip_address: ip,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_shift',
    entity_id: id,
    metadata: { before, after: shift },
  });

  const timingChanged =
    before.start_time !== shift.start_time ||
    before.end_time !== shift.end_time ||
    before.break_minutes !== shift.break_minutes ||
    before.shift_type !== shift.shift_type ||
    before.is_active !== shift.is_active ||
    before.entry_before_min !== shift.entry_before_min ||
    before.entry_after_min !== shift.entry_after_min ||
    before.exit_before_min !== shift.exit_before_min ||
    before.exit_after_min !== shift.exit_after_min;
  if (timingChanged) {
    void recalcEmployeesOfShift(id);
  }
  return shift;
};

/**
 * Elimina un turno solo si nunca se asigno: borrar uno con asignaciones arrastraria (ON DELETE CASCADE) la
 * programacion de los colaboradores y con ella el contexto de dias ya calculados. Esos turnos se desactivan.
 */
export const deleteShift = async (id: number, userId: string, ip: string | null): Promise<void> => {
  const before = await loadShift(id);
  if (!before) return notFound('Turno no encontrado');
  const used = await pool.query('SELECT 1 FROM attendance.shift_assignments WHERE shift_id = $1 LIMIT 1', [id]);
  if ((used.rowCount ?? 0) > 0) {
    conflict('El turno tiene asignaciones registradas y no se puede eliminar; desactívalo.');
  }
  await pool.query('DELETE FROM attendance.shifts WHERE id = $1', [id]);
  await registerAuditEvent({
    user_id: userId,
    action: 'ATTENDANCE_SHIFT_DELETE',
    ip_address: ip,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_shift',
    entity_id: id,
    metadata: { shift: before },
  });
};

/** Cambiar horas o estado de un turno afecta a quienes lo usan: recalcula sus ultimos 60 dias (best-effort). */
const recalcEmployeesOfShift = async (shiftId: number): Promise<void> => {
  try {
    const settings = await getAttendanceSettings();
    const today = todayInZone(settings.timezone);
    const { rows } = await pool.query<{ employee_id: number | string }>(
      `SELECT DISTINCT employee_id FROM attendance.shift_assignments
        WHERE shift_id = $1 AND (end_date IS NULL OR end_date >= $2::date)`,
      [shiftId, addDays(today, -60)],
    );
    await recalcAfterScheduleChange(
      rows.map((row) => ({ employeeId: Number(row.employee_id), from: addDays(today, -60), to: addDays(today, -1) })),
    );
  } catch (error) {
    console.error('[attendance] recalculo por cambio de turno fallo:', error);
  }
};
