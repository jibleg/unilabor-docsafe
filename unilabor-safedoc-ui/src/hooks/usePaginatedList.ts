import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageResult, PaginationMeta } from '../api/service';

export interface PaginatedListQuery {
  page: number;
  limit: number;
  search: string;
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
}

interface UsePaginatedListOptions {
  pageSize?: number;
  debounceMs?: number;
  onError?: (error: unknown) => void;
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
  const { pageSize = 20, debounceMs = 350, onError } = options;

  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: pageSize,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetcherRef = useRef(fetcher);
  const onErrorRef = useRef(onError);

  // Mantener las refs sincronizadas fuera del render (evita usar callbacks obsoletos).
  useEffect(() => {
    fetcherRef.current = fetcher;
    onErrorRef.current = onError;
  });

  // Debounce de la búsqueda. El setState ocurre dentro del timeout (no en el cuerpo
  // del effect) y, al cambiar la búsqueda efectiva, se vuelve a la primera página.
  useEffect(() => {
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
        const result = await fetcherRef.current({ page, limit: pageSize, search: debouncedSearch });
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

  return { items, pagination, page, setPage, search, setSearch, loading, reload };
}
