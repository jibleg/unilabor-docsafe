/**
 * Utilidades de fecha/hora del motor de asistencia.
 *
 * El motor es PURO y trabaja en "hora local de pared": un instante local es el
 * numero de milisegundos desde 1970-01-01T00:00 interpretando la hora local
 * como si fuera UTC (`LocalMs`). Asi no hay husos horarios dentro del motor; la
 * conversion Date <-> LocalMs ocurre en el servicio con la zona configurada.
 */

/** Milisegundos desde 1970-01-01 00:00 en hora local de pared. */
export type LocalMs = number;
/** Fecha calendario 'YYYY-MM-DD'. */
export type DateString = string;

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isDateString = (value: string): boolean => {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const date = new Date(time);
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
};

/** Medianoche local de una fecha, en LocalMs. */
export const dateToLocalMs = (date: DateString): LocalMs => {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`Fecha invalida: ${date}`);
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const localMsToDate = (value: LocalMs): DateString => {
  const date = new Date(value);
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addDays = (date: DateString, days: number): DateString =>
  localMsToDate(dateToLocalMs(date) + days * MS_PER_DAY);

/** Dias enteros de `from` a `to` (positivo si `to` es posterior). */
export const daysBetween = (from: DateString, to: DateString): number =>
  Math.round((dateToLocalMs(to) - dateToLocalMs(from)) / MS_PER_DAY);

/** Dia de la semana ISO: 1 = lunes ... 7 = domingo. */
export const isoWeekday = (date: DateString): number => {
  const day = new Date(dateToLocalMs(date)).getUTCDay(); // 0 = domingo
  return day === 0 ? 7 : day;
};

export type WeekStart = 'sunday' | 'monday';

/** Fecha del primer dia de la semana que contiene `date`. */
export const startOfWeek = (date: DateString, weekStart: WeekStart): DateString => {
  const weekday = isoWeekday(date); // 1..7
  const offset = weekStart === 'monday' ? weekday - 1 : weekday % 7; // domingo => 0
  return addDays(date, -offset);
};

/** 'HH:MM' o 'HH:MM:SS' -> minutos desde la medianoche. */
export const timeToMinutes = (time: string): number => {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) {
    throw new Error(`Hora invalida: ${time}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
};

export const minutesToTime = (minutes: number): string => {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalized / 60)).padStart(2, '0');
  const m = String(normalized % 60).padStart(2, '0');
  return `${h}:${m}`;
};

export const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Primer dia (YYYY-MM-DD) y ultimo del mes de `date`. */
export const monthBounds = (date: DateString): { start: DateString; end: DateString } => {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const start = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};
