import type { PoolClient } from 'pg';
import { withTransaction } from '../../utils/transaction';
import { registerAuditEvent } from '../audit.service';
import type { CreateAssignmentsInput, UpdateAssignmentInput } from '../../schemas/attendance/schedule.schema';
import { getAttendanceSettings } from './attendance-settings.service';
import { conflict, invalid, notFound } from './attendance-errors';
import { detectScheduleConflicts, summarizeConflicts, type ScheduleConflict } from './engine/conflicts';
import { assignmentApplies, isSingleDayAssignment, type EngineShift } from './engine/schedule';
import { addDays, type DateString, type WeekStart } from './engine/time';
import {
  ASSIGNMENT_COLUMNS,
  describeAssignment,
  loadAssignmentsByEmployee,
  loadShiftsMap,
  requireEnabledEmployees,
  singleDayWeekdays,
  toAssignmentRecord,
  type AssignmentRecord,
  type AssignmentRow,
} from './schedule-data.service';
import { insertScheduleChange } from './schedule-log.service';
import { recalcAfterScheduleChange, type RecalcRange } from './schedule-recalc';

/** Programacion: alta, edicion, baja y cierre de asignaciones de turno. */

export interface AuditContext {
  userId: string;
  ip: string | null;
}

export interface AssignmentView {
  id: number;
  employee_id: number;
  shift_id: number | null;
  is_rest_day: boolean;
  start_date: DateString;
  end_date: DateString | null;
  repeats_weekly: boolean;
  week_interval: number;
  weekdays: number[];
  notes: string | null;
}

export const toAssignmentView = (record: AssignmentRecord): AssignmentView => ({
  id: record.id,
  employee_id: record.employeeId,
  shift_id: record.shiftId,
  is_rest_day: record.shiftId === null,
  start_date: record.startDate,
  end_date: record.endDate,
  repeats_weekly: record.repeatsWeekly,
  week_interval: record.weekInterval,
  weekdays: record.weekdays,
  notes: record.notes,
});

const REST_NAME = 'Descanso';
const KEPT_NOTE = 'Conservado de la programacion recurrente';

const shiftName = (shifts: ReadonlyMap<number, EngineShift>, shiftId: number | null): string =>
  shiftId === null ? REST_NAME : (shifts.get(shiftId)?.name ?? `Turno ${shiftId}`);

const describeRecord = (record: AssignmentRecord, shifts: ReadonlyMap<number, EngineShift>): string => {
  const shift = record.shiftId === null ? undefined : shifts.get(record.shiftId);
  return describeAssignment({
    shiftName: shiftName(shifts, record.shiftId),
    startTime: shift?.startTime.slice(0, 5) ?? null,
    endTime: shift?.endTime.slice(0, 5) ?? null,
    startDate: record.startDate,
    endDate: record.endDate,
    repeatsWeekly: record.repeatsWeekly,
    weekInterval: record.weekInterval,
    weekdays: record.weekdays,
  });
};

const INSERT_SQL = `INSERT INTO attendance.shift_assignments
   (employee_id, shift_id, start_date, end_date, repeats_weekly, week_interval, weekdays, notes, created_by_user_id)
 VALUES ($1, $2, $3::date, $4::date, $5, $6, $7::smallint[], $8, $9)
 RETURNING ${ASSIGNMENT_COLUMNS.replace(/\ba\./g, '')}`;

const insertAssignment = async (db: PoolClient, record: AssignmentRecord, userId: string): Promise<AssignmentRecord> => {
  const { rows } = await db.query<AssignmentRow>(INSERT_SQL, [
    record.employeeId,
    record.shiftId,
    record.startDate,
    record.endDate,
    record.repeatsWeekly,
    record.weekInterval,
    record.weekdays,
    record.notes,
    userId,
  ]);
  return toAssignmentRecord(rows[0] as AssignmentRow);
};

