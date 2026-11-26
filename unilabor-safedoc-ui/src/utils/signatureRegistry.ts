import type { SignatureRegistryListing, SignatureRegistryRow, SignatureRegistryStatus, SignatureRegistryTone } from '../types/models';

/** Filtros del Registro de firmas autorizadas (se aplican en el cliente). */
export interface SignatureRegistryFilters {
  search: string;
  branch: string;
  /** '' = todas; 'none' = sin disciplina; si no, el id de la disciplina como texto. */
  discipline: string;
  /** Estados a mostrar; vacío = todos los estados de filas vigentes. */
  statuses: SignatureRegistryStatus[];
  /** Muestra también las filas históricas (DADA DE BAJA). */
  showRetired: boolean;
}

export const NO_DISCIPLINE = 'none';

/** Estados de una fila vigente (DADA DE BAJA se controla con el interruptor). */
export const ACTIVE_STATUSES: SignatureRegistryStatus[] = ['VIGENTE', 'POR_VENCER', 'VENCIDA', 'SIN_EVALUACION', 'INCOMPLETA'];

export const EMPTY_SIGNATURE_FILTERS: SignatureRegistryFilters = { search: '', branch: '', discipline: '', statuses: [], showRetired: false };

export const STATUS_LABEL: Record<SignatureRegistryStatus, string> = {
  DADA_DE_BAJA: 'Dada de baja',
  INCOMPLETA: 'Incompleta',
  SIN_EVALUACION: 'Sin evaluación',
  VENCIDA: 'Vencida',
  POR_VENCER: 'Por vencer',
  VIGENTE: 'Vigente',
};

export const STATUS_TONE_CLASS: Record<SignatureRegistryTone, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-800',
  gray: 'bg-slate-200 text-slate-600',
};

export const STATUS_TONE: Record<SignatureRegistryStatus, SignatureRegistryTone> = {
  DADA_DE_BAJA: 'gray',
  INCOMPLETA: 'red',
  SIN_EVALUACION: 'red',
  VENCIDA: 'red',
  POR_VENCER: 'amber',
  VIGENTE: 'green',
};

/** Opciones del filtro de estado (con su color), en el orden de la cascada. */
export const STATUS_OPTIONS = ACTIVE_STATUSES.map((status) => ({ value: status, label: STATUS_LABEL[status], className: STATUS_TONE_CLASS[STATUS_TONE[status]] }));

export const hasActiveFilters = (filters: SignatureRegistryFilters): boolean =>
  Boolean(filters.search || filters.branch || filters.discipline || filters.statuses.length > 0 || filters.showRetired);

/** Texto corto de los filtros aplicados, para imprimirlo en el PDF como aviso de extracto. */
export const describeFilters = (filters: SignatureRegistryFilters, listing: SignatureRegistryListing): string => {
  const parts: string[] = [];
  if (filters.branch) parts.push(`Sucursal ${filters.branch}`);
  if (filters.discipline === NO_DISCIPLINE) parts.push('Sin disciplina');
  else if (filters.discipline) {
    const discipline = listing.disciplines.find((item) => String(item.id) === filters.discipline);
    if (discipline) parts.push(`Disciplina ${discipline.name}`);
  }
  if (filters.statuses.length > 0) parts.push(`Estado ${filters.statuses.map((status) => STATUS_LABEL[status]).join(' / ')}`);
  parts.push(filters.showRetired ? 'Con dadas de baja' : 'Sin dadas de baja');
  if (filters.search.trim()) parts.push(`Búsqueda "${filters.search.trim()}"`);
  return parts.join(' · ');
};

const normalize = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const filterSignatureRegistry = (listing: SignatureRegistryListing, filters: SignatureRegistryFilters): SignatureRegistryRow[] => {
  const needle = normalize(filters.search.trim());
  const statuses = new Set(filters.statuses);
  return listing.rows.filter((row) => {
    if (row.retired && !filters.showRetired) return false;
    if (filters.branch && row.branch_name !== filters.branch) return false;
    if (filters.discipline === NO_DISCIPLINE ? row.discipline_id !== null : filters.discipline && String(row.discipline_id) !== filters.discipline) return false;
    // El filtro de estado solo acota las filas vigentes; las dadas de baja las rige el interruptor.
    if (statuses.size > 0 && !row.retired && !statuses.has(row.status)) return false;
    return !needle || normalize(`${row.full_name} ${row.position_name} ${row.position_code} ${row.employee_code} ${row.signing_scope_text ?? ''}`).includes(needle);
  });
};

export const uniqueValues = (values: Array<string | null>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));
