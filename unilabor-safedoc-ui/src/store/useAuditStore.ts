import { create } from 'zustand';
import { getApiErrorMessage, listAuditLogs } from '../api/service';
import type { AuditLog } from '../types/models';

interface AuditStore {
  logs: AuditLog[];
  loading: boolean;
  error: string | null;
  fetchLogs: () => Promise<void>;
}

export const useAuditStore = create<AuditStore>((set) => ({
  logs: [],
  loading: false,
  error: null,
  fetchLogs: async () => {
    set({ loading: true, error: null });
    try {
      const logs = await listAuditLogs();
      set({ logs, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: getApiErrorMessage(error, 'No se pudieron cargar los logs de auditoria'),
      });
    }
  },
}));
