import { useState } from 'react';
import { Star } from 'lucide-react';
import type { MyNotification } from '../../types/models';
import { lisDateToDisplay } from './notificationsFormat';

const formatCreatedAt = (value: string): string =>
  new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

/** Una notificación: al abrirla se expande y queda marcada como leída. */
export const NotificationRow = ({
  notification,
  onOpen,
}: {
  notification: MyNotification;
  onOpen: (notification: MyNotification) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const { contexto, read_at: readAt } = notification;
  const visitDate = lisDateToDisplay(contexto.fecha);

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => {
        setExpanded((value) => !value);
        onOpen(notification);
      }}
      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-[rgba(191,212,230,0.24)] ${readAt ? '' : 'bg-amber-50/60'}`}
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
        <Star size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm text-[var(--unilabor-ink)] ${readAt ? 'font-medium' : 'font-bold'}`}>{notification.titulo}</span>
          {readAt ? null : <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-brand-500)]" title="Sin leer" />}
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--unilabor-neutral)]">
          {formatCreatedAt(notification.created_at)}
          {visitDate ? ` · visita del ${visitDate}` : ''}
          {contexto.clave ? ` · unidad ${contexto.clave}` : ''}
        </span>
        <span className={`mt-1 block text-xs leading-5 text-[var(--unilabor-ink)] ${expanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
          “{notification.cuerpo}”
        </span>
        {expanded && notification.nota ? (
          <span className="mt-1.5 block rounded-lg bg-[rgba(191,212,230,0.34)] px-2 py-1 text-xs leading-5 text-[var(--color-brand-700)]">
            Nota de coordinación: {notification.nota}
          </span>
        ) : null}
      </span>
    </button>
  );
};
