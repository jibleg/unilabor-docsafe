import type { AttendanceSettings } from './settings';
import { segmentHours, type DayPlan, type DaySegment } from './schedule';
import {
  MS_PER_HOUR,
  MS_PER_MINUTE,
  dateToLocalMs,
  roundTo,
  timeToMinutes,
  type DateString,
  type LocalMs,
} from './time';

/**
 * Calculo del resultado de UN dia para UN colaborador. PURO y deterministico:
 * mismas entradas => mismo resultado, de modo que el recalculo es idempotente.
 */

export type DayResult =
  | 'present'
  | 'late'
  | 'absent'
  | 'partial_absence'
  | 'early_departure'
  | 'incident'
  | 'rest_day'
  | 'holiday'
  | 'no_schedule';

export type PunchType = 'in' | 'out' | 'break_start' | 'break_end';
export type ReviewStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface EnginePunch {
  /** Referencia opaca (id de la checada) para devolver cual fue entrada/salida. */
  ref: number;
  at: LocalMs;
  type: PunchType | null;
  reviewStatus: ReviewStatus;
}

export interface FullDayIncident {
  id: number;
  code: string;
  countsAsAttendance: boolean;
}

export interface DayInput {
  workDate: DateString;
  plan: DayPlan;
  hasSchedule: boolean;
  isHoliday: boolean;
  /** Checadas ya dentro de la ventana del dia (ver `dayWindow`). */
  punches: readonly EnginePunch[];
  fullDayIncident: FullDayIncident | null;
  /** Horas extra autorizadas por incidencias de tipo horas para este dia. */
  authorizedOvertimeHours: number;
  settings: AttendanceSettings;
}

export interface SegmentDetail {
  shiftId: number;
  name: string;
  expectedStart: string;
  expectedEnd: string;
  clockInRef: number | null;
  clockOutRef: number | null;
  clockInAt: LocalMs | null;
  clockOutAt: LocalMs | null;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  hours: number | null;
  hasPunches: boolean;
}

export interface DayCalculation {
  workDate: DateString;
  dayResult: DayResult;
  /** Primer segmento esperado (para mostrar). */
  expectedStartMinute: number | null;
  expectedEndMinute: number | null;
  clockInRef: number | null;
  clockOutRef: number | null;
  clockInAt: LocalMs | null;
  clockOutAt: LocalMs | null;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  workedHours: number | null;
  overtimeHours: number;
  incidentId: number | null;
  hasPendingReview: boolean;
  /** Motivo legible del resultado, util para depurar y mostrar. */
  reason: string;
  segments: SegmentDetail[];
}

export interface DayWindow {
  from: LocalMs;
  to: LocalMs;
}

/**
 * Ventana de checadas de un dia laboral: desde el corte del dia hasta el mismo
 * corte del dia siguiente. Si el primer tramo cruza medianoche (turno nocturno)
 * la ventana va de 12:00 a 12:00 del dia siguiente.
 */
export const dayWindow = (
  workDate: DateString,
  cutoffTime: string,
  firstSegmentCrossesMidnight: boolean,
): DayWindow => {
  const midnight = dateToLocalMs(workDate);
  const offsetMinutes = firstSegmentCrossesMidnight ? 12 * 60 : timeToMinutes(cutoffTime);
  const from = midnight + offsetMinutes * MS_PER_MINUTE;
  return { from, to: from + 24 * MS_PER_HOUR };
};

/**
 * Descarta checadas rechazadas y colapsa las que caen dentro de la ventana de
 * rebote respecto a la ultima conservada (se queda la primera del grupo).
 */
export const normalizePunches = (
  punches: readonly EnginePunch[],
  debounceSeconds: number,
): EnginePunch[] => {
  const sorted = punches
    .filter((punch) => punch.reviewStatus !== 'rejected')
    .slice()
    .sort((a, b) => a.at - b.at || a.ref - b.ref);

  if (debounceSeconds <= 0) return sorted;

  const kept: EnginePunch[] = [];
  for (const punch of sorted) {
    const last = kept[kept.length - 1];
    if (last && punch.at - last.at < debounceSeconds * 1000) continue;
    kept.push(punch);
  }
  return kept;
};

interface PunchPair {
  entry: EnginePunch | null;
  exit: EnginePunch | null;
}

/**
 * Entrada = primera 'in' (o sin tipo); si no hay, la primera checada.
 * Salida = ultima 'out' (o sin tipo); si no hay y hay mas de una checada, la
 * ultima. La salida se descarta si no es estrictamente posterior a la entrada.
 */
