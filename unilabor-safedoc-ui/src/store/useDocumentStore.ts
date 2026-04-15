import { create } from 'zustand';
import { getApiErrorMessage, listDocuments } from '../api/service';
import type { Document } from '../types/models';
import type { ListDocumentsOptions } from '../api/service';

interface DocumentStore {
  documents: Document[];
  loading: boolean;
  error: string | null;
  fetchDocuments: (options?: ListDocumentsOptions) => Promise<void>;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  documents: [],
  loading: false,
  error: null,
  fetchDocuments: async (options) => {
    set({ loading: true, error: null });
    try {
      const documents = await listDocuments(options);
      set({ documents, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: getApiErrorMessage(error, 'No se pudieron cargar los documentos'),
      });
    }
  }
}));
