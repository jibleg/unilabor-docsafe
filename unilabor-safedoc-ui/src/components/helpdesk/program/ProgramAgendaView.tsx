import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, PenLine, Sparkles } from 'lucide-react';
import type { CalendarEvent } from '../../../types/helpdesk-program';
import { CRITICALITY_STYLES, KIND_LABELS, KIND_STYLES, STATUS_LABELS, formatDateLong, formatDateShort, todayIso } from '../../../utils/maintenanceProgram';

interface ProgramAgendaViewProps {
  events: CalendarEvent[];
  selectedId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  emptyLabel?: string;
}

const StatusBadge = ({ event }: { event: CalendarEvent }) => {
  if (event.status === 'CLOSED')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(34,139,84,0.12)] px-2 py-0.5 text-[10px] font-bold text-[#1c7a4a]">
        <CheckCircle2 size={11} /> Cerrada
      </span>
    );
  if (event.window_state === 'OVERDUE')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(190,40,40,0.12)] px-2 py-0.5 text-[10px] font-bold text-[#b02a2a]">
        <AlertTriangle size={11} /> Vencida
      </span>
    );
  if (event.status === 'PENDING_VALIDATION')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(124,58,237,0.12)] px-2 py-0.5 text-[10px] font-bold text-[#4c1d95]">
        <PenLine size={11} /> En validación
      </span>
    );
  if (event.status === 'IN_PROGRESS')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,105,166,0.12)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-700)]">
        <Clock3 size={11} /> En ejecución
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(191,212,230,0.4)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-700)]">
      {event.is_projected ? <Sparkles size={11} /> : null} {STATUS_LABELS[event.status] ?? event.status}
    </span>
  );
};

export const ProgramAgendaView = ({ events, selectedId, onSelectEvent, emptyLabel = 'No hay servicios en el periodo con los filtros actuales.' }: ProgramAgendaViewProps) => {
  const today = todayIso();
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const bucket = map.get(event.date);
      if (bucket) bucket.push(event);
      else map.set(event.date, [event]);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [events]);

  if (groups.length === 0) {
    return <p className="py-12 text-center text-sm text-[var(--unilabor-neutral)]">{emptyLabel}</p>;
  }
  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      {groups.map(([date, dayEvents]) => (
        <section key={date} className="mb-4">
          <h3 className={`sticky top-0 z-10 mb-1.5 rounded-lg px-2 py-1 text-xs font-bold backdrop-blur ${date === today ? 'bg-[rgba(191,212,230,0.6)] text-[var(--color-brand-700)]' : 'bg-white/90 text-[var(--unilabor-neutral)]'}`}>
            {formatDateLong(date)} {date === today ? '· Hoy' : ''}
          </h3>
          <ul className="space-y-1.5">
            {dayEvents.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(event)}
                  className={`flex w-full items-center gap-3 rounded-2xl border bg-white/95 px-3 py-2.5 text-left transition hover:shadow-md ${
                    selectedId === event.id ? 'border-[var(--color-brand-500)] ring-1 ring-[var(--color-brand-500)]' : 'border-[rgba(0,65,106,0.08)]'
                  } ${event.status === 'CLOSED' ? 'opacity-70' : ''}`}
                >
                  <span className={`h-10 w-1.5 shrink-0 rounded-full ${KIND_STYLES[event.kind].dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[var(--color-brand-700)]">{event.asset.asset_code}</span>
                      <span className="truncate text-sm text-[var(--unilabor-ink)]">{event.asset.name}</span>
                      {event.asset.criticality_code ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CRITICALITY_STYLES[event.asset.criticality_code] ?? ''}`}>{event.asset.criticality_name}</span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-[var(--unilabor-neutral)]">
                      <span className="font-semibold">{KIND_LABELS[event.kind]}</span> · {event.title} · {event.code}
                      {event.window_ends_on ? ` · ventana ${formatDateShort(event.window_starts_on)} → ${formatDateShort(event.window_ends_on)}` : ''}
                    </p>
                    <p className="truncate text-[11px] text-[var(--unilabor-neutral)]">
                      {[event.asset.unit_name, event.asset.area_name, event.asset.responsible_employee_name, event.supplier_name].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <StatusBadge event={event} />
                  <ChevronRight size={16} className="shrink-0 text-[var(--unilabor-neutral)]" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
