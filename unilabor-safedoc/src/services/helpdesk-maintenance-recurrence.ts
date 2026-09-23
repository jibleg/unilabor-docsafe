/**
 * Reglas puras de recurrencia y ventana del Programa de Mantenimiento.
 * Sin acceso a BD: todo se calcula a partir de la rutina (plan) y fechas ISO
 * (YYYY-MM-DD), para poder probarse de forma aislada.
 *
 * - Frecuencia: catalogo (interval_months) o personalizada (valor + unidad).
 * - Anclaje FIXED: la siguiente se calcula desde la fecha programada; FLOATING:
 *   desde la fecha real de ejecucion.
 * - Ventana desde/hasta: tolerance_before/after_days alrededor de la fecha, con
 *   tope por criticidad del activo (critica: 0 dias despues).
 * - Fin de recurrencia: fecha limite y/o numero maximo de ocurrencias.
 */

export type MaintenanceServiceKind =
  | 'PREVENTIVE'
  | 'VERIFICATION'
  | 'ELECTRICAL_SAFETY'
  | 'OTHER'
  | 'POST_REPAIR_VERIFICATION';

export type MaintenanceIntervalUnit = 'DAY' | 'WEEK' | 'MONTH';
export type MaintenanceAnchorMode = 'FIXED' | 'FLOATING';
export type MaintenanceExecutorKind = 'INTERNAL_OPERATOR' | 'INTERNAL_TECH' | 'EXTERNAL_PROVIDER';
export type MaintenanceProgramSourceKind = 'MANUFACTURER_MANUAL' | 'PROVIDER_PROGRAM' | 'SERVICE_CONTRACT' | 'INTERNAL';

export const SERVICE_KINDS: MaintenanceServiceKind[] = [
  'PREVENTIVE',
  'VERIFICATION',
  'ELECTRICAL_SAFETY',
  'OTHER',
  'POST_REPAIR_VERIFICATION',
];
export const PLANNABLE_SERVICE_KINDS: MaintenanceServiceKind[] = ['PREVENTIVE', 'VERIFICATION', 'ELECTRICAL_SAFETY', 'OTHER'];

export const SERVICE_KIND_LABELS: Record<MaintenanceServiceKind, string> = {
  PREVENTIVE: 'Mantenimiento preventivo',
  VERIFICATION: 'Verificacion intermedia',
  ELECTRICAL_SAFETY: 'Seguridad electrica',
  OTHER: 'Otro servicio',
  POST_REPAIR_VERIFICATION: 'Verificacion post-reparacion',
};

/** Tope de dias "hasta" (despues de la fecha) segun criticidad del activo. */
export const WINDOW_AFTER_CAP_BY_CRITICALITY: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 7,
  MEDIUM: 15,
  LOW: 30,
};

/** Criticidades que exigen verificacion post-reparacion y firma del responsable. */
export const STRICT_CRITICALITIES = new Set(['CRITICAL', 'HIGH']);

export interface RecurrenceRule {
  interval_months: number | null;
  custom_interval_value: number | null;
  custom_interval_unit: MaintenanceIntervalUnit | null;
  anchor_mode: MaintenanceAnchorMode;
  recurrence_end_on: string | null;
  recurrence_max_occurrences: number | null;
}

const parseIsoDate = (value: string): Date => new Date(`${value.slice(0, 10)}T00:00:00`);

const toIso = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addDaysIso = (dateValue: string, days: number): string => {
  const date = parseIsoDate(dateValue);
  date.setDate(date.getDate() + days);
  return toIso(date);
};

/**
 * Suma meses conservando el dia cuando existe; si el mes destino es mas corto
 * (31 ene + 1 mes) cae al ultimo dia del mes, no al mes siguiente.
 */
export const addMonthsIso = (dateValue: string, months: number): string => {
  const date = parseIsoDate(dateValue);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toIso(date);
};

export const addIntervalIso = (dateValue: string, value: number, unit: MaintenanceIntervalUnit): string => {
  switch (unit) {
    case 'DAY':
      return addDaysIso(dateValue, value);
    case 'WEEK':
      return addDaysIso(dateValue, value * 7);
    case 'MONTH':
    default:
      return addMonthsIso(dateValue, value);
  }
};

/** Intervalo efectivo de la rutina: personalizado si esta definido; si no, meses del catalogo. */
export const resolveInterval = (rule: RecurrenceRule): { value: number; unit: MaintenanceIntervalUnit } | null => {
  if (rule.custom_interval_value && rule.custom_interval_value > 0 && rule.custom_interval_unit) {
    return { value: rule.custom_interval_value, unit: rule.custom_interval_unit };
  }
  if (rule.interval_months && rule.interval_months > 0) {
    return { value: rule.interval_months, unit: 'MONTH' };
  }
  return null;
};

