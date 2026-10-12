import { withTransaction } from '../../utils/transaction';
import { registerAuditEvent } from '../audit.service';
import type { CopyScheduleInput } from '../../schemas/attendance/schedule.schema';
import { getAttendanceSettings } from './attendance-settings.service';
import { invalid } from './attendance-errors';
import { detectScheduleConflicts } from './engine/conflicts';
import { isSingleDayAssignment, resolveDay, type DayPlan } from './engine/schedule';
import { addDays, startOfWeek, type DateString } from './engine/time';
import {
  loadAssignmentsByEmployee,
  loadShiftsMap,
  requireEnabledEmployees,
  singleDayWeekdays,
  type AssignmentRecord,
} from './schedule-data.service';
import { insertScheduleChange } from './schedule-log.service';
import { recalcAfterScheduleChange } from './schedule-recalc';
import type { AuditContext } from './shift-assignments.service';

/** Copiar horario: una semana como DIAS SUELTOS hacia otras semanas u otros colaboradores. */

const MAX_DETAIL = 5;
const COPY_NOTE = 'Copiado de otra semana';

export interface CopyDetail {
  employee_id: number;
  date: DateString;
  reason: 'existing' | 'conflict';
  message: string;
}

export interface CopyResult {
  created: number;
  assignments_created: number;
  skipped_existing: number;
  skipped_conflict: number;
  detail: CopyDetail[];
}

