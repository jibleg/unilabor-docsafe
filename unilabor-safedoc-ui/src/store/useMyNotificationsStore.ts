import { create } from 'zustand';
import { getMyNotificationsCount } from '../api/service.api-my-notifications';

/**
 * Fuente única del contador de notificaciones de Contigo+ sin leer: alimenta la
 * campana y el badge del menú. Se refresca en cada navegación y al marcar leídas.
 * `celebrating` se enciende cuando el servidor reporta más sin leer que la última vez
 * (incluida la primera consulta de la sesión) y dispara la animación de la campana.
 */
interface MyNotificationsState {
  unread: number;
  inFlight: boolean;
  celebrating: boolean;
  lastCount: number;
  endCelebration: () => void;
  refresh: () => Promise<void>;
  setUnread: (unread: number) => void;
}

export const useMyNotificationsStore = create<MyNotificationsState>((set, get) => ({
  unread: 0,
  inFlight: false,
  celebrating: false,
  lastCount: 0,
  endCelebration: () => set({ celebrating: false }),
  refresh: async () => {
    if (get().inFlight) {
      return;
    }
    set({ inFlight: true });
    try {
      const unread = await getMyNotificationsCount();
      set((state) => ({
        unread,
        lastCount: unread,
        celebrating: state.celebrating || unread > state.lastCount,
      }));
    } catch {
      set({ unread: 0 });
    } finally {
      set({ inFlight: false });
    }
  },
  setUnread: (unread) => {
    const value = Math.max(0, unread);
    set({ unread: value, lastCount: value });
  },
}));
