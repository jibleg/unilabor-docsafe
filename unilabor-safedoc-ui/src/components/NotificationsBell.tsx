import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useMyNotificationsStore } from '../store/useMyNotificationsStore';
import { CelebrationBubble, IconBurst } from './BellCelebration';
import { NotificationRow } from './notifications/NotificationRow';
import { notificationsEmptyMessage } from './notifications/notificationsFormat';
import { useIconBurst } from './notifications/useIconBurst';
import { useMyNotifications } from './notifications/useMyNotifications';

const PANEL_SIZE = 8;
const CELEBRATION_MS = 7000;

/**
 * Campana de notificaciones de Contigo+ con su contador. El panel funciona en todos
 * los módulos; "Ver todas" lleva a la página de Mi espacio, que vive en RH.
 */
export const NotificationsBell = () => {
  const unread = useMyNotificationsStore((state) => state.unread);
  const celebrating = useMyNotificationsStore((state) => state.celebrating);
  const endCelebration = useMyNotificationsStore((state) => state.endCelebration);
  const canOpenPage = useAuthStore((state) => state.availableModules.some((module) => module.code === 'RH'));
  const { data, loading, load, markRead, markAllRead } = useMyNotifications(PANEL_SIZE);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { burst, launch } = useIconBurst();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!celebrating) {
      return;
    }
    const timer = window.setTimeout(endCelebration, CELEBRATION_MS);
    return () => window.clearTimeout(timer);
    // Jugar con los iconos mantiene abierto el globo.
  }, [celebrating, endCelebration, burst?.key]);

  const toggle = () => {
    endCelebration();
    if (!open && unread > 0) {
      launch();
    }
    if (!open) {
      void load();
    }
    setOpen((value) => !value);
  };

  const hasUnread = unread > 0;
  const showCelebration = celebrating && hasUnread && !open;
  const animate = hasUnread && !open;

  return (
    <div ref={containerRef} className="lg:relative">
      <div className="relative">
        <button
          type="button"
          onClick={toggle}
          onMouseEnter={() => {
            if (animate) {
              launch();
            }
          }}
          aria-expanded={open}
          aria-label={hasUnread ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(0,65,106,0.1)] bg-[rgba(239,245,250,0.92)] text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.34)]"
        >
          <Bell size={17} className={animate ? 'bell-ring' : undefined} />
          {hasUnread ? (
            <span
              className={`absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1 text-[10px] font-bold text-white ring-2 ring-white ${animate ? 'bell-badge-pulse' : ''}`}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>

        {burst ? <IconBurst key={burst.key} icono={burst.icono} /> : null}
        {showCelebration ? (
          <>
            <IconBurst rondas={2} />
            <CelebrationBubble unread={unread} onOpen={toggle} onIcon={launch} />
          </>
        ) : null}
      </div>

      {open ? (
        // En móvil es relativo a la barra (su backdrop-filter la vuelve el contenedor de `fixed`).
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="fixed inset-x-3 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white shadow-2xl shadow-[rgba(0,65,106,0.18)] lg:absolute lg:inset-x-auto lg:right-0 lg:top-[calc(100%+0.5rem)] lg:w-[24rem]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[var(--unilabor-ink)]">Notificaciones</p>
              <p className="text-[11px] text-[var(--unilabor-neutral)]">{unread > 0 ? `${unread} sin leer` : 'Todo al día'}</p>
            </div>
            {unread > 0 ? (
              <button type="button" onClick={() => void markAllRead()} className="text-xs font-semibold text-[var(--color-brand-700)] hover:underline">
                Marcar todas como leídas
              </button>
            ) : null}
          </div>

          <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
            {loading ? (
              <p className="flex items-center justify-center gap-2 px-6 py-8 text-sm text-[var(--unilabor-neutral)]">
                <Loader2 size={14} className="animate-spin" /> Cargando…
              </p>
            ) : data.rows.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm leading-6 text-[var(--unilabor-neutral)]">
                {notificationsEmptyMessage(data.linked, data.available)}
              </p>
            ) : (
              <ul className="divide-y divide-[rgba(0,65,106,0.08)]">
                {data.rows.map((notification) => (
                  <li key={notification.id}>
                    <NotificationRow notification={notification} onOpen={(row) => void markRead(row)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canOpenPage && data.linked && data.available ? (
            <NavLink
              to="/rh/my-notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-[rgba(0,65,106,0.08)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.24)]"
            >
              Ver todas{data.total > 0 ? ` (${data.total})` : ''}
            </NavLink>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
