import {
  assignmentApplies,
  isSingleDayAssignment,
  resolveDay,
  segmentFromShift,
  segmentsOverlap,
  type DaySegment,
  type EngineAssignment,
  type EngineShift,
} from './schedule';
import { addDays, isoWeekday, type DateString, type WeekStart } from './time';

/**
 * Detector de conflictos al programar. PURO: simula dia por dia la asignacion
 * nueva (o editada) contra la programacion existente del colaborador.
 *
 * Reglas:
 *  - Una asignacion de DIA SUELTO solo compite con otros dias sueltos (porque
 *    reemplaza a las recurrentes ese dia). Una recurrente compite con lo que
 *    ese dia ya resuelve.
 *  - Turno nuevo sobre dia de descanso / descanso nuevo sobre dia con turnos.
 *  - Mismo turno repetido y mas de `maxShiftsPerDay` turnos distintos.
 *  - Traslape de tramos, incluido contra el dia vecino (turnos nocturnos).
 */

export interface ScheduleConflict {
  date: DateString;
  message: string;
}

export interface ConflictCheckInput {
  /** Asignaciones existentes del colaborador (puede incluir la que se edita). */
  existing: readonly EngineAssignment[];
  /** Asignacion nueva o editada (shiftId null = descanso). */
  candidate: EngineAssignment;
  shiftsById: ReadonlyMap<number, EngineShift>;
  maxShiftsPerDay: number;
  weekStart: WeekStart;
  /** Id de la asignacion que se edita: se ignora en `existing`. */
  ignoreAssignmentId?: number | null;
  /** Dias maximos a simular desde el inicio (default 366). */
  horizonDays?: number;
}

export const DEFAULT_CONFLICT_HORIZON_DAYS = 366;

const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'lun 12 oct' (sin acentos). */
export const formatDateShort = (date: DateString): string => {
  const [, month, day] = date.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAY_SHORT[isoWeekday(date) % 7] ?? '';
  return `${weekday} ${day} ${MONTH_SHORT[month - 1] ?? ''}`;
};

const formatRange = (shift: EngineShift): string => `${shift.startTime.slice(0, 5)}-${shift.endTime.slice(0, 5)}`;

const describeShift = (shift: EngineShift): string => `«${shift.name}» ${formatRange(shift)}`;

interface Piece {
  shift: EngineShift;
  segment: DaySegment;
}

const pieceOf = (shift: EngineShift, offsetMinutes = 0): Piece => {
  const base = segmentFromShift(shift);
  return {
    shift,
    segment: { ...base, startMinute: base.startMinute + offsetMinutes, endMinute: base.endMinute + offsetMinutes },
  };
};

/** Tramos resueltos de un dia vecino, desplazados para compararlos con el dia evaluado. */
const neighbourPieces = (
  existing: readonly EngineAssignment[],
  shiftsById: ReadonlyMap<number, EngineShift>,
  date: DateString,
  weekStart: WeekStart,
  offsetMinutes: number,
): Piece[] => {
  const plan = resolveDay(existing, shiftsById, date, weekStart);
  const pieces: Piece[] = [];
  for (const segment of plan.segments) {
    const shift = shiftsById.get(segment.shiftId);
    if (shift) pieces.push(pieceOf(shift, offsetMinutes));
  }
  return pieces;
};

/** Asignaciones que ya determinan el dia (lo que competira con la candidata). */
const competingAssignments = (
  existing: readonly EngineAssignment[],
  candidate: EngineAssignment,
  date: DateString,
  weekStart: WeekStart,
): EngineAssignment[] => {
  const applicable = existing.filter((assignment) => assignmentApplies(assignment, date, weekStart));
  const singles = applicable.filter(isSingleDayAssignment);
  if (isSingleDayAssignment(candidate)) return singles;
  return singles.length > 0 ? singles : applicable;
};

