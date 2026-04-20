import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CircleAlert, RefreshCw, SearchCheck } from 'lucide-react';
import { getApiErrorMessage, listEmployees, listRhAlerts } from '../api/service';
import type { Employee, EmployeeAlert, EmployeeAlertState, EmployeeAlertsSummary } from '../types/models';
import { notifyError } from '../utils/notify';

const EMPTY_SUMMARY: EmployeeAlertsSummary = {
  missing: 0,
  expiring: 0,
  expired: 0,
  total: 0,
};

const getStateLabel = (state: EmployeeAlertState): string => {
  switch (state) {
    case 'expiring':
      return 'Por vencer';
    case 'expired':
      return 'Vencido';
    case 'missing':
    default:
      return 'Faltante';
  }
};

const getStateClassName = (state: EmployeeAlertState): string => {
  switch (state) {
    case 'expiring':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'expired':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'missing':
    default:
      return 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.12)] text-[var(--color-brand-700)]';
  }
};

export const RhAlertsPage = () => {
  const [summary, setSummary] = useState<EmployeeAlertsSummary>(EMPTY_SUMMARY);
  const [alerts, setAlerts] = useState<EmployeeAlert[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [area, setArea] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | EmployeeAlertState>('all');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsResponse, employeesResponse] = await Promise.all([
        listRhAlerts({
          ...(employeeId ? { employee_id: Number(employeeId) } : {}),
          ...(area.trim() ? { area: area.trim() } : {}),
          ...(stateFilter !== 'all' ? { state: stateFilter } : {}),
        }),
        listEmployees(),
      ]);

      setSummary(alertsResponse.summary);
      setAlerts(alertsResponse.alerts);
      setEmployees(employeesResponse);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar las alertas RH.'));
    } finally {
      setLoading(false);
    }
  }, [area, employeeId, stateFilter]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const summaryCards = useMemo(
    () => [
      { label: 'Expedientes incompletos', value: summary.missing, icon: SearchCheck },
      { label: 'Documentos por vencer', value: summary.expiring, icon: CalendarClock },
      { label: 'Documentos vencidos', value: summary.expired, icon: CircleAlert },
      { label: 'Alertas totales', value: summary.total, icon: AlertTriangle },
    ],
    [summary],
  );

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-[rgba(0,65,106,0.1)] bg-[linear-gradient(135deg,#ffffff_0%,#eef5fa_56%,#dbe8f2_100%)] shadow-xl shadow-[rgba(0,65,106,0.1)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,173,211,0.22),transparent_28%)] px-6 py-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
                Recursos Humanos
              </p>
              <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">Alertas y seguimiento</h1>
              <p className="mt-2 max-w-3xl text-sm text-[var(--unilabor-neutral)]">
                Identifica expedientes incompletos, documentos por vencer y constancias vencidas desde una sola vista.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadAlerts()}
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Recargar alertas
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
              <card.icon size={20} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-[var(--color-brand-700)]">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Colaborador
            </label>
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
            >
              <option value="">Todos los colaboradores</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Area
            </label>
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="Filtrar por area"
              className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Estado
            </label>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as 'all' | EmployeeAlertState)}
              className="w-full rounded-2xl border border-[rgba(0,65,106,0.12)] bg-[rgba(248,251,253,0.95)] px-4 py-2.5 text-sm text-[var(--unilabor-ink)] outline-none transition focus:border-[var(--color-brand-300)] focus:ring-2 focus:ring-[rgba(124,173,211,0.2)]"
            >
              <option value="all">Todos los estados</option>
              <option value="missing">Faltantes</option>
              <option value="expiring">Por vencer</option>
              <option value="expired">Vencidos</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/88 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            Alertas documentales RH
          </p>
        </div>

        <div className="divide-y divide-[rgba(0,65,106,0.08)]">
          {loading ? (
            <div className="px-5 py-10 text-sm text-[var(--unilabor-neutral)]">Cargando alertas...</div>
          ) : alerts.length === 0 ? (
            <div className="px-5 py-10 text-sm text-[var(--unilabor-neutral)]">
              No hay alertas para los filtros seleccionados.
            </div>
          ) : (
            alerts.map((alert, index) => (
              <div key={`${alert.state}-${alert.employee_id}-${alert.document_type_id}-${index}`} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[var(--color-brand-700)]">{alert.employee_name}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getStateClassName(alert.state)}`}>
                      {getStateLabel(alert.state)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                    {alert.employee_code} · {alert.area || 'Sin area'} · {alert.position || 'Sin puesto'}
                  </p>
                  <p className="mt-2 text-sm text-[var(--unilabor-ink)]">
                    {alert.section_name} · {alert.document_type_name}
                  </p>
                </div>

                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.82)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                  {alert.state === 'missing' ? (
                    <p>Falta documento obligatorio en el expediente.</p>
                  ) : (
                    <>
                      <p>Vence: {alert.expiry_date || 'Sin fecha'}</p>
                      <p>
                        {alert.state === 'expiring'
                          ? `Dias restantes: ${alert.days_remaining ?? 0}`
                          : `Dias vencido: ${Math.abs(alert.days_remaining ?? 0)}`}
                      </p>
                    </>
                  )}
                </div>

                <div className="text-right text-xs font-semibold text-[var(--color-brand-700)]">
                  {alert.employee_email}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
