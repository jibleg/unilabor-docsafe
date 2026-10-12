/**
 * Parametros del modulo Control de Asistencias: definicion (default, rango,
 * valores permitidos) y validacion. PURO: sin acceso a BD. La persistencia vive
 * en `attendance-settings.service.ts` (tabla attendance.settings, que solo
 * guarda lo que difiere del default).
 */

export type SettingType = 'integer' | 'enum' | 'time' | 'text';

export interface SettingDefinition {
  key: keyof AttendanceSettings;
  type: SettingType;
  default: number | string;
  label: string;
  description: string;
  group: 'punctuality' | 'calendar' | 'devices' | 'vacations' | 'commitment';
  unit?: string;
  min?: number;
  max?: number;
  options?: readonly string[];
}

export interface AttendanceSettings {
  tolerance_min: number;
  late_until_min: number;
  late_per_absence: number;
  late_period: 'month' | 'fortnight' | 'week';
  early_exit_min: number;
  min_workday_hours: number;
  missing_segment_result: 'partial_absence' | 'absent';
  missing_exit_result: 'absent' | 'present';
  cutoff_time: string;
  punch_debounce_seconds: number;
  max_shifts_per_day: number;
  week_start: 'sunday' | 'monday';
  timezone: string;
  clock_drift_max_min: number;
  agent_offline_min: number;
  vacation_validity_months: number;
  vacations_no_balance: 'warn' | 'block' | 'allow';
  weight_attendance: number;
  weight_punctuality: number;
  weight_exits: number;
  commitment_exemplary: number;
  commitment_attention: number;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: 'tolerance_min', type: 'integer', default: 10, min: 0, max: 120, unit: 'min', group: 'punctuality',
    label: 'Tolerancia de entrada',
    description: 'Minutos de gracia despues de la hora de entrada antes de contar un retardo.',
  },
  {
    key: 'late_until_min', type: 'integer', default: 30, min: 1, max: 480, unit: 'min', group: 'punctuality',
    label: 'Retardo maximo',
    description: 'Si la entrada llega mas tarde que esto, el dia cuenta como falta.',
  },
  {
    key: 'late_per_absence', type: 'integer', default: 3, min: 0, max: 30, group: 'punctuality',
    label: 'Retardos por falta',
    description: 'Cada N retardos dentro del periodo se cuenta una falta (0 = desactivado).',
  },
  {
    key: 'late_period', type: 'enum', default: 'month', options: ['month', 'fortnight', 'week'], group: 'punctuality',
    label: 'Periodo de retardos',
    description: 'Ventana en la que se acumulan los retardos: mes, quincena o semana.',
  },
  {
    key: 'early_exit_min', type: 'integer', default: 15, min: 0, max: 480, unit: 'min', group: 'punctuality',
    label: 'Salida anticipada',
    description: 'Minutos antes de la hora de salida a partir de los cuales se registra salida anticipada.',
  },
  {
    key: 'min_workday_hours', type: 'integer', default: 4, min: 1, max: 12, unit: 'h', group: 'punctuality',
    label: 'Jornada minima',
    description: 'Si el dia suma menos horas que esto, cuenta como falta.',
  },
  {
    key: 'missing_segment_result', type: 'enum', default: 'partial_absence', options: ['partial_absence', 'absent'], group: 'punctuality',
    label: 'Tramo sin checar',
    description: 'Resultado cuando falta un tramo de un horario partido: falta parcial o falta completa.',
  },
  {
    key: 'missing_exit_result', type: 'enum', default: 'absent', options: ['absent', 'present'], group: 'punctuality',
    label: 'Entrada sin salida',
    description: 'Resultado cuando hay entrada pero no salida: falta, o asistencia (queda marcada para revision).',
  },
  {
    key: 'cutoff_time', type: 'time', default: '04:00', group: 'calendar',
    label: 'Corte del dia',
    description: 'Hora a la que inicia el dia laboral; las checadas antes de esta hora cuentan para el dia anterior.',
  },
  {
    key: 'punch_debounce_seconds', type: 'integer', default: 60, min: 0, max: 600, unit: 's', group: 'devices',
    label: 'Ventana de rebote',
    description: 'Checadas del mismo colaborador dentro de esta ventana se consideran una sola.',
  },
  {
    key: 'max_shifts_per_day', type: 'integer', default: 3, min: 1, max: 6, group: 'calendar',
    label: 'Turnos por dia',
    description: 'Maximo de turnos (tramos) que puede tener un colaborador el mismo dia.',
  },
  {
    key: 'week_start', type: 'enum', default: 'sunday', options: ['sunday', 'monday'], group: 'calendar',
    label: 'Inicio de semana',
    description: 'Dia en que inicia la semana para recurrencias, calendario y reportes.',
  },
  {
    key: 'timezone', type: 'text', default: 'America/Mexico_City', group: 'calendar',
    label: 'Zona horaria',
    description: 'Zona horaria de las sucursales (nombre IANA).',
  },
  {
    key: 'clock_drift_max_min', type: 'integer', default: 10, min: 1, max: 120, unit: 'min', group: 'devices',
    label: 'Desfase de reloj',
    description: 'Desfase maximo entre la hora del reloj y la del servidor antes de enviar la checada a revision.',
  },
  {
    key: 'agent_offline_min', type: 'integer', default: 15, min: 2, max: 1440, unit: 'min', group: 'devices',
    label: 'Agente sin latido',
    description: 'Minutos sin latido tras los cuales un agente o reloj se considera fuera de linea.',
  },
  {
    key: 'vacation_validity_months', type: 'integer', default: 18, min: 6, max: 36, unit: 'meses', group: 'vacations',
    label: 'Vigencia de vacaciones',
    description: 'Meses desde el aniversario durante los cuales se pueden disfrutar las vacaciones del periodo.',
  },
  {
    key: 'vacations_no_balance', type: 'enum', default: 'warn', options: ['warn', 'block', 'allow'], group: 'vacations',
    label: 'Vacaciones sin saldo',
    description: 'Que hacer cuando una solicitud de vacaciones excede el saldo: advertir, bloquear o permitir.',
  },
  {
    key: 'weight_attendance', type: 'integer', default: 40, min: 0, max: 100, unit: '%', group: 'commitment',
    label: 'Peso de asistencia',
    description: 'Peso de la asistencia en el indice de compromiso.',
  },
  {
    key: 'weight_punctuality', type: 'integer', default: 40, min: 0, max: 100, unit: '%', group: 'commitment',
    label: 'Peso de puntualidad',
    description: 'Peso de la puntualidad en el indice de compromiso.',
  },
  {
    key: 'weight_exits', type: 'integer', default: 20, min: 0, max: 100, unit: '%', group: 'commitment',
    label: 'Peso de salidas',
    description: 'Peso de las salidas completas en el indice de compromiso.',
  },
  {
    key: 'commitment_exemplary', type: 'integer', default: 95, min: 50, max: 100, unit: '%', group: 'commitment',
    label: 'Umbral ejemplar',
    description: 'Indice a partir del cual el nivel es "ejemplar".',
  },
  {
    key: 'commitment_attention', type: 'integer', default: 70, min: 0, max: 100, unit: '%', group: 'commitment',
    label: 'Umbral de atencion',
    description: 'Indice por debajo del cual el nivel es "requiere atencion".',
  },
] as const;

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = SETTING_DEFINITIONS.reduce(
  (accumulator, definition) => ({ ...accumulator, [definition.key]: definition.default }),
  {} as AttendanceSettings,
);

