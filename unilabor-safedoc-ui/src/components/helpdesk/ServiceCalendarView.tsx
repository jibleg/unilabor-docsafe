import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ServiceCalendarEvent {
  id: string;
  date: string;
  kind: 'maintenance' | 'calibration';
  label: string;
  status: string;
}

interface ServiceCalendarViewProps {
  events: ServiceCalendarEvent[];
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const toDateKey = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

interface CalendarCell {
  key: string;
  day: number;
  inMonth: boolean;
}

export const ServiceCalendarView = ({ events, month, onPrevMonth, onNextMonth }: ServiceCalendarViewProps) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(month),
    [month],
  );

  // Construye una malla de 6 semanas (42 celdas) empezando en domingo.
  const cells = useMemo<CalendarCell[]>(() => {
    const firstOfMonth = new Date(year, monthIndex, 1);
    const startWeekday = firstOfMonth.getDay();
    const gridStart = new Date(year, monthIndex, 1 - startWeekday);

    return Array.from({ length: 42 }, (_, index) => {
      const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      return {
        key: toDateKey(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate()),
        day: cellDate.getDate(),
        inMonth: cellDate.getMonth() === monthIndex,
      };
    });
  }, [year, monthIndex]);

  // Agrupa los eventos por día (clave YYYY-MM-DD) para pintarlos en cada celda.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ServiceCalendarEvent[]>();
    events.forEach((event) => {
      const key = event.date.slice(0, 10);
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(event);
      } else {
        map.set(key, [event]);
      }
    });
    return map;
  }, [events]);

  return (
    <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold capitalize text-[var(--color-brand-700)]">{monthTitle}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPrevMonth}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const dayEvents = eventsByDay.get(cell.key) ?? [];
              return (
                <div
                  key={cell.key}
                  className={`flex min-h-[92px] flex-col gap-1 rounded-xl border p-1.5 ${
                    cell.inMonth
                      ? 'border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)]'
                      : 'border-transparent bg-[rgba(239,245,250,0.5)]'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold ${
                      cell.inMonth ? 'text-[var(--color-brand-700)]' : 'text-[var(--unilabor-neutral)] opacity-50'
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    {dayEvents.map((event) => {
                      const closed = event.status === 'CLOSED';
                      const palette =
                        event.kind === 'calibration'
                          ? 'border-[rgba(180,120,20,0.35)] bg-[rgba(245,196,110,0.28)] text-[#8a5a12]'
                          : 'border-[rgba(0,65,106,0.2)] bg-[rgba(191,212,230,0.45)] text-[var(--color-brand-700)]';
                      return (
                        <span
                          key={event.id}
                          title={`${event.label} · ${event.kind === 'calibration' ? 'Calibración' : 'Mantenimiento'}`}
                          className={`truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${palette} ${
                            closed ? 'opacity-45' : ''
                          }`}
                        >
                          {event.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