export const describeInterval = (rule: RecurrenceRule): string => {
  const interval = resolveInterval(rule);
  if (!interval) {
    return 'Sin recurrencia';
  }
  const unitLabel: Record<MaintenanceIntervalUnit, [string, string]> = {
    DAY: ['dia', 'dias'],
    WEEK: ['semana', 'semanas'],
    MONTH: ['mes', 'meses'],
  };
  const [singular, plural] = unitLabel[interval.unit];
  return `Cada ${interval.value} ${interval.value === 1 ? singular : plural}`;
};

/** Siguiente fecha a partir de una base (programada si FIXED, real si FLOATING). */
export const computeNextDate = (rule: RecurrenceRule, baseDate: string): string | null => {
  const interval = resolveInterval(rule);
  if (!interval) {
    return null;
  }
  const next = addIntervalIso(baseDate, interval.value, interval.unit);
  if (rule.recurrence_end_on && next > rule.recurrence_end_on) {
    return null;
  }
  return next;
};

export interface ProjectionInput {
  rule: RecurrenceRule;
  /** Primera fecha desde la que proyectar (la siguiente pendiente). */
  fromDate: string;
  /** Ultimo dia del horizonte (inclusive). */
  horizonEnd: string;
  /** Ocurrencias ya generadas (para respetar recurrence_max_occurrences). */
  occurrencesSoFar: number;
  /** Tope defensivo de fechas por corrida. */
  maxDates?: number;
}

/**
 * Fechas proyectadas dentro del horizonte, empezando en fromDate (inclusive)
 * y avanzando por el intervalo. Respeta fin de recurrencia y maximo de
 * ocurrencias. Si la rutina no tiene intervalo, solo devuelve fromDate.
 */
export const projectDates = ({ rule, fromDate, horizonEnd, occurrencesSoFar, maxDates = 120 }: ProjectionInput): string[] => {
  const dates: string[] = [];
  const maxOccurrences = rule.recurrence_max_occurrences && rule.recurrence_max_occurrences > 0 ? rule.recurrence_max_occurrences : null;
  let remaining = maxOccurrences === null ? Number.POSITIVE_INFINITY : maxOccurrences - occurrencesSoFar;
  let current: string | null = fromDate;
  while (current && current <= horizonEnd && remaining > 0 && dates.length < maxDates) {
    if (rule.recurrence_end_on && current > rule.recurrence_end_on) {
      break;
    }
    dates.push(current);
    remaining -= 1;
    current = computeNextDate(rule, current);
  }
  return dates;
};

export interface WindowInput {
  scheduledFor: string;
  beforeDays: number;
  afterDays: number;
  criticalityCode?: string | null;
}

/** Ventana desde/hasta con tope por criticidad (critica: 0 dias despues). */
export const computeWindow = ({ scheduledFor, beforeDays, afterDays, criticalityCode }: WindowInput): { starts_on: string; ends_on: string; after_days: number } => {
  const cap = criticalityCode ? WINDOW_AFTER_CAP_BY_CRITICALITY[criticalityCode.toUpperCase()] : undefined;
  const effectiveAfter = cap === undefined ? Math.max(afterDays, 0) : Math.min(Math.max(afterDays, 0), cap);
  return {
    starts_on: addDaysIso(scheduledFor, -Math.max(beforeDays, 0)),
    ends_on: addDaysIso(scheduledFor, effectiveAfter),
    after_days: effectiveAfter,
  };
};

export type WindowState = 'EARLY' | 'ON_TIME' | 'OVERDUE';

/** Estado de una orden abierta respecto a su ventana, al dia indicado. */
export const windowState = (windowStartsOn: string | null, windowEndsOn: string | null, today: string): WindowState => {
  if (windowEndsOn && today > windowEndsOn) {
    return 'OVERDUE';
  }
  if (windowStartsOn && today < windowStartsOn) {
    return 'EARLY';
  }
  return 'ON_TIME';
};

/** Firma del responsable obligatoria: servicio externo o activo critico/alto. */
export const requiresResponsibleSignature = (executorKind: MaintenanceExecutorKind | string | null, criticalityCode: string | null | undefined): boolean =>
  executorKind === 'EXTERNAL_PROVIDER' || (Boolean(criticalityCode) && STRICT_CRITICALITIES.has(String(criticalityCode).toUpperCase()));

/** Verificacion post-reparacion obligatoria solo para activos criticos y altos. */
export const requiresPostRepairVerification = (criticalityCode: string | null | undefined): boolean =>
  Boolean(criticalityCode) && STRICT_CRITICALITIES.has(String(criticalityCode).toUpperCase());

export const todayIso = (): string => toIso(new Date());
