import type { AttendanceSetting, VacationPolicyRow } from '../../../api/service.api-attendance-settings';

/** Utilidades puras de la pantalla de Parametros. */

export const GROUP_ORDER = ['punctuality', 'calendar', 'devices', 'vacations', 'commitment'] as const;

const GROUP_LABELS: Record<string, string> = {
  punctuality: 'Puntualidad',
  calendar: 'Calendario',
  devices: 'Relojes',
  vacations: 'Vacaciones',
  commitment: 'Compromiso',
};

export const groupLabel = (group: string): string => GROUP_LABELS[group] ?? group;

const OPTION_LABELS: Record<string, string> = {
  month: 'Mes',
  fortnight: 'Quincena',
  week: 'Semana',
  partial_absence: 'Falta parcial',
  absent: 'Falta',
  present: 'Asistencia',
  sunday: 'Domingo',
  monday: 'Lunes',
  warn: 'Advertir',
  block: 'Bloquear',
  allow: 'Permitir',
};

export const optionLabel = (option: string): string => OPTION_LABELS[option] ?? option;

/** Valor legible con unidad: '10 min', 'Quincena', '04:00'. */
export const formatSettingValue = (setting: Pick<AttendanceSetting, 'type' | 'unit'>, value: number | string): string => {
  if (setting.type === 'enum') return optionLabel(String(value));
  const text = String(value);
  return setting.unit ? `${text} ${setting.unit}` : text;
};

export const rangeText = (setting: Pick<AttendanceSetting, 'type' | 'min' | 'max' | 'unit'>): string => {
  if (setting.type !== 'integer' || setting.min === null || setting.max === null) return '';
  const unit = setting.unit ? ` ${setting.unit}` : '';
  return `Rango permitido: de ${setting.min} a ${setting.max}${unit}.`;
};

export const MIN_REASON_LENGTH = 5;

/** Devuelve un mensaje de error o null si el valor y el motivo son validos. */
export const validateSettingInput = (
  setting: Pick<AttendanceSetting, 'type' | 'min' | 'max' | 'options'>,
  raw: string,
  reason: string,
): string | null => {
  const value = raw.trim();
  if (!value) return 'Indica un valor.';
  if (setting.type === 'integer') {
    const number = Number(value);
    if (!Number.isInteger(number)) return 'El valor debe ser un número entero.';
    if (setting.min !== null && number < setting.min) return `El mínimo es ${setting.min}.`;
    if (setting.max !== null && number > setting.max) return `El máximo es ${setting.max}.`;
  }
  if (setting.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return 'Usa el formato HH:MM.';
  if (setting.type === 'enum' && setting.options && !setting.options.includes(value)) return 'Elige una opción válida.';
  const reasonLength = reason.trim().length;
  if (reasonLength < MIN_REASON_LENGTH) return `El motivo del cambio debe tener al menos ${MIN_REASON_LENGTH} caracteres.`;
  if (reasonLength > 500) return 'El motivo no puede pasar de 500 caracteres.';
  return null;
};

/** Convierte el texto del formulario al valor que espera la API. */
export const parseSettingValue = (setting: Pick<AttendanceSetting, 'type'>, raw: string): number | string =>
  setting.type === 'integer' ? Number(raw.trim()) : raw.trim();

export const INCIDENT_CODE_PATTERN = /^[a-z][a-z0-9_]{1,29}$/;

export const isValidIncidentCode = (code: string): boolean => INCIDENT_CODE_PATTERN.test(code);

/** Sugiere una clave a partir del nombre: 'Permiso médico' -> 'permiso_medico'. */
export const suggestIncidentCode = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 30);

/** Etiqueta del rango de una fila de vacaciones segun la fila siguiente. */
export const vacationRowLabel = (rows: VacationPolicyRow[], index: number): string => {
  const row = rows[index];
  if (!row) return '';
  const next = rows[index + 1];
  if (!next) return `Año ${row.from_seniority_year} en adelante`;
  const last = next.from_seniority_year - 1;
  return last <= row.from_seniority_year ? `Año ${row.from_seniority_year}` : `Años ${row.from_seniority_year} a ${last}`;
};

export const isPolicyEqualToLaw = (rows: VacationPolicyRow[]): boolean => rows.length > 0 && rows.every((row) => !row.differs_from_law);

/** Anos disponibles para el selector de festivos. */
export const holidayYears = (currentYear: number): number[] => [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

export const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.getFullYear() === y && date.getMonth() === m! - 1 && date.getDate() === d;
};
