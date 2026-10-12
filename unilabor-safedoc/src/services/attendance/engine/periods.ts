import { addDays, daysBetween, startOfWeek, type DateString, type WeekStart } from './time';

/**
 * Periodos del tablero de compromiso. PURO: rango que contiene una fecha ancla,
 * periodo vecino, etiqueta legible y granularidad de la tendencia.
 */

export const PERIOD_TYPES = [
  'day', 'week', 'fortnight', 'month', 'bimester', 'quarter', 'semester', 'year', 'custom',
] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];
export type Granularity = 'day' | 'week' | 'month';

/** Tope del rango personalizado: un anio completo. */
export const MAX_CUSTOM_DAYS = 366;

export interface DateRange {
  from: DateString;
  to: DateString;
}

const MONTHS_IN_PERIOD: Partial<Record<PeriodType, number>> = {
  month: 1, bimester: 2, quarter: 3, semester: 6, year: 12,
};

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const parts = (date: DateString): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return [y, m, d];
};

const pad = (value: number, size = 2): string => String(value).padStart(size, '0');
const monthEnd = (year: number, month: number): DateString =>
  `${pad(year, 4)}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
const monthStart = (year: number, month: number): DateString => `${pad(year, 4)}-${pad(month)}-01`;

/** Dias que abarca un rango, contando ambos extremos. */
export const rangeDays = (from: DateString, to: DateString): number => daysBetween(from, to) + 1;

/** Rango elegido a mano: si vienen invertidos se acomodan; se recorta a MAX_CUSTOM_DAYS. */
export const customRange = (a: DateString, b: DateString): DateRange => {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return { from, to: rangeDays(from, to) > MAX_CUSTOM_DAYS ? addDays(from, MAX_CUSTOM_DAYS - 1) : to };
};

/** Rango del periodo que contiene la fecha ancla. Los de varios meses se alinean al multiplo. */
export const periodRange = (
  period: PeriodType,
  anchor: DateString,
  weekStart: WeekStart,
  to: DateString = anchor,
): DateRange => {
  if (period === 'custom') return customRange(anchor, to);
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'week') {
    const first = startOfWeek(anchor, weekStart);
    return { from: first, to: addDays(first, 6) };
  }
  const [y, m, d] = parts(anchor);
  if (period === 'fortnight') {
    return d <= 15
      ? { from: monthStart(y, m), to: `${pad(y, 4)}-${pad(m)}-15` }
      : { from: `${pad(y, 4)}-${pad(m)}-16`, to: monthEnd(y, m) };
  }
  const months = MONTHS_IN_PERIOD[period] ?? 1;
  const firstMonth = Math.floor((m - 1) / months) * months + 1;
  return { from: monthStart(y, firstMonth), to: monthEnd(y, firstMonth + months - 1) };
};

/** Periodo anterior (-1) o siguiente (+1) del mismo tipo al que empieza en `from`. */
export const neighborPeriod = (
  period: PeriodType,
  range: DateRange,
  direction: -1 | 1,
  weekStart: WeekStart,
): DateRange => {
  if (period === 'custom') {
    const span = rangeDays(range.from, range.to);
    const from = addDays(range.from, span * direction);
    return { from, to: addDays(from, span - 1) };
  }
  if (period === 'day') return periodRange(period, addDays(range.from, direction), weekStart);
  if (period === 'week') return periodRange(period, addDays(range.from, 7 * direction), weekStart);
  const [y, m, d] = parts(range.from);
  if (period === 'fortnight') {
    if (direction === 1) {
      return d === 1
        ? periodRange(period, `${pad(y, 4)}-${pad(m)}-16`, weekStart)
        : periodRange(period, monthStart(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1), weekStart);
    }
    return d === 16
      ? periodRange(period, monthStart(y, m), weekStart)
      : periodRange(period, m === 1 ? monthEnd(y - 1, 12) : monthEnd(y, m - 1), weekStart);
  }
  const months = MONTHS_IN_PERIOD[period] ?? 1;
  const target = new Date(Date.UTC(y, m - 1 + months * direction, 1));
  return periodRange(period, monthStart(target.getUTCFullYear(), target.getUTCMonth() + 1), weekStart);
};

/** Etiqueta legible en espanol del periodo. */
export const periodLabel = (period: PeriodType, from: DateString, to: DateString): string => {
  const [y, m, d] = parts(from);
  const [yh, mh, dh] = parts(to);
  const short = (mm: number): string => MONTHS_SHORT[mm - 1] ?? '';
  const long = (mm: number): string => MONTHS_LONG[mm - 1] ?? '';
  switch (period) {
    case 'custom':
      return `${d} ${short(m)} ${y} - ${dh} ${short(mh)} ${yh}`;
    case 'day':
      return `${d} de ${long(m)} de ${y}`;
    case 'week':
      return y === yh ? `${d} ${short(m)} - ${dh} ${short(mh)} ${yh}` : `${d} ${short(m)} ${y} - ${dh} ${short(mh)} ${yh}`;
    case 'fortnight':
      return `${d === 1 ? '1a' : '2a'} quincena de ${long(m)} ${y}`;
    case 'month':
      return `${long(m)} ${y}`;
    case 'year':
      return String(y);
    default:
      return `${short(m)} - ${short(mh)} ${y}`;
  }
};

/** Detalle de la tendencia: por dia hasta un mes, por semana hasta un trimestre, por mes despues. */
export const trendGranularity = (period: PeriodType, days = 0): Granularity => {
  if (period === 'custom') return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
  if (period === 'bimester' || period === 'quarter') return 'week';
  if (period === 'semester' || period === 'year') return 'month';
  return 'day';
};

/** Llave de agrupacion y etiqueta corta de una fecha segun la granularidad. */
export const blockOf = (
  date: DateString,
  granularity: Granularity,
  weekStart: WeekStart,
): { key: string; label: string } => {
  const [, m, d] = parts(date);
  if (granularity === 'day') return { key: date, label: String(d) };
  if (granularity === 'week') {
    const first = startOfWeek(date, weekStart);
    const [, fm, fd] = parts(first);
    return { key: first, label: `${fd}/${fm}` };
  }
  return { key: date.slice(0, 7), label: MONTHS_SHORT[m - 1] ?? '' };
};
