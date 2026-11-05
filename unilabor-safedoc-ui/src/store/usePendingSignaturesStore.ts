import { create } from 'zustand';
import { getSignatureInboxCount } from '../api/service.api-signature-inbox';

/**
 * Fuente única del número de listas que esperan la firma del usuario en su
 * Buzón de firmas. Alimenta el badge del menú; se refresca en cada navegación
 * dentro de RH y al firmar, para que baje en cuanto deja de haber pendientes.
 */
interface PendingSignaturesState {
  count: number;
  inFlight: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const usePendingSignaturesStore = create<PendingSignaturesState>((set, get) => ({
  count: 0,
  inFlight: false,
  refresh: async () => {
    // Evita peticiones duplicadas si varios consumidores disparan el refresco a la vez.
    if (get().inFlight) {
      return;
    }
    set({ inFlight: true });
    try {
      set({ count: await getSignatureInboxCount() });
    } catch {
      set({ count: 0 });
    } finally {
      set({ inFlight: false });
    }
  },
  reset: () => set({ count: 0 }),
}));
