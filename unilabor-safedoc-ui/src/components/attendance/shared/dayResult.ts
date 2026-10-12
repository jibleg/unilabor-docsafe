/** Resultados de un dia (coinciden con attendance.daily_results.day_result) y su presentacion. */
export type DayResultCode =
  | 'present'
  | 'late'
  | 'absent'
  | 'partial_absence'
  | 'early_departure'
  | 'incident'
  | 'rest_day'
  | 'holiday'
  | 'no_schedule';

export const DAY_RESULT_LABEL: Record<DayResultCode, string> = {
  present: 'Asistencia',
  late: 'Retardo',
  absent: 'Falta',
  partial_absence: 'Falta parcial',
  early_departure: 'Salida anticipada',
  incident: 'Incidencia',
  rest_day: 'Descanso',
  holiday: 'Festivo',
  no_schedule: 'Sin horario',
};

/** Colores semanticos (nunca se indica un estado solo con color: siempre va con texto). */
export const DAY_RESULT_COLOR: Record<DayResultCode, string> = {
  present: '#0ca30c',
  late: '#d98b00',
  absent: '#d03b3b',
  partial_absence: '#d03b3b',
  early_departure: '#0284c7',
  incident: '#7c3aed',
  rest_day: '#898781',
  holiday: '#898781',
  no_schedule: '#898781',
};

export const COMMITMENT_LEVEL_LABEL: Record<string, string> = {
  exemplary: 'Ejemplar',
  committed: 'Comprometido',
  regular: 'Regular',
  attention: 'Requiere atención',
  no_data: 'Sin datos',
};

export const COMMITMENT_LEVEL_COLOR: Record<string, string> = {
  exemplary: '#0ca30c',
  committed: '#034898',
  regular: '#d98b00',
  attention: '#d03b3b',
  no_data: '#898781',
};