/** Valida los turnos elegidos: existen y estan activos. */
const requireActiveShifts = (shifts: ReadonlyMap<number, EngineShift>, shiftIds: readonly number[]): void => {
  for (const shiftId of shiftIds) {
    const shift = shifts.get(shiftId);
    if (!shift) invalid(`El turno ${shiftId} no existe`);
    else if (!shift.isActive) invalid(`El turno «${shift.name}» esta inactivo`);
  }
};

export interface EmployeeConflict {
  employee_id: number;
  employee_name: string;
  summary: string;
  conflicts: ScheduleConflict[];
}

const throwEmployeeConflicts = (items: EmployeeConflict[]): never => {
  const first = items[0];
  const message =
    items.length === 1 && first
      ? `${first.employee_name}: ${first.summary}`
      : `Conflictos de horario en ${items.length} colaborador(es): ${items
          .slice(0, 3)
          .map((item) => `${item.employee_name} (${item.summary})`)
          .join(' | ')}`;
  return conflict(message, items);
};

/** Fechas normalizadas de una asignacion (dia suelto => fin = inicio). */
const normalizeDates = (
  repeatsWeekly: boolean,
  startDate: DateString,
  endDate: DateString | null,
  weekdays: number[],
): { endDate: DateString | null; weekdays: number[] } =>
  repeatsWeekly
    ? { endDate, weekdays }
    : { endDate: startDate, weekdays: singleDayWeekdays(startDate) };

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export const createAssignments = async (input: CreateAssignmentsInput, ctx: AuditContext) => {
  const settings = await getAttendanceSettings();
  const weekStart: WeekStart = settings.week_start;
  const dates = normalizeDates(input.repeats_weekly, input.start_date, input.end_date ?? null, input.weekdays ?? []);

  const { created, ranges } = await withTransaction(async (client) => {
    const employees = await requireEnabledEmployees(client, input.employee_ids);
    const shifts = await loadShiftsMap(client);
    requireActiveShifts(shifts, input.shift_ids);
    const existingByEmployee = await loadAssignmentsByEmployee(client, input.employee_ids);

    const wantedShiftIds: Array<number | null> = input.shift_ids.length > 0 ? input.shift_ids : [null];
    const pending: AssignmentRecord[] = [];
    const conflictItems: EmployeeConflict[] = [];
    let nextTempId = -1;

    for (const employeeId of input.employee_ids) {
      const list = [...(existingByEmployee.get(employeeId) ?? [])];
      const employeeConflicts: ScheduleConflict[] = [];

      // keep_existing: un dia suelto con programacion recurrente conserva esos tramos como sueltos
      if (input.keep_existing && !input.repeats_weekly) {
        const day = input.start_date;
        const applicable = list.filter((a) => assignmentApplies(a, day, weekStart));
        if (!applicable.some(isSingleDayAssignment)) {
          for (const recurring of applicable) {
            const copy: AssignmentRecord = {
              id: nextTempId--,
              employeeId,
              shiftId: recurring.shiftId,
              startDate: day,
              endDate: day,
              repeatsWeekly: false,
              weekInterval: 1,
              weekdays: singleDayWeekdays(day),
              notes: KEPT_NOTE,
            };
            list.push(copy);
            pending.push(copy);
          }
        }
      }

      for (const shiftId of wantedShiftIds) {
        const candidate: AssignmentRecord = {
          id: nextTempId--,
          employeeId,
          shiftId,
          startDate: input.start_date,
          endDate: dates.endDate,
          repeatsWeekly: input.repeats_weekly,
          weekInterval: input.repeats_weekly ? input.week_interval : 1,
          weekdays: dates.weekdays,
          notes: input.notes ?? null,
        };
        const found = detectScheduleConflicts({
          existing: list,
          candidate,
          shiftsById: shifts,
          maxShiftsPerDay: settings.max_shifts_per_day,
          weekStart,
        });
        if (found.length > 0) {
          employeeConflicts.push(...found);
          continue;
        }
        list.push(candidate);
        pending.push(candidate);
      }

      if (employeeConflicts.length > 0) {
        conflictItems.push({
          employee_id: employeeId,
          employee_name: employees.get(employeeId)?.full_name ?? String(employeeId),
          summary: summarizeConflicts(employeeConflicts),
          conflicts: employeeConflicts.slice(0, 50),
        });
      }
    }

    // Si algun colaborador tiene conflicto no se escribe nada
    if (conflictItems.length > 0) throwEmployeeConflicts(conflictItems);

    const saved: AssignmentRecord[] = [];
    for (const record of pending) {
      saved.push(await insertAssignment(client, record, ctx.userId));
    }

    for (const employeeId of input.employee_ids) {
      const mine = saved.filter((a) => a.employeeId === employeeId && a.notes !== KEPT_NOTE);
      const names = mine.map((a) => shiftName(shifts, a.shiftId)).join(' + ');
      const first = mine[0];
      if (!first) continue;
      const kept = saved.filter((a) => a.employeeId === employeeId).length - mine.length;
      const description =
        `Programo ${mine.map((a) => describeRecord(a, shifts)).join(' + ')}` +
        (kept > 0 ? ` (se conservaron ${kept} tramo(s) vigentes del dia)` : '') +
        (!input.repeats_weekly ? ' [reemplaza la programacion recurrente de ese dia]' : '');
      await insertScheduleChange(client, {
        employeeId,
        action: 'schedule',
        shiftName: names,
        description,
        startDate: first.startDate,
        endDate: first.endDate,
        repeatsWeekly: first.repeatsWeekly,
        weekdays: first.repeatsWeekly ? first.weekdays : null,
        userId: ctx.userId,
      });
    }

    return {
      created: saved.filter((a) => a.notes !== KEPT_NOTE),
      ranges: input.employee_ids.map<RecalcRange>((employeeId) => ({
        employeeId,
        from: input.start_date,
        to: dates.endDate,
      })),
    };
  });

  await recalcAfterScheduleChange(ranges);
  await registerAuditEvent({
    user_id: ctx.userId,
    action: 'ATTENDANCE_SCHEDULE_ASSIGN',
    ip_address: ctx.ip,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_shift_assignment',
    entity_id: created[0]?.id ?? null,
    metadata: {
      employee_ids: input.employee_ids,
      shift_ids: input.shift_ids,
      start_date: input.start_date,
      end_date: dates.endDate,
      repeats_weekly: input.repeats_weekly,
      created: created.length,
    },
  });
  return created.map(toAssignmentView);
};

