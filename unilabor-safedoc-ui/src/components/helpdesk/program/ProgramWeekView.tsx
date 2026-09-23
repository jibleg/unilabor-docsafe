import { useMemo, useState, type DragEvent } from 'react';
import type { CalendarEvent } from '../../../types/helpdesk-program';
import { KIND_STYLES, addDays, formatDateShort, parseIsoDate, startOfWeek, todayIso } from '../../../utils/maintenanceProgram';
import { EventChip } from './EventChip';

interface ProgramWeekViewProps {
  anchorDate: string;
  events: CalendarEvent[];
  selectedId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onDropEvent: (event: CalendarEvent, date: string) => void;
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const ProgramWeekView = ({ anchorDate, events, selectedId, onSelectEvent, onDropEvent }: ProgramWeekViewProps) => {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const today = todayIso();
  const weekStart = startOfWeek(anchorDate);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);

  const handleDrop = (dragEvent: DragEvent<HTMLDivElement>, date: string) => {
    dragEvent.preventDefault();
    setDragOver(null);
    const event = eventsById.get(dragEvent.dataTransfer.getData('text/plain'));
    if (event && event.date !== date) onDropEvent(event, date);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-px overflow-y-auto bg-[rgba(0,65,106,0.06)] md:grid-cols-7">
      {days.map((date) => {
        const dayEvents = events.filter((event) => event.date === date);
        const isToday = date === today;
        return (
          <div
            key={date}
            onDragOver={(dragEvent) => {
              dragEvent.preventDefault();
              if (dragOver !== date) setDragOver(date);
            }}
            onDragLeave={() => setDragOver((current) => (current === date ? null : current))}
            onDrop={(dragEvent) => handleDrop(dragEvent, date)}
            className={`flex min-h-[160px] flex-col bg-[rgba(252,253,254,0.98)] ${dragOver === date ? 'bg-[rgba(191,212,230,0.45)] ring-2 ring-inset ring-[var(--color-brand-400)]' : ''}`}
          >
            <div className={`flex flex-col items-center border-b border-[rgba(0,65,106,0.08)] px-2 py-1.5 ${isToday ? 'bg-[rgba(191,212,230,0.35)]' : ''}`}>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">{WEEKDAYS[parseIsoDate(date).getDay()].slice(0, 3)}</span>
              <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-bold ${isToday ? 'bg-[var(--color-brand-700)] text-white' : 'text-[var(--unilabor-ink)]'}`}>{parseIsoDate(date).getDate()}</span>
              <span className="text-[10px] text-[var(--unilabor-neutral)]">{formatDateShort(date).slice(3)}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-1.5">
              {dayEvents.length === 0 ? <p className="py-3 text-center text-[11px] text-[var(--unilabor-neutral)]">Sin servicios</p> : null}
              {dayEvents.map((event) => (
                <div key={event.id} className="space-y-0.5">
                  <EventChip event={event} selected={selectedId === event.id} onSelect={onSelectEvent} />
                  {event.window_starts_on || event.window_ends_on ? (
                    <div className="flex items-center gap-1 px-1 text-[10px] text-[var(--unilabor-neutral)]">
                      <span className={`h-1 flex-1 rounded-full ${KIND_STYLES[event.kind].bar}`} />
                      <span className={event.window_state === 'OVERDUE' ? 'font-bold text-[#b02a2a]' : ''}>
                        hasta {formatDateShort(event.window_ends_on)}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
