import type { CommitmentLevel, CommitmentWeights, LiveStatus } from '../../../api/service.api-attendance-boards';
import { COMMITMENT_LEVEL_COLOR } from '../shared/dayResult';

/** Helpers puros de los tableros de asistencia (sin React, probados con vitest). */

export const DEFAULT_WEIGHTS: CommitmentWeights = { attendance: 40, punctuality: 40, exits: 20, exemplary: 95, attention: 70 };

export const GOOD_COLOR = '#0ca30c';
export const WARN_COLOR = '#d98b00';
export const BAD_COLOR = '#d03b3b';
export const MUTED_COLOR = '#898781';

/** Color de un porcentaje segun los umbrales del contrato (ejemplar / atencion). */
export const percentColor = (value: number | null | undefined, weights: CommitmentWeights = DEFAULT_WEIGHTS): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return MUTED_COLOR;
  if (value >= weights.exemplary) return GOOD_COLOR;
  if (value >= weights.attention) return WARN_COLOR;
  return BAD_COLOR;
};

export const levelColor = (level: CommitmentLevel | string | undefined): string =>
  COMMITMENT_LEVEL_COLOR[level ?? 'no_data'] ?? MUTED_COLOR;

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)}%`;

export const clampPercent = (value: number | null | undefined): number =>
  value === null || value === undefined || !Number.isFinite(value) ? 0 : Math.min(100, Math.max(0, value));

export const formatNumber = (value: number | null | undefined, decimals = 0): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: decimals });

export const formatMinutes = (minutes: number | null | undefined): string => {
  if (!minutes || minutes <= 0) return '0 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

export const LIVE_STATUS_META: Record<LiveStatus, { label: string; color: string; order: number }> = {
  late: { label: 'Con retardo', color: WARN_COLOR, order: 0 },
  missing: { label: 'Sin checar', color: BAD_COLOR, order: 1 },
  present: { label: 'Presente', color: GOOD_COLOR, order: 2 },
  upcoming: { label: 'Por llegar', color: '#0284c7', order: 3 },
  left: { label: 'Ya salió', color: '#034898', order: 4 },
  incident: { label: 'Incidencia', color: '#7c3aed', order: 5 },
  rest: { label: 'Descanso', color: MUTED_COLOR, order: 6 },
  no_schedule: { label: 'Sin horario', color: MUTED_COLOR, order: 7 },
};

/** Orden por estado (mismo del contrato) y luego por nombre; no muta la entrada. */
export const sortPeopleByStatus = <T extends { status: LiveStatus; full_name: string }>(people: T[]): T[] =>
  [...people].sort(
    (a, b) =>
      (LIVE_STATUS_META[a.status]?.order ?? 99) - (LIVE_STATUS_META[b.status]?.order ?? 99) ||
      a.full_name.localeCompare(b.full_name, 'es'),
  );

export const PERIOD_OPTIONS = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'fortnight', label: 'Quincena' },
  { value: 'month', label: 'Mes' },
  { value: 'bimester', label: 'Bimestre' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'semester', label: 'Semestre' },
  { value: 'year', label: 'Año' },
  { value: 'custom', label: 'Rango' },
] as const;

const PERIOD_VALUES: string[] = PERIOD_OPTIONS.map((option) => option.value);

export const parsePeriod = (value: string | null): (typeof PERIOD_OPTIONS)[number]['value'] =>
  (PERIOD_VALUES.includes(value ?? '') ? value : 'month') as (typeof PERIOD_OPTIONS)[number]['value'];

export const isIsoDate = (value: string | null | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Maximo de barras visibles con altura minima legible: devuelve el tope del eje Y. */
export const niceMax = (values: number[]): number => Math.max(1, ...values.map((v) => (Number.isFinite(v) ? v : 0)));

export const REVIEW_REASON_LABEL: Record<string, string> = {
  pending_review: 'Checadas por revisar',
  missing_exit: 'Sin salida registrada',
};

/** Etiqueta de una diferencia contra el equipo: '+3 pts' / '-2 pts' / 'igual'. */
export const formatDifference = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return 'igual al equipo';
  return `${value > 0 ? '+' : ''}${Math.round(value)} pts`;
};

export const MEDALS = ['#d4a017', '#9ca3af', '#b87333'];