export const pairPunches = (punches: readonly EnginePunch[]): PunchPair => {
  const ordered = punches
    .filter((punch) => punch.type !== 'break_start' && punch.type !== 'break_end')
    .slice()
    .sort((a, b) => a.at - b.at);
  if (ordered.length === 0) return { entry: null, exit: null };

  const entries = ordered.filter((punch) => punch.type === 'in' || punch.type === null);
  const exits = ordered.filter((punch) => punch.type === 'out' || punch.type === null);

  const entry = entries[0] ?? ordered[0] ?? null;
  let exit = exits[exits.length - 1] ?? null;
  if (!exit && ordered.length > 1) {
    exit = ordered[ordered.length - 1] ?? null;
  }
  if (entry && exit && exit.at <= entry.at) {
    exit = null;
  }
  return { entry, exit };
};

/** Reparte las checadas entre tramos usando el punto medio entre tramo y tramo. */
const splitBySegment = (
  punches: readonly EnginePunch[],
  segments: readonly DaySegment[],
  midnight: LocalMs,
): EnginePunch[][] => {
  const groups: EnginePunch[][] = segments.map(() => []);
  if (segments.length === 0) return groups;

  const boundaries: number[] = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index] as DaySegment;
    const next = segments[index + 1] as DaySegment;
    boundaries.push(midnight + ((current.endMinute + next.startMinute) / 2) * MS_PER_MINUTE);
  }

  for (const punch of punches) {
    let target = segments.length - 1;
    for (let index = 0; index < boundaries.length; index += 1) {
      if (punch.at < (boundaries[index] as number)) {
        target = index;
        break;
      }
    }
    (groups[target] as EnginePunch[]).push(punch);
  }
  return groups;
};

const formatMinute = (minute: number): string => {
  const normalized = minute % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};

const baseCalculation = (input: DayInput): DayCalculation => {
  const first = input.plan.segments[0] ?? null;
  const last = input.plan.segments[input.plan.segments.length - 1] ?? null;
  return {
    workDate: input.workDate,
    dayResult: 'present',
    expectedStartMinute: first ? first.startMinute : null,
    expectedEndMinute: last ? last.endMinute : null,
    clockInRef: null,
    clockOutRef: null,
    clockInAt: null,
    clockOutAt: null,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    workedHours: null,
    overtimeHours: 0,
    incidentId: null,
    hasPendingReview: false,
    reason: '',
    segments: [],
  };
};

