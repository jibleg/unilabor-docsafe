import type { AuthorizedPersonnelAlert, AuthorizedPersonnelListing, AuthorizedPersonnelRow, RhAuthorizationLevel } from '../types/models';

/** Filtros del Listado de personal autorizado (se aplican en el cliente). */
export interface AuthorizedPersonnelFilters {
  search: string;
  branch: string;
  area: string;
  focus: AuthorizedPersonnelFocus;
  /** Niveles de autorizacion (ids del catalogo) a mostrar; vacio = todos. */
  levelIds: number[];
}

/** Enfoques del tablero: cada renglón del TABLERO del formato filtra la tabla. */
export type AuthorizedPersonnelFocus =
  | 'ALL'
  | 'COMPETENT'
  | 'AUTHORIZED'
  | 'AUTHORIZED_NOT_COMPETENT'
  | 'WITHOUT_DATE'
  | 'EXPIRED'
  | 'EXPIRING'
  | 'RELEASE_LEVEL'
  | 'PENDING'
  | 'VALID'
  | 'RECENT'
  | 'EXPIRING_30';

export const EMPTY_AUTHORIZED_FILTERS: AuthorizedPersonnelFilters = { search: '', branch: '', area: '', focus: 'ALL', levelIds: [] };

export const hasActiveFilters = (filters: AuthorizedPersonnelFilters): boolean =>
  Boolean(filters.search || filters.branch || filters.area || filters.focus !== 'ALL' || filters.levelIds.length > 0);

/** Texto corto de los filtros aplicados, para imprimirlo en el PDF como aviso de extracto. */
export const describeFilters = (filters: AuthorizedPersonnelFilters, levels: RhAuthorizationLevel[]): string => {
  const parts: string[] = [];
  if (filters.branch) parts.push(`Sede ${filters.branch}`);
  if (filters.area) parts.push(`Área ${filters.area}`);
  if (filters.focus !== 'ALL') parts.push(QUICK_FILTERS.find((quick) => quick.focus === filters.focus)?.label ?? FOCUS_LABELS[filters.focus]);
  if (filters.levelIds.length > 0) {
    const names = levels.filter((level) => filters.levelIds.includes(level.id)).map((level) => `${level.level_no} ${level.name}`);
    parts.push(`Nivel ${names.join(' / ')}`);
  }
  if (filters.search.trim()) parts.push(`Búsqueda "${filters.search.trim()}"`);
  return parts.join(' · ');
};

/** Etiquetas de los enfoques del TABLERO que no tienen botón de búsqueda rápida. */
const FOCUS_LABELS: Record<AuthorizedPersonnelFocus, string> = {
  ALL: '',
  COMPETENT: 'Competentes',
  AUTHORIZED: 'Autorizados',
  AUTHORIZED_NOT_COMPETENT: 'Autorizados sin ser competentes',
  WITHOUT_DATE: 'Sin fecha de última evaluación',
  EXPIRED: 'Vencidos',
  EXPIRING: 'Por vencer',
  RELEASE_LEVEL: 'Nivel 4 · liberan informes',
  PENDING: 'En proceso',
  VALID: 'Vigentes',
  RECENT: 'Autorizados recientemente',
  EXPIRING_30: 'Por vencer < 1 mes',
};

/** En proceso: la evaluación del puesto está en captura / firma o espera la autorización. */
const PENDING_ALERTS: AuthorizedPersonnelAlert[] = ['PENDIENTE_AUTORIZACION', 'EN_CAPTURA'];

/** Días hacia atrás que cuentan como "autorizado recientemente". */
export const RECENT_AUTHORIZATION_DAYS = 30;

