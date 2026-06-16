/**
 * Utilidades de paginación del lado servidor.
 *
 * Contrato uniforme de respuesta para todos los listados paginados:
 *   {
 *     data: T[],
 *     pagination: { page, limit, total, totalPages }
 *   }
 *
 * Uso típico en un service:
 *   const { page, limit, offset } = resolvePagination(options);
 *   const [dataResult, countResult] = await Promise.all([
 *     pool.query(`... LIMIT $n OFFSET $n+1`, [...values, limit, offset]),
 *     pool.query(`SELECT COUNT(*) AS total ...`, values),
 *   ]);
 *   return buildPaginatedResult(dataResult.rows, countResult.rows[0]?.total, page, limit);
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginationInput {
  page?: unknown;
  limit?: unknown;
}

export interface ResolvedPagination {
  page: number;
  limit: number;
  offset: number;
}

/** Límite máximo de filas por página, uniforme para todos los listados. */
export const MAX_PAGE_SIZE = 100;

/** Límite por defecto cuando el cliente no especifica uno. */
export const DEFAULT_PAGE_SIZE = 20;

const asPositiveInt = (value: unknown, fallbackValue: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
};

/**
 * Indica si el cliente pidió paginación explícita (envió `page` o `limit`).
 * La paginación es opt-in: si no se piden, los listados devuelven todo (compat).
 */
export const isPaginationRequested = (input: PaginationInput = {}): boolean =>
  input.page !== undefined || input.limit !== undefined;

/**
 * Normaliza los parámetros de paginación recibidos del cliente y calcula el offset.
 * `page` y `limit` siempre quedan acotados (page >= 1; 1 <= limit <= maxLimit).
 */
export const resolvePagination = (
  input: PaginationInput = {},
  options: { defaultLimit?: number; maxLimit?: number } = {}
): ResolvedPagination => {
  const defaultLimit = options.defaultLimit ?? DEFAULT_PAGE_SIZE;
  const maxLimit = options.maxLimit ?? MAX_PAGE_SIZE;

  const page = asPositiveInt(input.page, 1);
  const limit = Math.min(asPositiveInt(input.limit, defaultLimit), maxLimit);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

export interface SearchClause {
  /** Fragmento SQL listo para combinar con AND (vacío si no hay término). */
  clause: string;
  /** Valores posicionales generados (vacío si no hay término). */
  values: string[];
}

/**
 * Construye un fragmento `(col1 ILIKE $n OR col2 ILIKE $n OR ...)` para una
 * búsqueda de texto libre sobre varias columnas. Usa un único parámetro `%term%`
 * compartido entre todas las columnas.
 *
 * @param columns  columnas SQL ya calificadas (ej. `a.name`, `c.name`).
 * @param term     término de búsqueda (se ignora si es vacío/espacios).
 * @param paramOffset  cantidad de parámetros posicionales ya usados antes de éste.
 */
export const buildIlikeSearch = (
  columns: string[],
  term: unknown,
  paramOffset = 0
): SearchClause => {
  const normalized = typeof term === 'string' ? term.trim() : '';
  if (normalized.length === 0 || columns.length === 0) {
    return { clause: '', values: [] };
  }

  const placeholder = `$${paramOffset + 1}`;
  const clause = `(${columns.map((column) => `${column} ILIKE ${placeholder}`).join(' OR ')})`;
  return { clause, values: [`%${normalized}%`] };
};

/** Construye la respuesta paginada uniforme a partir de las filas y el total. */
export const buildPaginatedResult = <T>(
  data: T[],
  total: unknown,
  page: number,
  limit: number
): PaginatedResult<T> => {
  const parsedTotal = Number.parseInt(String(total ?? 0), 10);
  const safeTotal = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : 0;
  const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / limit) : 1;

  return {
    data,
    pagination: {
      page,
      limit,
      total: safeTotal,
      totalPages,
    },
  };
};
