import { create } from 'zustand';
import { getApiErrorMessage, getDocumentStats, listDocumentsPaginated } from '../api/service';
import type { ListDocumentsOptions, PageQuery, PaginationMeta } from '../api/service';
import type { Document, DocumentStats } from '../types/models';

const EMPTY_PAGINATION: PaginationMeta = { page: 1, limit: 20, total: 0, totalPages: 1 };
const EMPTY_STATS: DocumentStats = { active: 0, inactive: 0, superseded: 0, total: 0 };

interface DocumentStore {
  documents: Document[];
  pagination: PaginationMeta;
  stats: DocumentStats;
  loading: boolean;
  error: string | null;
  fetchDocuments: (options?: ListDocumentsOptions, pageQuery?: PageQuery) => Promise<void>;
  fetchStats: () => Promise<void>;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  documents: [],
  pagination: EMPTY_PAGINATION,
  stats: EMPTY_STATS,
  loading: false,
  error: null,
  fetchDocuments: async (options, pageQuery) => {
    set({ loading: true, error: null });
    try {
      const result = await listDocumentsPaginated(options, pageQuery);
      set({ documents: result.data, pagination: result.pagination, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: getApiErrorMessage(error, 'No se pudieron cargar los documentos'),
      });
    }
  },
  fetchStats: async () => {
    try {
      const stats = await getDocumentStats();
      set({ stats });
    } catch {
      // El resumen es informativo; si falla, se mantiene el ultimo valor conocido.
    }
  },
}));