export const calculateDay = (input: DayInput): DayCalculation => {
  const { settings } = input;
  const result = baseCalculation(input);
  const punches = normalizePunches(input.punches, settings.punch_debounce_seconds);
  result.hasPendingReview = punches.some((punch) => punch.reviewStatus === 'pending');

  const overall = pairPunches(punches);
  result.clockInRef = overall.entry?.ref ?? null;
  result.clockOutRef = overall.exit?.ref ?? null;
  result.clockInAt = overall.entry?.at ?? null;
  result.clockOutAt = overall.exit?.at ?? null;
  if (overall.entry && overall.exit) {
    result.workedHours = roundTo(Math.max(0, (overall.exit.at - overall.entry.at) / MS_PER_HOUR), 2);
  }

  // 1. Incidencia autorizada de dia completo: gana sobre todo lo demas.
  if (input.fullDayIncident) {
    result.dayResult = 'incident';
    result.incidentId = input.fullDayIncident.id;
    result.reason = `incident:${input.fullDayIncident.code}`;
    return result;
  }

  // 2. Nunca se le programo horario.
  if (!input.hasSchedule) {
    result.dayResult = 'no_schedule';
    result.reason = 'no_schedule';
    return result;
  }

  // 3. Festivo / descanso (se conservan las horas por si trabajo).
  if (input.isHoliday) {
    result.dayResult = 'holiday';
    result.reason = overall.entry ? 'holiday_worked' : 'holiday';
    return result;
  }
  if (input.plan.segments.length === 0) {
    result.dayResult = input.plan.isRestDay ? 'rest_day' : 'no_schedule';
    result.reason = input.plan.isRestDay ? 'rest_day' : 'no_shift_for_day';
    return result;
  }

  // 4. Sin ninguna checada: falta.
  if (!overall.entry) {
    result.dayResult = 'absent';
    result.reason = 'no_punches';
    result.segments = input.plan.segments.map((segment) => emptySegmentDetail(segment));
    return result;
  }

  // 5. Evaluacion por tramo.
  const midnight = dateToLocalMs(input.workDate);
  const groups = splitBySegment(punches, input.plan.segments, midnight);

  let totalLate = 0;
  let totalEarly = 0;
  let worked = 0;
  let hasWorked = false;
  let expectedHours = 0;
  let maxRawLate = 0;
  let missingSegments = 0;
  let missingExit = false;
  const details: SegmentDetail[] = [];

  input.plan.segments.forEach((segment, index) => {
    const group = groups[index] ?? [];
    expectedHours += segmentHours(segment);
    if (group.length === 0) {
      missingSegments += 1;
      details.push(emptySegmentDetail(segment));
      return;
    }

    const pair = pairPunches(group);
    const expectedStart = midnight + segment.startMinute * MS_PER_MINUTE;
    const expectedEnd = midnight + segment.endMinute * MS_PER_MINUTE;

    let lateMinutes = 0;
    let rawLate = 0;
    if (!segment.flexible && pair.entry) {
      rawLate = Math.max(0, Math.round((pair.entry.at - expectedStart) / MS_PER_MINUTE));
      lateMinutes = rawLate > settings.tolerance_min ? rawLate : 0;
    }
    let earlyMinutes = 0;
    if (!segment.flexible && pair.exit) {
      const rawEarly = Math.max(0, Math.round((expectedEnd - pair.exit.at) / MS_PER_MINUTE));
      earlyMinutes = rawEarly > settings.early_exit_min ? rawEarly : 0;
    }
    let hours: number | null = null;
    if (pair.entry && pair.exit) {
      hours = Math.max(0, (pair.exit.at - pair.entry.at) / MS_PER_HOUR - segment.breakMinutes / 60);
      worked += hours;
      hasWorked = true;
    } else if (pair.entry && !pair.exit) {
      missingExit = true;
    }

    totalLate += lateMinutes;
    totalEarly += earlyMinutes;
    maxRawLate = Math.max(maxRawLate, rawLate);
    details.push({
      shiftId: segment.shiftId,
      name: segment.name,
      expectedStart: formatMinute(segment.startMinute),
      expectedEnd: formatMinute(segment.endMinute),
      clockInRef: pair.entry?.ref ?? null,
      clockOutRef: pair.exit?.ref ?? null,
      clockInAt: pair.entry?.at ?? null,
      clockOutAt: pair.exit?.at ?? null,
      lateMinutes,
      earlyDepartureMinutes: earlyMinutes,
      hours: hours === null ? null : roundTo(hours, 2),
      hasPunches: true,
    });
  });

  result.segments = details;
  result.lateMinutes = totalLate;
  result.earlyDepartureMinutes = totalEarly;
  if (hasWorked) {
    result.workedHours = roundTo(worked, 2);
  }

  if (input.authorizedOvertimeHours > 0 && result.workedHours !== null) {
    result.overtimeHours = roundTo(
      Math.min(input.authorizedOvertimeHours, Math.max(0, result.workedHours - expectedHours)),
      2,
    );
  }

  // 6. Resultado final por prioridad.
  if (maxRawLate > settings.late_until_min) {
    result.dayResult = 'absent';
    result.reason = 'excessive_late';
  } else if (missingExit && settings.missing_exit_result === 'absent') {
    result.dayResult = 'absent';
    result.reason = 'missing_exit';
  } else if (result.workedHours !== null && result.workedHours < settings.min_workday_hours) {
    result.dayResult = 'absent';
    result.reason = 'workday_incomplete';
  } else if (missingSegments > 0) {
    result.dayResult = settings.missing_segment_result === 'absent' ? 'absent' : 'partial_absence';
    result.reason = 'missing_segment';
  } else if (totalLate > 0) {
    result.dayResult = 'late';
    result.reason = 'late_entry';
  } else if (totalEarly > 0) {
    result.dayResult = 'early_departure';
    result.reason = 'early_exit';
  } else {
    result.dayResult = 'present';
    result.reason = missingExit ? 'missing_exit_tolerated' : 'on_time';
    if (missingExit) {
      result.hasPendingReview = true;
    }
  }

  return result;
};

const emptySegmentDetail = (segment: DaySegment): SegmentDetail => ({
  shiftId: segment.shiftId,
  name: segment.name,
  expectedStart: formatMinute(segment.startMinute),
  expectedEnd: formatMinute(segment.endMinute),
  clockInRef: null,
  clockOutRef: null,
  clockInAt: null,
  clockOutAt: null,
  lateMinutes: 0,
  earlyDepartureMinutes: 0,
  hours: null,
  hasPunches: false,
});