/** Búsqueda rápida: botones sobre la tabla, en este orden. */
export const QUICK_FILTERS: Array<{ focus: AuthorizedPersonnelFocus; label: string; hint: string; idle: string; active: string }> = [
  { focus: 'VALID', label: 'Vigentes', hint: 'Autorizados con la vigencia en curso', idle: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100', active: 'bg-emerald-600 text-white' },
  { focus: 'PENDING', label: 'En proceso', hint: 'Evaluación en captura o en firma, o pendiente de autorización', idle: 'bg-sky-50 text-sky-800 hover:bg-sky-100', active: 'bg-sky-600 text-white' },
  { focus: 'RECENT', label: 'Autorizados recientemente', hint: `Autorizados en los últimos ${RECENT_AUTHORIZATION_DAYS} días`, idle: 'bg-violet-50 text-violet-800 hover:bg-violet-100', active: 'bg-violet-600 text-white' },
  { focus: 'EXPIRING', label: 'Por vencer < 2 meses', hint: 'Les quedan 60 días o menos de vigencia', idle: 'bg-amber-50 text-amber-800 hover:bg-amber-100', active: 'bg-amber-500 text-white' },
  { focus: 'EXPIRING_30', label: 'Por vencer < 1 mes', hint: 'Les quedan 30 días o menos de vigencia', idle: 'bg-orange-50 text-orange-800 hover:bg-orange-100', active: 'bg-orange-600 text-white' },
  { focus: 'EXPIRED', label: 'Vencidos', hint: 'Vigencia vencida: enviar a recapacitación', idle: 'bg-rose-50 text-rose-800 hover:bg-rose-100', active: 'bg-rose-600 text-white' },
];

const daysSince = (isoDate: string, today: string): number =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${isoDate}T00:00:00Z`)) / 86_400_000);

const matchesFocus = (row: AuthorizedPersonnelRow, focus: AuthorizedPersonnelFocus, today: string): boolean => {
  switch (focus) {
    case 'COMPETENT':
      return row.competent === true;
    case 'AUTHORIZED':
      return row.authorized === true;
    case 'AUTHORIZED_NOT_COMPETENT':
      return row.authorized === true && row.competent !== true;
    case 'WITHOUT_DATE':
      return !row.last_evaluation_date;
    case 'EXPIRED':
      return row.alert === 'VENCIDA';
    case 'EXPIRING':
      return row.alert === 'POR_VENCER';
    case 'EXPIRING_30':
      return row.alert === 'POR_VENCER' && row.days_remaining !== null && row.days_remaining <= 30;
    case 'VALID':
      return row.authorized === true && row.days_remaining !== null && row.days_remaining >= 0;
    case 'RECENT':
      return row.authorized === true && row.authorized_at !== null && daysSince(row.authorized_at, today) <= RECENT_AUTHORIZATION_DAYS;
    case 'RELEASE_LEVEL':
      return row.authorized === true && row.authorization_level_no === 4;
    case 'PENDING':
      return PENDING_ALERTS.includes(row.alert);
    default:
      return true;
  }
};

const normalize = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const filterAuthorizedPersonnel = (listing: AuthorizedPersonnelListing, filters: AuthorizedPersonnelFilters): AuthorizedPersonnelRow[] => {
  const needle = normalize(filters.search.trim());
  const levelIds = new Set(filters.levelIds);
  return listing.rows.filter(
    (row) =>
      (!filters.branch || row.branch_name === filters.branch) &&
      (!filters.area || row.area_name === filters.area) &&
      (levelIds.size === 0 || (row.authorization_level_id !== null && levelIds.has(row.authorization_level_id))) &&
      matchesFocus(row, filters.focus, listing.cutoff_date) &&
      (!needle || normalize(`${row.full_name} ${row.position_name ?? ''} ${row.position_code ?? ''} ${row.employee_code}`).includes(needle)),
  );
};

/**
 * Niveles que se ofrecen en el filtro: los activos del catalogo y los inactivos
 * que alguna fila todavia tenga asignados (para que esas filas sigan filtrables).
 */
export const filterableAuthorizationLevels = (listing: AuthorizedPersonnelListing): RhAuthorizationLevel[] => {
  const inUse = new Set(listing.rows.map((row) => row.authorization_level_id));
  return listing.authorization_levels.filter((level) => level.is_active || inUse.has(level.id)).sort((a, b) => a.level_no - b.level_no);
};

export const uniqueValues = (values: Array<string | null>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));

export const ALERT_TONE_CLASS: Record<AuthorizedPersonnelRow['alert_tone'], string> = {
  red: 'bg-rose-100 text-rose-800',
  amber: 'bg-amber-100 text-amber-800',
  none: 'bg-emerald-50 text-emerald-700',
};