// ---------------------------------------------------------------------------
// Edicion
// ---------------------------------------------------------------------------

const loadAssignmentForUpdate = async (client: PoolClient, id: number): Promise<AssignmentRecord> => {
  const { rows } = await client.query<AssignmentRow>(
    `SELECT ${ASSIGNMENT_COLUMNS} FROM attendance.shift_assignments a WHERE a.id = $1 FOR UPDATE`,
    [id],
  );
  const row = rows[0];
  if (!row) notFound('Asignacion no encontrada');
  return toAssignmentRecord(row as AssignmentRow);
};

export const updateAssignment = async (id: number, input: UpdateAssignmentInput, ctx: AuditContext) => {
  const settings = await getAttendanceSettings();
  const weekStart: WeekStart = settings.week_start;

  const { updated, ranges } = await withTransaction(async (client) => {
    const current = await loadAssignmentForUpdate(client, id);
    const shifts = await loadShiftsMap(client);

    const shiftId = input.shift_id !== undefined ? input.shift_id : current.shiftId;
    if (shiftId !== null && shiftId !== current.shiftId) requireActiveShifts(shifts, [shiftId]);
    const startDate = input.start_date ?? current.startDate;
    const repeatsWeekly = input.repeats_weekly ?? current.repeatsWeekly;
    const requestedEnd = input.end_date !== undefined ? input.end_date : current.endDate;
    const requestedWeekdays = input.weekdays ?? (current.weekdays.length > 0 ? current.weekdays : []);
    if (repeatsWeekly && requestedWeekdays.length === 0) invalid('Indica los dias de la semana en que se repite');
    if (requestedEnd !== null && requestedEnd < startDate) invalid('La fecha fin no puede ser anterior al inicio');
    const dates = normalizeDates(repeatsWeekly, startDate, requestedEnd, requestedWeekdays);

    const candidate: AssignmentRecord = {
      ...current,
      shiftId,
      startDate,
      endDate: dates.endDate,
      repeatsWeekly,
      weekInterval: repeatsWeekly ? (input.week_interval ?? current.weekInterval) : 1,
      weekdays: dates.weekdays,
      notes: input.notes !== undefined ? input.notes : current.notes,
    };

    // Si solo cambian las notas, la programacion efectiva no cambia: no hay nada que revalidar.
    const scheduleChanged =
      candidate.shiftId !== current.shiftId ||
      candidate.startDate !== current.startDate ||
      candidate.endDate !== current.endDate ||
      candidate.repeatsWeekly !== current.repeatsWeekly ||
      candidate.weekInterval !== current.weekInterval ||
      candidate.weekdays.join(',') !== current.weekdays.join(',');
    const existing = (await loadAssignmentsByEmployee(client, [current.employeeId])).get(current.employeeId) ?? [];
    const found = !scheduleChanged
      ? []
      : detectScheduleConflicts({
          existing,
          candidate,
          shiftsById: shifts,
          maxShiftsPerDay: settings.max_shifts_per_day,
          weekStart,
          ignoreAssignmentId: id,
        });
    if (found.length > 0) {
      const { rows: nameRows } = await client.query<{ full_name: string }>(
        'SELECT full_name FROM public.employees WHERE id = $1',
        [current.employeeId],
      );
      throwEmployeeConflicts([
        {
          employee_id: current.employeeId,
          employee_name: nameRows[0]?.full_name ?? String(current.employeeId),
          summary: summarizeConflicts(found),
          conflicts: found.slice(0, 50),
        },
      ]);
    }

    const { rows } = await client.query<AssignmentRow>(
      `UPDATE attendance.shift_assignments a
          SET shift_id = $2, start_date = $3::date, end_date = $4::date, repeats_weekly = $5,
              week_interval = $6, weekdays = $7::smallint[], notes = $8, updated_at = NOW()
        WHERE a.id = $1
        RETURNING ${ASSIGNMENT_COLUMNS}`,
      [
        id,
        candidate.shiftId,
        candidate.startDate,
        candidate.endDate,
        candidate.repeatsWeekly,
        candidate.weekInterval,
        candidate.weekdays,
        candidate.notes,
      ],
    );
    const saved = toAssignmentRecord(rows[0] as AssignmentRow);

    await insertScheduleChange(client, {
      employeeId: saved.employeeId,
      action: 'edit',
      shiftName: shiftName(shifts, saved.shiftId),
      description: `Edito: ${describeRecord(current, shifts)} -> ${describeRecord(saved, shifts)}`,
      startDate: saved.startDate,
      endDate: saved.endDate,
      repeatsWeekly: saved.repeatsWeekly,
      weekdays: saved.repeatsWeekly ? saved.weekdays : null,
      userId: ctx.userId,
    });

    return {
      updated: saved,
      ranges: [
        { employeeId: saved.employeeId, from: current.startDate < saved.startDate ? current.startDate : saved.startDate, to: laterEnd(current.endDate, saved.endDate) },
      ] as RecalcRange[],
    };
  });

  await recalcAfterScheduleChange(ranges);
  await registerAuditEvent({
    user_id: ctx.userId,
    action: 'ATTENDANCE_SCHEDULE_EDIT',
    ip_address: ctx.ip,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_shift_assignment',
    entity_id: updated.id,
    employee_id: updated.employeeId,
    metadata: { shift_id: updated.shiftId, start_date: updated.startDate, end_date: updated.endDate },
  });
  return toAssignmentView(updated);
};

