import { create } from 'zustand';
import { getMyPendingEvaluationsCount } from '../api/service';

/**
 * Fuente unica del conteo de evaluaciones de capacitacion pendientes del
 * colaborador. Alimenta el badge del menu y el banner de aviso; se refresca en
 * cada navegacion dentro de RH y tras enviar una evaluacion, para que el aviso
 * desaparezca en cuanto deja de haber pendientes.
 */
interface PendingEvaluationsState {
  count: number;
  loading: boolean;
  inFlight: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const usePendingEvaluationsStore = create<PendingEvaluationsState>((set, get) => ({
  count: 0,
  loading: false,
  inFlight: false,
  refresh: async () => {
    // Evita peticiones duplicadas si varios consumidores disparan el refresco a la vez.
    if (get().inFlight) {
      return;
    }
    set({ inFlight: true, loading: true });
    try {
      const value = await getMyPendingEvaluationsCount();
      set({ count: value });
    } catch {
      set({ count: 0 });
    } finally {
      set({ inFlight: false, loading: false });
    }
  },
  reset: () => set({ count: 0, loading: false }),
}));