const checkDay = (
  input: ConflictCheckInput,
  existing: readonly EngineAssignment[],
  date: DateString,
): string[] => {
  const { candidate, shiftsById, weekStart, maxShiftsPerDay } = input;
  const others = competingAssignments(existing, candidate, date, weekStart);
  const messages: string[] = [];
  const candidateShift = candidate.shiftId === null ? null : (shiftsById.get(candidate.shiftId) ?? null);

  const othersHaveRest = others.some((assignment) => assignment.shiftId === null);
  const otherShiftIds = [
    ...new Set(others.flatMap((assignment) => (assignment.shiftId === null ? [] : [assignment.shiftId]))),
  ];

  // Descanso nuevo
  if (candidate.shiftId === null) {
    if (othersHaveRest) messages.push('El dia ya esta marcado como descanso');
    if (otherShiftIds.length > 0) {
      messages.push('El dia ya tiene turnos programados: elimina primero los turnos para marcarlo como descanso');
    }
    return messages;
  }

  // Turno nuevo
  if (othersHaveRest) {
    messages.push('El dia ya esta marcado como descanso: no se puede agregar un turno');
    return messages;
  }

  if (otherShiftIds.includes(candidate.shiftId)) {
    messages.push(
      candidateShift
        ? `El turno «${candidateShift.name}» ya esta programado ese dia`
        : 'El turno ya esta programado ese dia',
    );
    return messages;
  }

  if (otherShiftIds.length + 1 > maxShiftsPerDay) {
    messages.push(`Se excede el maximo de ${maxShiftsPerDay} turno(s) por dia`);
  }

  if (!candidateShift) return messages;

  const mine = pieceOf(candidateShift);
  const sameDay: Piece[] = [];
  for (const shiftId of otherShiftIds) {
    const shift = shiftsById.get(shiftId);
    // Un turno inactivo no cuenta en el calculo, por lo que no compite
    if (shift?.isActive) sameDay.push(pieceOf(shift));
  }
  for (const other of sameDay) {
    if (segmentsOverlap(mine.segment, other.segment)) {
      messages.push(`${describeShift(candidateShift)} se encima con ${describeShift(other.shift)}`);
    }
  }

  // Dia vecino: turnos nocturnos del dia anterior (-1440) y siguiente (+1440)
  const previous = neighbourPieces(existing, shiftsById, addDays(date, -1), weekStart, -1440);
  for (const other of previous) {
    if (segmentsOverlap(mine.segment, other.segment)) {
      messages.push(`${describeShift(candidateShift)} se encima con ${describeShift(other.shift)} del dia anterior`);
    }
  }
  const next = neighbourPieces(existing, shiftsById, addDays(date, 1), weekStart, 1440);
  for (const other of next) {
    if (segmentsOverlap(mine.segment, other.segment)) {
      messages.push(`${describeShift(candidateShift)} se encima con ${describeShift(other.shift)} del dia siguiente`);
    }
  }

  return messages;
};

export const detectScheduleConflicts = (input: ConflictCheckInput): ScheduleConflict[] => {
  const { candidate, ignoreAssignmentId } = input;
  const ignored = ignoreAssignmentId ?? null;
  const existing = input.existing.filter(
    (assignment) => assignment.id !== candidate.id && (ignored === null || assignment.id !== ignored),
  );

  const horizon = Math.max(1, input.horizonDays ?? DEFAULT_CONFLICT_HORIZON_DAYS);
  const horizonEnd = addDays(candidate.startDate, horizon - 1);
  const lastDate =
    candidate.endDate !== null && candidate.endDate < horizonEnd ? candidate.endDate : horizonEnd;

  const conflicts: ScheduleConflict[] = [];
  for (let date = candidate.startDate; date <= lastDate; date = addDays(date, 1)) {
    if (!assignmentApplies(candidate, date, input.weekStart)) continue;
    for (const message of checkDay(input, existing, date)) {
      conflicts.push({ date, message });
    }
  }
  return conflicts;
};

/** Resumen legible: "horario incoherente en N dia(s) — lun 12 oct: ...". Muestra hasta 3 dias. */
export const summarizeConflicts = (conflicts: readonly ScheduleConflict[], maxDays = 3): string => {
  if (conflicts.length === 0) return '';
  const byDate = new Map<DateString, string[]>();
  for (const conflict of conflicts) {
    const list = byDate.get(conflict.date) ?? [];
    list.push(conflict.message);
    byDate.set(conflict.date, list);
  }
  const days = [...byDate.entries()];
  const shown = days
    .slice(0, maxDays)
    .map(([date, messages]) => `${formatDateShort(date)}: ${messages.join('; ')}`);
  const extra = days.length > maxDays ? ` (y ${days.length - maxDays} dia(s) mas)` : '';
  return `horario incoherente en ${days.length} dia(s) — ${shown.join(' | ')}${extra}`;
};