export const copySchedule = async (input: CopyScheduleInput, ctx: AuditContext): Promise<CopyResult> => {
  const settings = await getAttendanceSettings();
  const weekStart = settings.week_start;
  const sourceWeek = startOfWeek(input.source_date, weekStart);

  const targets = input.target_employee_ids.length > 0 ? input.target_employee_ids : [input.source_employee_id];
  const allIds = [...new Set([input.source_employee_id, ...targets])];

  const outcome = await withTransaction(async (client) => {
    const employees = await requireEnabledEmployees(client, allIds);
    const shifts = await loadShiftsMap(client);
    const byEmployee = await loadAssignmentsByEmployee(client, allIds);

    // Dias de la semana origen (se resuelven una sola vez, antes de modificar nada)
    const sourceAssignments = byEmployee.get(input.source_employee_id) ?? [];
    const sourceDays: Array<{ index: number; plan: DayPlan }> = [];
    for (let index = 0; index < 7; index += 1) {
      const plan = resolveDay(sourceAssignments, shifts, addDays(sourceWeek, index), weekStart);
      if (plan.segments.length > 0 || plan.isRestDay) sourceDays.push({ index, plan });
    }
    if (sourceDays.length === 0) invalid('El colaborador origen no tiene horario en esa semana');

    const result: CopyResult = { created: 0, assignments_created: 0, skipped_existing: 0, skipped_conflict: 0, detail: [] };
    const note = (detail: CopyDetail): void => {
      if (result.detail.length < MAX_DETAIL) result.detail.push(detail);
    };
    let nextTempId = -1;
    const sourceName = employees.get(input.source_employee_id)?.full_name ?? String(input.source_employee_id);

    const toInsert: AssignmentRecord[] = [];
    const toDelete: number[] = [];
    const touched = new Map<number, { first: DateString; last: DateString; days: number }>();

    for (const employeeId of targets) {
      let list = [...(byEmployee.get(employeeId) ?? [])];
      const sameWeekOnly = input.same_week && employeeId !== input.source_employee_id;
      const offsets = sameWeekOnly ? [0] : Array.from({ length: input.weeks }, (_, i) => i + 1);

      for (const offset of offsets) {
        for (const { index, plan } of sourceDays) {
          const date = addDays(sourceWeek, offset * 7 + index);
          const current = resolveDay(list, shifts, date, weekStart);
          const occupied = current.segments.length > 0 || current.isRestDay;

          if (occupied && !input.replace) {
            result.skipped_existing += 1;
            note({ employee_id: employeeId, date, reason: 'existing', message: 'El dia ya tiene programacion' });
            continue;
          }

          // replace: se retiran los dias sueltos de esa fecha
          const removed = occupied
            ? list.filter((a) => isSingleDayAssignment(a) && a.startDate === date)
            : [];
          let working = list.filter((a) => !removed.includes(a));

          const shiftIds: Array<number | null> = plan.isRestDay ? [null] : plan.segments.map((s) => s.shiftId);
          const added: AssignmentRecord[] = [];
          let firstConflict: string | null = null;
          for (const shiftId of shiftIds) {
            const candidate: AssignmentRecord = {
              id: nextTempId--,
              employeeId,
              shiftId,
              startDate: date,
              endDate: date,
              repeatsWeekly: false,
              weekInterval: 1,
              weekdays: singleDayWeekdays(date),
              notes: COPY_NOTE,
            };
            const found = detectScheduleConflicts({
              existing: working,
              candidate,
              shiftsById: shifts,
              maxShiftsPerDay: settings.max_shifts_per_day,
              weekStart,
            });
            if (found.length > 0) {
              firstConflict = found[0]?.message ?? 'Conflicto de horario';
              break;
            }
            working = [...working, candidate];
            added.push(candidate);
          }

          if (firstConflict !== null) {
            result.skipped_conflict += 1;
            note({ employee_id: employeeId, date, reason: 'conflict', message: firstConflict });
            continue;
          }

          list = working;
          toInsert.push(...added);
          toDelete.push(...removed.filter((a) => a.id > 0).map((a) => a.id));
          result.created += 1;
          result.assignments_created += added.length;
          const previous = touched.get(employeeId);
          touched.set(employeeId, {
            first: previous && previous.first < date ? previous.first : date,
            last: previous && previous.last > date ? previous.last : date,
            days: (previous?.days ?? 0) + 1,
          });
        }
      }
    }

    if (toDelete.length > 0) {
      await client.query('DELETE FROM attendance.shift_assignments WHERE id = ANY($1::bigint[])', [toDelete]);
    }
    if (toInsert.length > 0) {
      await client.query(
        `INSERT INTO attendance.shift_assignments
           (employee_id, shift_id, start_date, end_date, repeats_weekly, week_interval, weekdays, notes, created_by_user_id)
         SELECT t.employee_id, t.shift_id, t.day, t.day, FALSE, 1, ARRAY[EXTRACT(ISODOW FROM t.day)::smallint], $4, $5
           FROM unnest($1::bigint[], $2::bigint[], $3::date[]) AS t(employee_id, shift_id, day)`,
        [
          toInsert.map((a) => a.employeeId),
          toInsert.map((a) => a.shiftId),
          toInsert.map((a) => a.startDate),
          COPY_NOTE,
          ctx.userId,
        ],
      );
    }

    for (const [employeeId, info] of touched) {
      await insertScheduleChange(client, {
        employeeId,
        action: 'copy',
        shiftName: null,
        description:
          `Copio el horario de ${sourceName} (semana del ${sourceWeek}) como dias sueltos: ` +
          `${info.days} dia(s) entre ${info.first} y ${info.last}` +
          (input.replace ? ' (reemplazando dias sueltos)' : ''),
        startDate: info.first,
        endDate: info.last,
        repeatsWeekly: false,
        weekdays: null,
        userId: ctx.userId,
      });
    }

    return { result, touched };
  });

  await recalcAfterScheduleChange(
    [...outcome.touched].map(([employeeId, info]) => ({ employeeId, from: info.first, to: info.last })),
  );
  await registerAuditEvent({
    user_id: ctx.userId,
    action: 'ATTENDANCE_SCHEDULE_COPY',
    ip_address: ctx.ip,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_shift_assignment',
    entity_id: null,
    employee_id: input.source_employee_id,
    metadata: {
      source_employee_id: input.source_employee_id,
      source_week: sourceWeek,
      target_employee_ids: targets,
      weeks: input.weeks,
      same_week: input.same_week,
      replace: input.replace,
      created: outcome.result.created,
      skipped_existing: outcome.result.skipped_existing,
      skipped_conflict: outcome.result.skipped_conflict,
    },
  });
  return outcome.result;
};