export const getSettingDefinition = (key: string): SettingDefinition | undefined =>
  SETTING_DEFINITIONS.find((definition) => definition.key === key);

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** Valida un valor contra la definicion. Devuelve el valor normalizado o lanza Error con mensaje publico. */
export const validateSettingValue = (key: string, rawValue: unknown): number | string => {
  const definition = getSettingDefinition(key);
  if (!definition) {
    throw new Error(`Parametro desconocido: ${key}`);
  }

  switch (definition.type) {
    case 'integer': {
      const value = typeof rawValue === 'string' && rawValue.trim() !== '' ? Number(rawValue) : rawValue;
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`${definition.label}: debe ser un numero entero.`);
      }
      if (definition.min !== undefined && value < definition.min) {
        throw new Error(`${definition.label}: el minimo es ${definition.min}.`);
      }
      if (definition.max !== undefined && value > definition.max) {
        throw new Error(`${definition.label}: el maximo es ${definition.max}.`);
      }
      return value;
    }
    case 'enum': {
      if (typeof rawValue !== 'string' || !definition.options?.includes(rawValue)) {
        throw new Error(`${definition.label}: valor no permitido.`);
      }
      return rawValue;
    }
    case 'time': {
      if (typeof rawValue !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(rawValue)) {
        throw new Error(`${definition.label}: usa el formato HH:MM.`);
      }
      return rawValue;
    }
    case 'text': {
      if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        throw new Error(`${definition.label}: no puede estar vacio.`);
      }
      if (key === 'timezone' && !isValidTimeZone(rawValue.trim())) {
        throw new Error(`${definition.label}: zona horaria no valida.`);
      }
      return rawValue.trim();
    }
  }
};

/** Mezcla los valores guardados sobre los defaults, ignorando claves desconocidas o invalidas. */
export const mergeSettings = (stored: Record<string, unknown>): AttendanceSettings => {
  const merged: Record<string, unknown> = { ...DEFAULT_ATTENDANCE_SETTINGS };
  for (const [key, value] of Object.entries(stored)) {
    if (!getSettingDefinition(key)) continue;
    try {
      merged[key] = validateSettingValue(key, value);
    } catch {
      // valor guardado invalido: se conserva el default
    }
  }
  return merged as unknown as AttendanceSettings;
};
