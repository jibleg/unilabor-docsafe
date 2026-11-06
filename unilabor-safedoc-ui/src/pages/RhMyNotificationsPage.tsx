import { useEffect, useRef } from 'react';
import { BellOff, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { NotificationRow } from '../components/notifications/NotificationRow';
import { notificationsEmptyMessage } from '../components/notifications/notificationsFormat';
import { useMyNotifications } from '../components/notifications/useMyNotifications';
import { buttonClass, cardClass } from '../components/rh/supervision/supervision-ui';
import { useMyNotificationsStore } from '../store/useMyNotificationsStore';

const PAGE_SIZE = 20;

/**
 * Mis notificaciones: los avisos de Contigo+ del colaborador (hoy, felicitaciones de
 * pacientes), todos, sin corte por fecha. Depende del vínculo con XLab que hace RH.
 */
export const RhMyNotificationsPage = () => {
  const { data, loading, loadingMore, load, loadMore, markRead, markAllRead } = useMyNotifications(PAGE_SIZE);

  const unreadInStore = useMyNotificationsStore((state) => state.unread);

  useEffect(() => {
    void load();
  }, [load]);

  // La campana también marca leídas: si el contador cambió fuera de esta página, se recarga.
  const lastUnreadInStore = useRef(unreadInStore);
  useEffect(() => {
    if (lastUnreadInStore.current === unreadInStore) {
      return;
    }
    lastUnreadInStore.current = unreadInStore;
    if (!loading && unreadInStore !== data.unread) {
      void load();
    }
  }, [unreadInStore, data.unread, loading, load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">Mi espacio · Contigo+</p>
          <h1 className="text-2xl font-bold text-[var(--color-brand-700)]">Mis notificaciones</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--unilabor-ink)]">
            Las felicitaciones que los pacientes dejan para ti. Abre una para leerla completa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.unread > 0 ? (
            <button type="button" onClick={() => void markAllRead()} className={buttonClass}>
              <CheckCheck size={14} /> Marcar todas como leídas
            </button>
          ) : null}
          <button type="button" onClick={() => void load()} className={buttonClass}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </header>

      <section className={`${cardClass} space-y-3`}>
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : data.rows.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-8 text-center text-sm leading-6 text-[var(--unilabor-neutral)]">
            <BellOff size={22} />
            {notificationsEmptyMessage(data.linked, data.available)}
          </p>
        ) : (
          <>
            <p className="text-xs text-[var(--unilabor-neutral)]">
              {data.total} en total · {data.unread} sin leer
            </p>
            <ul className="divide-y divide-[rgba(0,65,106,0.08)] overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white">
              {data.rows.map((notification) => (
                <li key={notification.id}>
                  <NotificationRow notification={notification} onOpen={(row) => void markRead(row)} />
                </li>
              ))}
            </ul>
            {data.rows.length < data.total ? (
              <div className="flex justify-center">
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={buttonClass}>
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null} Ver más
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
};
