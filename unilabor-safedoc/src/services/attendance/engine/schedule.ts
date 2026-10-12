import {
  addDays,
  daysBetween,
  isoWeekday,
  startOfWeek,
  timeToMinutes,
  type DateString,
  type WeekStart,
} from './time';

/**
 * Resolucion de la programacion de un colaborador para una fecha. PURO.
 *
 * Reglas:
 *  - Si hay asignaciones de DIA SUELTO vigentes ese dia, solo valen esas; si no,
 *    valen las recurrentes.
 *  - Una asignacion sin turno (shiftId null) es DESCANSO y anula los turnos.
 *  - Varios turnos el mismo dia forman una jornada partida (tramos ordenados).
 */

export interface EngineShift {
  id: number;
  name: string;
  /** 'HH:MM' o 'HH:MM:SS'. */
  startTime: string;
  endTime: string;
  breakMinutes: number;
  flexible: boolean;
  isActive: boolean;
}

export interface EngineAssignment {
  id: number;
  /** null = dia de descanso. */
  shiftId: number | null;
  startDate: DateString;
  /** null = sin fin. */
  endDate: DateString | null;
  repeatsWeekly: boolean;
  weekInterval: number;
  /** ISO: 1 = lunes ... 7 = domingo. */
  weekdays: number[];
}

/** Tramo de una jornada. Los minutos son desde la medianoche del dia laboral; el fin puede pasar de 1440. */
export interface DaySegment {
  shiftId: number;
  name: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  flexible: boolean;
  crossesMidnight: boolean;
}

export interface DayPlan {
  segments: DaySegment[];
  isRestDay: boolean;
  /** Ids de las asignaciones que determinaron el dia (para trazabilidad). */
  assignmentIds: number[];
}

export const isSingleDayAssignment = (assignment: EngineAssignment): boolean =>
  !assignment.repeatsWeekly && assignment.endDate === assignment.startDate;

export const assignmentApplies = (
  assignment: EngineAssignment,
  date: DateString,
  weekStart: WeekStart,
): boolean => {
  if (date < assignment.startDate) return false;
  if (assignment.endDate !== null && date > assignment.endDate) return false;
  if (!assignment.repeatsWeekly) return true;
  if (!assignment.weekdays.includes(isoWeekday(date))) return false;

  const interval = Math.max(1, assignment.weekInterval);
  const weeksBetween = Math.round(
    daysBetween(startOfWeek(assignment.startDate, weekStart), startOfWeek(date, weekStart)) / 7,
  );
  return weeksBetween % interval === 0;
};

export const segmentFromShift = (shift: EngineShift): DaySegment => {
  const startMinute = timeToMinutes(shift.startTime);
  let endMinute = timeToMinutes(shift.endTime);
  const crossesMidnight = endMinute <= startMinute;
  if (crossesMidnight) {
    endMinute += 1440;
  }
  return {
    shiftId: shift.id,
    name: shift.name,
    startMinute,
    endMinute,
    breakMinutes: shift.breakMinutes,
    flexible: shift.flexible,
    crossesMidnight,
  };
};

export const resolveDay = (
  assignments: readonly EngineAssignment[],
  shiftsById: ReadonlyMap<number, EngineShift>,
  date: DateString,
  weekStart: WeekStart,
): DayPlan => {
  const applicable = assignments.filter((assignment) => assignmentApplies(assignment, date, weekStart));
  const singleDay = applicable.filter(isSingleDayAssignment);
  const effective = singleDay.length > 0 ? singleDay : applicable;

  if (effective.length === 0) {
    return { segments: [], isRestDay: false, assignmentIds: [] };
  }

  const assignmentIds = effective.map((assignment) => assignment.id);

  if (effective.some((assignment) => assignment.shiftId === null)) {
    return { segments: [], isRestDay: true, assignmentIds };
  }

  const seen = new Set<number>();
  const segments: DaySegment[] = [];
  for (const assignment of effective) {
    const shiftId = assignment.shiftId;
    if (shiftId === null || seen.has(shiftId)) continue;
    const shift = shiftsById.get(shiftId);
    if (!shift || !shift.isActive) continue;
    seen.add(shiftId);
    segments.push(segmentFromShift(shift));
  }
  segments.sort((a, b) => a.startMinute - b.startMinute);

  return { segments, isRestDay: false, assignmentIds };
};

/**
 * El colaborador "tiene horario" si alguna asignacion con turno ya inicio y no
 * termino hace mas de `lookbackDays` dias. Evita calificar como falta a quien
 * nunca fue programado (resultado `no_schedule`).
 */
export const hasScheduleOn = (
  assignments: readonly EngineAssignment[],
  date: DateString,
  lookbackDays = 60,
): boolean => {
  const floor = addDays(date, -lookbackDays);
  return assignments.some(
    (assignment) =>
      assignment.shiftId !== null &&
      assignment.startDate <= date &&
      (assignment.endDate === null || assignment.endDate >= floor),
  );
};

export const segmentHours = (segment: DaySegment): number =>
  Math.max(0, (segment.endMinute - segment.startMinute - segment.breakMinutes) / 60);

export const segmentsOverlap = (a: DaySegment, b: DaySegment): boolean =>
  a.startMinute < b.endMinute && b.startMinute < a.endMinute;
