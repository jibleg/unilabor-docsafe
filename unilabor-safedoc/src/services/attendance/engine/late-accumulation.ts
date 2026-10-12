import { monthBounds, startOfWeek, type DateString, type WeekStart } from './time';
import type { DayResult } from './day-calculator';
import type { AttendanceSettings } from './settings';

/**
 * Falta por retardos acumulados. PURO.
 *
 * Dentro de cada periodo (mes, quincena o semana) se cuentan los dias con
 * resultado `late`; el retardo que completa cada grupo de N queda marcado como
 * `is_late_accumulation_absence`. El resultado del dia sigue siendo `late`: la
 * marca es una bandera aparte que los tableros cuentan como falta.
 */

export interface DayOutcome {
  date: DateString;
  dayResult: DayResult;
}

/** Clave del periodo que contiene `date`. */
export const latePeriodKey = (
  date: DateString,
  period: AttendanceSettings['late_period'],
  weekStart: WeekStart,
): string => {
  switch (period) {
    case 'month':
      return monthBounds(date).start;
    case 'fortnight': {
      const { start } = monthBounds(date);
      return Number(date.slice(8, 10)) <= 15 ? start : `${start.slice(0, 8)}16`;
    }
    case 'week':
      return startOfWeek(date, weekStart);
  }
};

/** Primer y ultimo dia del periodo que contiene `date` (para saber que rango recalcular). */
export const latePeriodBounds = (
  date: DateString,
  period: AttendanceSettings['late_period'],
  weekStart: WeekStart,
): { start: DateString; end: DateString } => {
  const key = latePeriodKey(date, period, weekStart);
  if (period === 'week') {
    const end = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + 6));
    return { start: key, end: end.toISOString().slice(0, 10) };
  }
  const { end: monthEnd } = monthBounds(date);
  if (period === 'month') {
    return { start: key, end: monthEnd };
  }
  return key.endsWith('-01') ? { start: key, end: `${key.slice(0, 8)}15` } : { start: key, end: monthEnd };
};

/** Fechas (de `outcomes`) que completan un grupo de `latePerAbsence` retardos del mismo periodo. */
export const markLateAccumulation = (
  outcomes: readonly DayOutcome[],
  settings: Pick<AttendanceSettings, 'late_per_absence' | 'late_period' | 'week_start'>,
): Set<DateString> => {
  const marked = new Set<DateString>();
  if (settings.late_per_absence <= 0) return marked;

  const counters = new Map<string, number>();
  const ordered = outcomes.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const outcome of ordered) {
    if (outcome.dayResult !== 'late') continue;
    const key = latePeriodKey(outcome.date, settings.late_period, settings.week_start);
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    if (count % settings.late_per_absence === 0) {
      marked.add(outcome.date);
    }
  }
  return marked;
};
