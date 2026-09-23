import { useMemo, useState, type DragEvent } from 'react';
import type { CalendarEvent } from '../../../types/helpdesk-program';
import { addDays, parseIsoDate, startOfMonth, startOfWeek, todayIso } from '../../../utils/maintenanceProgram';
import { EventChip } from './EventChip';

interface ProgramMonthGridProps {
  anchorDate: string;
  events: CalendarEvent[];
  selectedId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onDropEvent: (event: CalendarEvent, date: string) => void;
  onOpenDay: (date: string) => void;
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MAX_VISIBLE = 4;

export const ProgramMonthGrid = ({ anchorDate, events, selectedId, onSelectEvent, onDropEvent, onOpenDay }: ProgramMonthGridProps) => {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const today = todayIso();
  const monthStart = startOfMonth(anchorDate);
  const gridStart = startOfWeek(monthStart);
  const monthIndex = parseIsoDate(monthStart).getMonth();

  const cells = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const bucket = map.get(event.date);
      if (bucket) bucket.push(event);
      else map.set(event.date, [event]);
    }
    return map;
  }, [events]);
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);

  const handleDrop = (dragEvent: DragEvent<HTMLDivElement>, date: string) => {
    dragEvent.preventDefault();
    setDragOver(null);
    const id = dragEvent.dataTransfer.getData('text/plain');
    const event = eventsById.get(id);
    if (event && event.date !== date) {
      onDropEvent(event, date);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-7 border-b border-[rgba(0,65,106,0.08)]">
        {WEEKDAYS.map((label) => (
          <div key={label} className="px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            {label}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px bg-[rgba(0,65,106,0.06)]">
        {cells.map((date) => {
          const dayEvents = eventsByDay.get(date) ?? [];
          const inMonth = parseIsoDate(date).getMonth() === monthIndex;
          const isToday = date === today;
          const overflow = dayEvents.length - MAX_VISIBLE;
          const overdueCount = dayEvents.filter((event) => event.window_state === 'OVERDUE').length;
          return (
            <div
              key={date}
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault();
                if (dragOver !== date) setDragOver(date);
              }}
              onDragLeave={() => setDragOver((current) => (current === date ? null : current))}
              onDrop={(dragEvent) => handleDrop(dragEvent, date)}
              className={`flex min-h-0 flex-col gap-1 overflow-hidden p-1.5 transition ${
                inMonth ? 'bg-[rgba(252,253,254,0.98)]' : 'bg-[rgba(243,247,250,0.9)]'
              } ${dragOver === date ? 'bg-[rgba(191,212,230,0.45)] ring-2 ring-inset ring-[var(--color-brand-400)]' : ''}`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onOpenDay(date)}
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold transition hover:bg-[rgba(191,212,230,0.4)] ${
                    isToday ? 'bg-[var(--color-brand-700)] text-white' : inMonth ? 'text-[var(--color-brand-700)]' : 'text-[var(--unilabor-neutral)] opacity-60'
                  }`}
                  title="Ver agenda del día"
                >
                  {parseIsoDate(date).getDate()}
                </button>
                {overdueCount > 0 ? (
                  <span className="rounded-full bg-[rgba(190,40,40,0.12)] px-1.5 text-[10px] font-bold text-[#b02a2a]" title={`${overdueCount} vencida(s)`}>
                    {overdueCount}
                  </span>
                ) : dayEvents.length > 0 ? (
                  <span className="text-[10px] font-semibold text-[var(--unilabor-neutral)]">{dayEvents.length}</span>
                ) : null}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, MAX_VISIBLE).map((event) => (
                  <EventChip key={event.id} event={event} selected={selectedId === event.id} onSelect={onSelectEvent} />
                ))}
                {overflow > 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenDay(date)}
                    className="rounded-md px-1.5 py-0.5 text-left text-[11px] font-bold text-[var(--color-brand-500)] hover:bg-[rgba(191,212,230,0.35)]"
                  >
                    +{overflow} más
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-[var(--unilabor-neutral)]">
        Arrastra una orden programada a otro día para reprogramarla (te pediremos la justificación). Borde punteado = orden proyectada; ✓ cerrada; ⚠ vencida.
      </p>
    </div>
  );
};
