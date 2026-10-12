import { normalizePunches, pairPunches, type DayResult, type EnginePunch } from './day-calculator';
import { hasScheduleOn, resolveDay, type DayPlan, type DaySegment, type EngineAssignment, type EngineShift } from './schedule';
import type { AttendanceSettings } from './settings';
import { MS_PER_MINUTE, dateToLocalMs, type DateString, type LocalMs } from './time';

/**
 * Estado de un colaborador "en vivo" (tablero Hoy). PURO: no persiste nada.
 * Usa resolveDay / hasScheduleOn del motor para la programacion del dia.
 */

export type LiveStatus =
  | 'present' | 'left' | 'late' | 'upcoming' | 'missing' | 'incident' | 'rest' | 'no_schedule';

export interface LiveInput {
  workDate: DateString;
  assignments: readonly EngineAssignment[];
  shiftsById: ReadonlyMap<number, EngineShift>;
  isHoliday: boolean;
  /** Hay incidencia autorizada de dia completo hoy. */
  hasFullDayIncident: boolean;
  /** Checadas (hora local de pared) del dia laboral; las rechazadas se ignoran. */
  punches: readonly EnginePunch[];
  nowLocal: LocalMs;
  settings: AttendanceSettings;
}

export interface LiveState {
  status: LiveStatus;
  /** Minutos desde la medianoche del tramo en curso (o el proximo). */
  expectedStartMinute: number | null;
  expectedEndMinute: number | null;
  clockIn: LocalMs | null;
  clockOut: LocalMs | null;
  lateMinutes: number;
  hasPendingReview: boolean;
}

/** Minutos antes del inicio del tramo desde los que ya se aceptan checadas. */
export const EARLY_PUNCH_MINUTES = 60;

const emptyState = (status: LiveStatus, hasPendingReview = false): LiveState => ({
  status,
  expectedStartMinute: null,
  expectedEndMinute: null,
  clockIn: null,
  clockOut: null,
  lateMinutes: 0,
  hasPendingReview,
});

/** Tramo en curso: el ultimo cuyo inicio ya paso; si ninguno, el primero. */
const currentSegment = (segments: readonly DaySegment[], nowMinute: number): DaySegment | null => {
  let found: DaySegment | null = null;
  for (const segment of segments) {
    if (segment.startMinute <= nowMinute) found = segment;
  }
  return found ?? segments[0] ?? null;
};

export const liveStatus = (input: LiveInput): LiveState => {
  const { settings } = input;
  const punches = normalizePunches(input.punches, settings.punch_debounce_seconds);
  const hasPendingReview = punches.some((punch) => punch.reviewStatus === 'pending');

  if (input.hasFullDayIncident) return emptyState('incident', hasPendingReview);
  if (!hasScheduleOn(input.assignments, input.workDate)) return emptyState('no_schedule', hasPendingReview);

  const plan: DayPlan = resolveDay(input.assignments, input.shiftsById, input.workDate, settings.week_start);
  const midnight = dateToLocalMs(input.workDate);

  if (input.isHoliday || plan.segments.length === 0) {
    if (!input.isHoliday && !plan.isRestDay) return emptyState('no_schedule', hasPendingReview);
    const overall = pairPunches(punches);
    if (!overall.entry) return emptyState('rest', hasPendingReview);
    return {
      ...emptyState(overall.exit ? 'left' : 'present', hasPendingReview),
      clockIn: overall.entry.at,
      clockOut: overall.exit?.at ?? null,
    };
  }

  const nowMinute = (input.nowLocal - midnight) / MS_PER_MINUTE;
  const segment = currentSegment(plan.segments, nowMinute);
  if (!segment) return emptyState('no_schedule', hasPendingReview);

  const expectedStart = midnight + segment.startMinute * MS_PER_MINUTE;
  const earliest = expectedStart - EARLY_PUNCH_MINUTES * MS_PER_MINUTE;
  const pair = pairPunches(punches.filter((punch) => punch.at >= earliest));
  const base = {
    expectedStartMinute: segment.startMinute,
    expectedEndMinute: segment.endMinute,
    hasPendingReview,
  };

  if (pair.entry) {
    const rawLate = segment.flexible ? 0 : Math.max(0, Math.round((pair.entry.at - expectedStart) / MS_PER_MINUTE));
    const isLate = rawLate > settings.tolerance_min;
    const status: LiveStatus = pair.exit ? 'left' : isLate ? 'late' : 'present';
    return {
      ...base,
      status,
      clockIn: pair.entry.at,
      clockOut: pair.exit?.at ?? null,
      lateMinutes: isLate ? rawLate : 0,
    };
  }

  const overdue = Math.round((input.nowLocal - expectedStart) / MS_PER_MINUTE) > settings.late_until_min;
  return { ...base, status: overdue ? 'missing' : 'upcoming', clockIn: null, clockOut: null, lateMinutes: 0 };
};

/** Estado equivalente para una fecha pasada, a partir del resultado ya calculado. */
export const statusFromDailyResult = (dayResult: DayResult | null, hasClockOut: boolean): LiveStatus => {
  switch (dayResult) {
    case null:
    case 'no_schedule':
      return 'no_schedule';
    case 'late':
      return 'late';
    case 'present':
    case 'early_departure':
      return hasClockOut ? 'left' : 'present';
    case 'absent':
    case 'partial_absence':
      return 'missing';
    case 'incident':
      return 'incident';
    case 'rest_day':
    case 'holiday':
      return 'rest';
  }
};

/** Orden de presentacion de los estados en el tablero. */
export const LIVE_STATUS_ORDER: readonly LiveStatus[] = [
  'late', 'missing', 'present', 'upcoming', 'left', 'incident', 'rest', 'no_schedule',
];
