import type { AttendanceShift } from '../../../api/service.api-attendance-schedule';

/** Helpers puros del calendario de horarios (sin dependencias de React). */

export const PALETTE = [
  '#034898', '#F9B318', '#0284c7', '#7c3aed', '#d97706', '#dc2626',
  '#0f766e', '#b45309', '#6d28d9', '#be123c', '#4d7c0f', '#475569',
];

export const WEEKDAY_SHORT: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom' };
export const WEEKDAY_LONG: Record<number, string> = {
  1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo',
};

const HHMM = /^(\d{1,2}):(\d{2})/;

/** 'HH:MM' -> minutos desde medianoche (NaN si es invalido). */
export const toMinutes = (value: string | null | undefined): number => {
  const match = value ? HHMM.exec(value) : null;
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
};

/** Duracion bruta en minutos; si salida <= entrada cruza medianoche. */
export const grossMinutes = (start: string, end: string): number => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return e > s ? e - s : e - s + 1440;
};

export const crossesMidnight = (start: string, end: string): boolean => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return !Number.isNaN(s) && !Number.isNaN(e) && e <= s;
};

/** Horas netas (descuenta el descanso), redondeadas a 2 decimales y nunca negativas. */
export const netHours = (start: string, end: string, breakMinutes: number): number =>
  Math.max(0, Math.round(((grossMinutes(start, end) - (breakMinutes || 0)) / 60) * 100) / 100);

export const formatHoursValue = (hours: number): string => {
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} h`;
};

/** 'YYYY-MM-DD' -> weekday ISO (1 = lunes ... 7 = domingo). */
export const isoWeekday = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
  return js === 0 ? 7 : js;
};

/** Weekdays ISO ordenados a partir del primer dia de la semana (p. ej. domingo => 7,1,2,...). */
export const orderedWeekdays = (weekStartDate: string | undefined): number[] => {
  const first = weekStartDate ? isoWeekday(weekStartDate) : 1;
  return Array.from({ length: 7 }, (_, i) => ((first - 1 + i) % 7) + 1);
};

type TimeShift = Pick<AttendanceShift, 'start_time' | 'end_time'>;

/** Traslape entre dos turnos del mismo dia, considerando que un nocturno invade el dia vecino. */
export const shiftsOverlap = (a: TimeShift, b: TimeShift): boolean => {
  const sa = toMinutes(a.start_time);
  const sb = toMinutes(b.start_time);
  if (Number.isNaN(sa) || Number.isNaN(sb)) return false;
  const ea = sa + grossMinutes(a.start_time, a.end_time);
  const eb = sb + grossMinutes(b.start_time, b.end_time);
  return [-1440, 0, 1440].some((shift) => sa < eb + shift && sb + shift < ea);
};

/** Pares de turnos (por nombre) que se encimaran dentro de un mismo dia. */
export const findOverlaps = (shifts: AttendanceShift[]): [string, string][] => {
  const pairs: [string, string][] = [];
  for (let i = 0; i < shifts.length; i += 1) {
    for (let j = i + 1; j < shifts.length; j += 1) {
      const a = shifts[i];
      const b = shifts[j];
      if (a && b && shiftsOverlap(a, b)) pairs.push([a.name, b.name]);
    }
  }
  return pairs;
};

export const totalNetHours = (shifts: AttendanceShift[]): number =>
  Math.round(shifts.reduce((sum, s) => sum + netHours(s.start_time, s.end_time, s.break_minutes), 0) * 100) / 100;

/** Texto legible de los dias elegidos, p. ej. 'Lun a Vie' o 'Lun, Mié, Sáb'. */
export const describeWeekdays = (weekdays: number[]): string => {
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  if (sorted.length === 0) return '—';
  if (sorted.length === 7) return 'Todos los días';
  const consecutive = sorted.every((d, i) => i === 0 || d === (sorted[i - 1] ?? 0) + 1);
  if (consecutive && sorted.length >= 3) {
    return `${WEEKDAY_SHORT[sorted[0] ?? 1]} a ${WEEKDAY_SHORT[sorted[sorted.length - 1] ?? 1]}`;
  }
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
};

/** Color de texto legible (blanco/oscuro) segun la luminancia del fondo '#RRGGBB'. */
export const readableTextColor = (hex: string): string => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return '#ffffff';
  const n = parseInt(match[1], 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.62 ? '#1f2937' : '#ffffff';
};

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_PUNCH_WINDOWS = { entry_before_min: 20, entry_after_min: 30, exit_before_min: 1, exit_after_min: 20 } as const;

const shiftClock = (time: string, offsetMinutes: number): string => {
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  const total = (((h ?? 0) * 60 + (m ?? 0) + offsetMinutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Rango horario de una ventana de checada: [hora - antes, hora + despues]. */
export const windowRange = (time: string, before: number, after: number): string =>
  `${shiftClock(time, -before)}–${shiftClock(time, after)}`;
