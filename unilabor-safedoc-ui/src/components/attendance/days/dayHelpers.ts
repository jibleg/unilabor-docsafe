import { DAY_RESULT_LABEL, type DayResultCode } from '../shared/dayResult';
import { addDaysIso, todayIso } from '../shared/format';
import type { AttendanceDay, DaysQuery } from '../../../api/service.api-attendance-days';

export const MAX_RANGE_DAYS = 366;
export const PAGE_SIZE = 50;

export const PROBLEMS_VALUE = 'problems';
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Resultados sobre los que tiene sentido justificar (falta, falta parcial, retardo, salida anticipada). */
const JUSTIFIABLE: DayResultCode[] = ['absent', 'partial_absence', 'late', 'early_departure'];

export const canJustifyDay = (day: Pick<AttendanceDay, 'day_result'>): boolean => JUSTIFIABLE.includes(day.day_result);

export const REASON_LABEL: Record<string, string> = {
  on_time: 'Puntual',
  late_entry: 'Entrada tardía',
  early_exit: 'Salida anticipada',
  no_punches: 'Sin checadas',
  excessive_late: 'Retardo excesivo',
  missing_exit: 'Falta checada de salida',
  workday_incomplete: 'Jornada incompleta',
  missing_segment: 'Falta un bloque de la jornada',
  missing_exit_tolerated: 'Salida omitida (tolerada)',
  holiday: 'Día festivo',
  holiday_worked: 'Festivo trabajado',
  rest_day: 'Día de descanso',
  no_schedule: 'Sin horario',
  no_shift_for_day: 'Sin turno para el día',
};

export const reasonLabel = (reason: string | null | undefined): string => {
  if (!reason) return '';
  if (reason.startsWith('incident:')) return `Incidencia ${reason.slice('incident:'.length)}`;
  return REASON_LABEL[reason] ?? reason;
};

export const RESULT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los resultados' },
  { value: PROBLEMS_VALUE, label: 'Solo problemas' },
  ...(Object.keys(DAY_RESULT_LABEL) as DayResultCode[]).map((code) => ({ value: code, label: DAY_RESULT_LABEL[code] })),
];

/** Rango por defecto de Dias: hoy-14 a ayer. */
export const defaultDaysRange = (today: string = todayIso()): { from: string; to: string } => ({
  from: addDaysIso(today, -14),
  to: addDaysIso(today, -1),
});

/** Rango por defecto de Checadas: ultimos 7 dias hasta hoy. */
export const defaultPunchesRange = (today: string = todayIso()): { from: string; to: string } => ({
  from: addDaysIso(today, -7),
  to: today,
});

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
};

export const rangeDays = (from: string, to: string): number => dayNumber(to) - dayNumber(from) + 1;

/** Devuelve el mensaje de error del rango o null si es valido. */
export const validateRange = (from: string, to: string): string | null => {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return 'Indica fechas válidas en el rango.';
  if (from > to) return 'La fecha inicial no puede ser posterior a la final.';
  if (rangeDays(from, to) > MAX_RANGE_DAYS) return `El rango máximo es de ${MAX_RANGE_DAYS} días.`;
  return null;
};

/** Traduce el filtro de resultado de la URL a los parametros del API. */
export const resultFilterToQuery = (result: string): Pick<DaysQuery, 'result' | 'only_issues'> =>
  result === PROBLEMS_VALUE ? { only_issues: true } : result ? { result } : {};

/** Equivalente de "solo problemas" para el Excel (que no admite only_issues). */
export const PROBLEM_RESULTS_FOR_EXPORT = 'late,absent,partial_absence,early_departure';

export const exportResultParam = (result: string): string | undefined =>
  result === PROBLEMS_VALUE ? PROBLEM_RESULTS_FOR_EXPORT : result || undefined;

export type RowTone = 'absent' | 'review' | 'none';

export const dayRowTone = (day: Pick<AttendanceDay, 'day_result' | 'has_pending_review' | 'is_late_accumulation_absence'>): RowTone => {
  if (day.day_result === 'absent' || day.is_late_accumulation_absence) return 'absent';
  if (day.has_pending_review) return 'review';
  return 'none';
};

export const formatSummary = (summary: { absent: number; late: number; late_accumulation_absence: number }): string =>
  `${summary.absent} faltas · ${summary.late} retardos · ${summary.late_accumulation_absence} faltas por retardos`;

/** Un cierre de dia solo se recalcula hasta ayer. */
export const isFutureOrToday = (date: string, today: string = todayIso()): boolean => date >= today;
