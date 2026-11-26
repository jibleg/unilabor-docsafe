import type {
  RhAuthorizationLevel,
  SignatureRegistryListing,
  SignatureRegistryRow,
  SignatureRegistryStatus,
  SignatureRegistryTone,
} from '../types/models';

/** Filtros del Registro de firmas autorizadas (se aplican en el cliente). */
export interface SignatureRegistryFilters {
  search: string;
  branch: string;
  /** Disciplinas a mostrar (ids como texto; NO_DISCIPLINE = sin disciplina); vacío = todas. */
  disciplines: string[];
  /** Estados a mostrar; vacío = todos los estados de filas vigentes. */
  statuses: SignatureRegistryStatus[];
  /** Niveles de autorización (ids del catálogo); vacío = todos. */
  levelIds: number[];
  /** Puestos (ids); vacío = todos. */
  positionIds: number[];
  /** Muestra también las filas históricas (DADA DE BAJA). */
  showRetired: boolean;
}

export const NO_DISCIPLINE = 'none';

/** Estados de una fila vigente (DADA DE BAJA se controla con el interruptor). */
export const ACTIVE_STATUSES: SignatureRegistryStatus[] = ['VIGENTE', 'POR_VENCER', 'VENCIDA', 'SIN_EVALUACION', 'INCOMPLETA'];

export const EMPTY_SIGNATURE_FILTERS: SignatureRegistryFilters = {
  search: '',
  branch: '',
  disciplines: [],
  statuses: [],
  levelIds: [],
  positionIds: [],
  showRetired: false,
};

/** Niveles que se ofrecen en el filtro: los activos y los inactivos que alguna fila aún tenga. */
export const filterableLevels = (listing: SignatureRegistryListing): RhAuthorizationLevel[] => {
  const inUse = new Set(listing.rows.map((row) => row.authorization_level_id));
  return listing.authorization_levels.filter((level) => level.is_active || inUse.has(level.id)).sort((a, b) => a.level_no - b.level_no);
};

/** Puestos presentes en el registro, por nombre. */
export const filterablePositions = (listing: SignatureRegistryListing): Array<{ id: number; name: string }> => {
  const byId = new Map<number, string>();
  for (const row of listing.rows) byId.set(row.position_id, row.position_name);
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
};

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
  Boolean(
    filters.search ||
      filters.branch ||
      filters.disciplines.length > 0 ||
      filters.statuses.length > 0 ||
      filters.levelIds.length > 0 ||
      filters.positionIds.length > 0 ||
      filters.showRetired,
  );

const normalize = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const filterSignatureRegistry = (listing: SignatureRegistryListing, filters: SignatureRegistryFilters): SignatureRegistryRow[] => {
  const needle = normalize(filters.search.trim());
  const statuses = new Set(filters.statuses);
  const levelIds = new Set(filters.levelIds);
  const disciplines = new Set(filters.disciplines);
  const positionIds = new Set(filters.positionIds);
  return listing.rows.filter((row) => {
    if (row.retired && !filters.showRetired) return false;
    if (filters.branch && row.branch_name !== filters.branch) return false;
    if (levelIds.size > 0 && (row.authorization_level_id === null || !levelIds.has(row.authorization_level_id))) return false;
    if (positionIds.size > 0 && !positionIds.has(row.position_id)) return false;
    if (disciplines.size > 0 && !disciplines.has(row.discipline_id === null ? NO_DISCIPLINE : String(row.discipline_id))) return false;
    // El filtro de estado solo acota las filas vigentes; las dadas de baja las rige el interruptor.
    if (statuses.size > 0 && !row.retired && !statuses.has(row.status)) return false;
    return !needle || normalize(`${row.full_name} ${row.position_name} ${row.position_code} ${row.employee_code} ${row.signing_scope_text ?? ''}`).includes(needle);
  });
};

export const uniqueValues = (values: Array<string | null>): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));
