import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageResult, PaginationMeta } from '../api/service';

export interface PaginatedListQuery {
  page: number;
  limit: number;
  search: string;
  filters: Record<string, string>;
}

export interface UsePaginatedListResult<T> {
  items: T[];
  pagination: PaginationMeta;
  page: number;
  setPage: (page: number) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
  reload: () => void;
  /**
   * Actualiza los items en memoria sin refetch (p. ej. tras una mutación puntual
   * de una fila), evitando recargar toda la lista.
   */
  updateItems: (updater: (items: T[]) => T[]) => void;
}

interface UsePaginatedListOptions {
  pageSize?: number;
  debounceMs?: number;
  onError?: (error: unknown) => void;
  /**
   * Filtros adicionales (p. ej. unidad/area) que se envian al `fetcher` dentro de
   * `query.filters`. Al cambiar cualquier filtro se vuelve a la primera pagina y
   * se refetch una sola vez.
   */
  filters?: Record<string, string>;
  /**
   * Estado inicial para restaurar página/búsqueda al montar (p. ej. al volver de
   * una vista de detalle). No dispara reseteo de página en el primer render.
   */
  initialPage?: number;
  initialSearch?: string;
}

/**
 * Maneja paginación del lado servidor: estado de página, búsqueda con debounce,
 * y refetch automático. El `fetcher` recibe `{page, limit, search}` y devuelve el
 * contrato `{data, pagination}`. Reinicia a la página 1 cuando cambia la búsqueda.
 */
export function usePaginatedList<T>(
  fetcher: (query: PaginatedListQuery) => Promise<PageResult<T>>,
  options: UsePaginatedListOptions = {},
): UsePaginatedListResult<T> {
  const { pageSize = 20, debounceMs = 350, onError, filters = {}, initialPage = 1, initialSearch = '' } = options;
  const filtersKey = JSON.stringify(filters);

  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: initialPage,
    limit: pageSize,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetcherRef = useRef(fetcher);
  const onErrorRef = useRef(onError);
  const filtersRef = useRef(filters);
  // Guards por comparacion de valor (no booleano de "primer render"): asi el
  // remonte de StrictMode en dev no resetea la pagina/busqueda restaurada.
  const lastFiltersKey = useRef(filtersKey);
  const lastSearch = useRef(search);

  // Mantener las refs sincronizadas fuera del render (evita usar callbacks obsoletos).
  useEffect(() => {
    fetcherRef.current = fetcher;
    onErrorRef.current = onError;
    filtersRef.current = filters;
  });

  // Al cambiar los filtros (cambio real de valor): volver a la primera pagina y
  // forzar un unico refetch.
  useEffect(() => {
    if (lastFiltersKey.current === filtersKey) {
      return;
    }
    lastFiltersKey.current = filtersKey;
    setPage(1);
    setRefreshKey((key) => key + 1);
  }, [filtersKey]);

  // Debounce de la búsqueda. Solo actua ante un cambio real del texto (para no
  // resetear la página inicial restaurada ni en el remonte de StrictMode).
  useEffect(() => {
    if (lastSearch.current === search) {
      return;
    }
    lastSearch.current = search;
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [search, debounceMs]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const result = await fetcherRef.current({
          page,
          limit: pageSize,
          search: debouncedSearch,
          filters: filtersRef.current,
        });
        if (!active) {
          return;
        }
        setItems(result.data);
        setPagination(result.pagination);
      } catch (error) {
        if (active) {
          onErrorRef.current?.(error);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [page, debouncedSearch, pageSize, refreshKey]);

  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);
  const updateItems = useCallback((updater: (items: T[]) => T[]) => setItems(updater), []);

  return { items, pagination, page, setPage, search, setSearch, loading, reload, updateItems };
}
