import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listEmployeeDays, type EmployeeDayRow } from '../../../api/service.api-attendance-employees';
import { listIncidents, type Incident } from '../../../api/service.api-attendance-incidents';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { IncidentStatusBadge } from '../incidents/IncidentStatusBadge';
import { formatIncidentDuration } from '../incidents/incidentFormat';
import { DAY_RESULT_COLOR, DAY_RESULT_LABEL, type DayResultCode } from '../shared/dayResult';
import { addDaysIso, formatDate, formatDateShort, todayIso } from '../shared/format';
import { cardClass, secondaryButtonClass } from './ui';

export const RecentActivityCard = ({ employeeId, employeeName }: { employeeId: number; employeeName: string }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [days, setDays] = useState<EmployeeDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = todayIso();
      const [incidentResult, dayRows] = await Promise.all([
        listIncidents({ employee_id: String(employeeId), from: addDaysIso(today, -365), to: addDaysIso(today, 365), limit: 5 }),
        listEmployeeDays(employeeId, addDaysIso(today, -13), today, 14),
      ]);
      setIncidents(incidentResult.data);
      setDays(dayRows);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cargar la actividad reciente.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className={cardClass}>
        <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]"><Loader2 size={16} className="animate-spin" /> Cargando actividad…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className={cardClass}>
        <p className="flex items-center gap-2 text-sm text-red-800"><AlertTriangle size={16} /> {error}</p>
        <button type="button" className={`${secondaryButtonClass} mt-2`} onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> Reintentar</button>
      </section>
    );
  }

  const incidentQuery = new URLSearchParams({ employee_id: String(employeeId), employee_name: employeeName });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Últimas incidencias</h2>
          <Link to={`/attendance/incidents?${incidentQuery.toString()}`} className="text-xs font-semibold text-[var(--color-brand-700)] hover:underline">Ver todas</Link>
        </div>
        {incidents.length === 0 ? (
          <p className="text-sm text-[var(--unilabor-neutral)]">Sin incidencias registradas.</p>
        ) : (
          <ul className="space-y-2">
            {incidents.map((incident) => (
              <li key={incident.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold text-[var(--unilabor-ink)]">{incident.type.name}</span>
                  <span className="block text-xs text-[var(--unilabor-neutral)]">
                    {formatDate(incident.start_date)}{incident.end_date !== incident.start_date ? ` – ${formatDate(incident.end_date)}` : ''} · {formatIncidentDuration(incident)}
                  </span>
                </span>
                <IncidentStatusBadge status={incident.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[var(--color-brand-700)]">Últimos días</h2>
          <Link to={`/attendance/days?employee_id=${employeeId}`} className="text-xs font-semibold text-[var(--color-brand-700)] hover:underline">Ver todos</Link>
        </div>
        {days.length === 0 ? (
          <p className="text-sm text-[var(--unilabor-neutral)]">Sin días calculados en las últimas dos semanas.</p>
        ) : (
          <ul className="space-y-1.5">
            {days.map((day) => {
              const code = day.day_result as DayResultCode;
              const color = DAY_RESULT_COLOR[code] ?? '#898781';
              return (
                <li key={day.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-xs font-semibold capitalize text-[var(--unilabor-neutral)]">{formatDateShort(day.work_date)}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                    {DAY_RESULT_LABEL[code] ?? day.day_result}
                    {day.late_minutes > 0 ? ` · ${day.late_minutes} min` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
