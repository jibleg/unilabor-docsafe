import { useMemo } from 'react';
import type { CalendarEvent } from '../../../types/helpdesk-program';
import { addDays, parseIsoDate, startOfWeek, todayIso } from '../../../utils/maintenanceProgram';

interface ProgramYearViewProps {
  year: number;
  events: CalendarEvent[];
  onOpenMonth: (date: string) => void;
  onOpenDay: (date: string) => void;
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const heat = (count: number, overdue: number): string => {
  if (overdue > 0) return 'bg-[#b02a2a] text-white';
  if (count >= 4) return 'bg-[var(--color-brand-700)] text-white';
  if (count === 3) return 'bg-[var(--color-brand-500)] text-white';
  if (count === 2) return 'bg-[var(--color-brand-300)] text-white';
  if (count === 1) return 'bg-[rgba(191,212,230,0.9)] text-[var(--color-brand-700)]';
  return 'text-[var(--unilabor-ink)]';
};

export const ProgramYearView = ({ year, events, onOpenMonth, onOpenDay }: ProgramYearViewProps) => {
  const today = todayIso();
  const stats = useMemo(() => {
    const byDay = new Map<string, { count: number; overdue: number }>();
    const byMonth = new Map<number, { count: number; closed: number; overdue: number }>();
    for (const event of events) {
      const day = byDay.get(event.date) ?? { count: 0, overdue: 0 };
      day.count += 1;
      if (event.window_state === 'OVERDUE') day.overdue += 1;
      byDay.set(event.date, day);
      const monthIndex = parseIsoDate(event.date).getMonth();
      const month = byMonth.get(monthIndex) ?? { count: 0, closed: 0, overdue: 0 };
      month.count += 1;
      if (event.status === 'CLOSED') month.closed += 1;
      if (event.window_state === 'OVERDUE') month.overdue += 1;
      byMonth.set(monthIndex, month);
    }
    return { byDay, byMonth };
  }, [events]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MONTHS.map((label, monthIndex) => {
        const monthStart = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
        const gridStart = startOfWeek(monthStart);
        const month = stats.byMonth.get(monthIndex);
        return (
          <div key={label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/95 p-3 shadow-sm">
            <button type="button" onClick={() => onOpenMonth(monthStart)} className="mb-2 flex w-full items-center justify-between text-left">
              <span className="text-sm font-bold text-[var(--color-brand-700)]">
                {label} {year}
              </span>
              <span className="text-[10px] font-semibold text-[var(--unilabor-neutral)]">
                {month ? `${month.count} serv. · ${month.closed} cerr.${month.overdue ? ` · ${month.overdue} venc.` : ''}` : 'Sin servicios'}
              </span>
            </button>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-[var(--unilabor-neutral)]">
              {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, index) => (
                <span key={`${d}-${index}`}>{d}</span>
              ))}
            </div>
            <div className="mt-0.5 grid grid-cols-7 gap-0.5">
              {Array.from({ length: 42 }, (_, index) => {
                const date = addDays(gridStart, index);
                const inMonth = parseIsoDate(date).getMonth() === monthIndex;
                const day = stats.byDay.get(date);
                if (!inMonth) return <span key={date} className="h-6" />;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onOpenDay(date)}
                    title={day ? `${day.count} servicio(s)${day.overdue ? `, ${day.overdue} vencida(s)` : ''}` : undefined}
                    className={`h-6 rounded-md text-[10px] font-semibold transition hover:ring-2 hover:ring-[var(--color-brand-400)] ${heat(day?.count ?? 0, day?.overdue ?? 0)} ${
                      date === today ? 'ring-2 ring-[var(--color-brand-700)]' : ''
                    }`}
                  >
                    {parseIsoDate(date).getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