/** Fin mas tardio de dos (null = sin fin gana). */
const laterEnd = (a: DateString | null, b: DateString | null): DateString | null => {
  if (a === null || b === null) return null;
  return a > b ? a : b;
};

// ---------------------------------------------------------------------------
// Baja / cierre
// ---------------------------------------------------------------------------

export interface RemoveAssignmentResult {
  action: 'end' | 'remove' | 'mixed';
  ended_ids: number[];
  removed_ids: number[];
}

export const removeAssignment = async (
  id: number,
  options: { date?: DateString | undefined; fromDateOnly: boolean },
  ctx: AuditContext,
): Promise<RemoveAssignmentResult> => {
  const settings = await getAttendanceSettings();
  const weekStart: WeekStart = settings.week_start;

  const { result, ranges } = await withTransaction(async (client) => {
    const target = await loadAssignmentForUpdate(client, id);
    const shifts = await loadShiftsMap(client);
    const date = options.date ?? target.startDate;

    // Todas las asignaciones del mismo colaborador y turno que aplican ese dia (el calendario las funde)
    const all = (await loadAssignmentsByEmployee(client, [target.employeeId])).get(target.employeeId) ?? [];
    const affected = all.filter(
      (a) => a.id === target.id || (a.shiftId === target.shiftId && assignmentApplies(a, date, weekStart)),
    );

    const endedIds: number[] = [];
    const removedIds: number[] = [];
    const ranges: RecalcRange[] = [];

    for (const record of affected) {
      const shouldEnd = options.fromDateOnly && date > record.startDate;
      if (shouldEnd) {
        const newEnd = addDays(date, -1);
        await client.query(
          'UPDATE attendance.shift_assignments SET end_date = $2::date, updated_at = NOW() WHERE id = $1',
          [record.id, newEnd],
        );
        endedIds.push(record.id);
        await insertScheduleChange(client, {
          employeeId: record.employeeId,
          action: 'end',
          shiftName: shiftName(shifts, record.shiftId),
          description: `Termino ${describeRecord(record, shifts)} a partir del ${date} (fin: ${newEnd})`,
          startDate: record.startDate,
          endDate: newEnd,
          repeatsWeekly: record.repeatsWeekly,
          weekdays: record.repeatsWeekly ? record.weekdays : null,
          userId: ctx.userId,
        });
        ranges.push({ employeeId: record.employeeId, from: date, to: record.endDate });
      } else {
        await client.query('DELETE FROM attendance.shift_assignments WHERE id = $1', [record.id]);
        removedIds.push(record.id);
        await insertScheduleChange(client, {
          employeeId: record.employeeId,
          action: 'remove',
          shiftName: shiftName(shifts, record.shiftId),
          description: `Elimino ${describeRecord(record, shifts)}`,
          startDate: record.startDate,
          endDate: record.endDate,
          repeatsWeekly: record.repeatsWeekly,
          weekdays: record.repeatsWeekly ? record.weekdays : null,
          userId: ctx.userId,
        });
        ranges.push({ employeeId: record.employeeId, from: record.startDate, to: record.endDate });
      }
    }

    const action: RemoveAssignmentResult['action'] =
      endedIds.length > 0 && removedIds.length > 0 ? 'mixed' : endedIds.length > 0 ? 'end' : 'remove';
    return {
      result: { action, ended_ids: endedIds, removed_ids: removedIds } satisfies RemoveAssignmentResult,
      ranges: ranges.map((r) => ({ ...r, employeeId: target.employeeId })),
    };
  });

  await recalcAfterScheduleChange(ranges);
  await registerAuditEvent({
    user_id: ctx.userId,
    action: result.action === 'end' ? 'ATTENDANCE_SCHEDULE_END' : 'ATTENDANCE_SCHEDULE_REMOVE',
    ip_address: ctx.ip,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_shift_assignment',
    entity_id: id,
    metadata: { ...result, date: options.date ?? null, from_date_only: options.fromDateOnly },
  });
  return result;
};
