import type { AuthorizedPersonnelAlert, AuthorizedPersonnelListing, AuthorizedPersonnelRow } from '../types/models';

/** Filtros del Listado de personal autorizado (se aplican en el cliente). */
export interface AuthorizedPersonnelFilters {
  search: string;
  branch: string;
  area: string;
  focus: AuthorizedPersonnelFocus;
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

export const EMPTY_AUTHORIZED_FILTERS: AuthorizedPersonnelFilters = { search: '', branch: '', area: '', focus: 'ALL' };

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
  return listing.rows.filter(
    (row) =>
      (!filters.branch || row.branch_name === filters.branch) &&
      (!filters.area || row.area_name === filters.area) &&
      matchesFocus(row, filters.focus, listing.cutoff_date) &&
      (!needle || normalize(`${row.full_name} ${row.position_name ?? ''} ${row.position_code ?? ''} ${row.employee_code}`).includes(needle)),
  );
};

export const uniqueValues = (values: Array<string | null>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));

export const ALERT_TONE_CLASS: Record<AuthorizedPersonnelRow['alert_tone'], string> = {
  red: 'bg-rose-100 text-rose-800',
  amber: 'bg-amber-100 text-amber-800',
  none: 'bg-emerald-50 text-emerald-700',
};
