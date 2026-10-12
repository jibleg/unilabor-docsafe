import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarRange, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getEmployeeSchedule, type EmployeeSchedule } from '../../../api/service.api-attendance-employees';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { addDaysIso, formatClock, formatDateShort, todayIso } from '../shared/format';
import { cardClass, secondaryButtonClass } from './ui';

export const ScheduleCard = ({ employeeId }: { employeeId: number }) => {
  const [data, setData] = useState<EmployeeSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = todayIso();
      setData(await getEmployeeSchedule(employeeId, today, addDaysIso(today, 13)));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cargar el horario.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasAny = data?.days.some((day) => day.chips.length > 0) ?? false;

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--color-brand-700)]">Horario de las próximas 2 semanas</h2>
        <Link to="/attendance/schedule" className={secondaryButtonClass}>
          <CalendarRange size={15} aria-hidden="true" /> Calendario
        </Link>
      </div>
      {loading && !data ? (
        <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]"><Loader2 size={16} className="animate-spin" /> Cargando…</p>
      ) : error ? (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2 text-red-800"><AlertTriangle size={16} /> {error}</p>
          <button type="button" className={secondaryButtonClass} onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> Reintentar</button>
        </div>
      ) : data && !hasAny ? (
        <p className="text-sm text-[var(--unilabor-neutral)]">Sin horario asignado en estas dos semanas.</p>
      ) : data ? (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {data.days.map((day) => (
            <li key={day.date} className="flex items-start gap-3 border-b border-[rgba(0,65,106,0.06)] py-1.5 text-sm">
              <span className="w-24 shrink-0 text-xs font-semibold capitalize text-[var(--unilabor-neutral)]">{formatDateShort(day.date)}</span>
              <span className="flex flex-wrap gap-1">
                {day.chips.length === 0 ? <span className="text-xs text-[var(--unilabor-neutral)]">Sin horario</span> : null}
                {day.chips.map((chip, index) => (
                  <span
                    key={`${chip.assignment_id}-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold"
                    style={{ borderColor: chip.color_hex, backgroundColor: `${chip.color_hex}1f`, color: 'var(--unilabor-ink)' }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chip.color_hex }} aria-hidden="true" />
                    {chip.shift_id === null ? 'Descanso' : `${chip.name} ${formatClock(chip.start_time)}-${formatClock(chip.end_time)}`}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
