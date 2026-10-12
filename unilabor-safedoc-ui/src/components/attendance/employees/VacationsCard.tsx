import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarPlus, Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import {
  getEmployeeVacations,
  openVacationPeriods,
  type VacationSummary,
} from '../../../api/service.api-attendance-employees';
import { getApiErrorMessage } from '../../../api/service.parsers';
import { notifyError, notifySuccess } from '../../../utils/notify';
import { formatDate } from '../shared/format';
import { VacationAdjustModal } from './VacationAdjustModal';
import { cardClass, secondaryButtonClass, thClass } from './ui';

interface Props {
  employeeId: number;
  canAuthorize: boolean;
  /** Cambia cuando la ficha modifica la fecha de ingreso, para recargar. */
  reloadKey?: string | null;
}

export const VacationsCard = ({ employeeId, canAuthorize, reloadKey }: Props) => {
  const [data, setData] = useState<VacationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getEmployeeVacations(employeeId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar las vacaciones.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const handleOpen = async () => {
    setOpening(true);
    try {
      setData(await openVacationPeriods(employeeId));
      notifySuccess('Periodos actualizados.');
    } catch (err) {
      notifyError(getApiErrorMessage(err, 'No se pudieron abrir los periodos.'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <section className={cardClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--color-brand-700)]">Vacaciones</h2>
        {canAuthorize ? (
          <div className="flex gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => void handleOpen()} disabled={opening}>
              {opening ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} aria-hidden="true" />} Abrir periodos
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => setAdjusting(true)} disabled={!data || (data.periods ?? []).length === 0}>
              <SlidersHorizontal size={15} aria-hidden="true" /> Ajustar
            </button>
          </div>
        ) : null}
      </div>

      {loading && !data ? (
        <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]"><Loader2 size={16} className="animate-spin" /> Cargando…</p>
      ) : error ? (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2 text-red-800"><AlertTriangle size={16} /> {error}</p>
          <button type="button" className={secondaryButtonClass} onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> Reintentar</button>
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <p className="text-3xl font-bold text-[var(--color-brand-700)]">
              {data.balance.balance} <span className="text-base font-semibold">{data.balance.balance === 1 ? 'día disponible' : 'días disponibles'}</span>
            </p>
            {data.balance.expiring ? (
              <p className="text-sm text-amber-900">
                {data.balance.expiring.days} {data.balance.expiring.days === 1 ? 'día vence' : 'días vencen'} el {formatDate(data.balance.expiring.due_date)}
              </p>
            ) : null}
          </div>
          {!data.hire_date ? (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Sin fecha de ingreso: captúrala en “Datos de asistencia” para calcular los periodos.
            </p>
          ) : (data.periods ?? []).length === 0 ? (
            <p className="text-sm text-[var(--unilabor-neutral)]">Aún no hay periodos. Usa “Abrir periodos”.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)]">
                  <tr>
                    <th className={thClass}>Año</th>
                    <th className={thClass}>Periodo</th>
                    <th className={thClass}>Vence</th>
                    <th className={`${thClass} text-right`}>Derecho</th>
                    <th className={`${thClass} text-right`}>Ajuste</th>
                    <th className={`${thClass} text-right`}>Tomados</th>
                    <th className={`${thClass} text-right`}>Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
                  {(data.periods ?? []).map((period) => (
                    <tr key={period.id} className={period.expired ? 'opacity-50' : ''}>
                      <td className="px-4 py-2">{period.seniority_year}</td>
                      <td className="whitespace-nowrap px-4 py-2">{formatDate(period.period_start_date)}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {formatDate(period.period_due_date)}
                        {period.expired ? <span className="badge badge-ghost badge-xs ml-2">Vencido</span> : null}
                      </td>
                      <td className="px-4 py-2 text-right">{period.days_entitled}</td>
                      <td className="px-4 py-2 text-right" title={period.adjustment_reason ?? undefined}>
                        {period.days_adjustment !== 0 ? (
                          <span className="underline decoration-dotted">{period.days_adjustment > 0 ? `+${period.days_adjustment}` : period.days_adjustment}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{period.days_taken}</td>
                      <td className="px-4 py-2 text-right font-semibold">{period.balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {adjusting && data ? (
        <VacationAdjustModal
          periods={data.periods ?? []}
          onClose={() => setAdjusting(false)}
          onSaved={(summary) => {
            setData(summary);
            setAdjusting(false);
          }}
        />
      ) : null}
    </section>
  );
};
