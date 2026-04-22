import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Laptop,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { getApiErrorMessage, getHelpdeskDashboard, getHelpdeskSummary } from '../api/service';
import type { HelpdeskAssetSummary, HelpdeskDashboardMetrics } from '../types/models';
import { notifyError } from '../utils/notify';

const EMPTY_SUMMARY: HelpdeskAssetSummary = {
  assets: 0,
  open_tickets: 0,
  preventive_due: 0,
  out_of_service: 0,
};

const EMPTY_DASHBOARD: HelpdeskDashboardMetrics = {
  tickets: {
    total: 0,
    open: 0,
    critical: 0,
    overdue: 0,
    solved: 0,
    affects_results: 0,
    risk_pending_release: 0,
    avg_solution_hours: null,
    avg_downtime_hours: null,
  },
  maintenance: {
    scheduled: 0,
    in_progress: 0,
    overdue: 0,
    closed: 0,
    compliance_percent: 0,
  },
  availability: [],
  recurrences: [],
  by_area: [],
  audit_items: [],
};

const formatNumber = (value?: number | null, suffix = ''): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/D';
  }

  return `${value}${suffix}`;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const riskLabel = (risk?: string | null): string => {
  const labels: Record<string, string> = {
    NOT_EVALUATED: 'No evaluado',
    LOW: 'Bajo',
    MEDIUM: 'Medio',
    HIGH: 'Alto',
    CRITICAL: 'Critico',
  };

  return labels[risk ?? 'NOT_EVALUATED'] ?? risk ?? 'No evaluado';
};

export const HelpdeskDashboardPage = () => {
  const [summary, setSummary] = useState<HelpdeskAssetSummary>(EMPTY_SUMMARY);
  const [dashboard, setDashboard] = useState<HelpdeskDashboardMetrics>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [summaryData, dashboardData] = await Promise.all([
        getHelpdeskSummary(),
        getHelpdeskDashboard(),
      ]);

      setSummary(summaryData);
      setDashboard(dashboardData);
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo cargar el dashboard Helpdesk.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const summaryCards = useMemo(() => [
    { label: 'Activos registrados', value: summary.assets, icon: Laptop },
    { label: 'Tickets abiertos', value: summary.open_tickets, icon: LifeBuoy },
    { label: 'Mantenimientos proximos', value: summary.preventive_due, icon: CalendarClock },
    { label: 'Fuera de servicio', value: summary.out_of_service, icon: AlertTriangle },
  ], [summary]);

  const kpiCards = useMemo(() => [
    { label: 'Tickets criticos', value: dashboard.tickets.critical, icon: AlertTriangle },
    { label: 'Tickets vencidos', value: dashboard.tickets.overdue, icon: Timer },
    { label: 'Impacto resultados', value: dashboard.tickets.affects_results, icon: ShieldCheck },
    { label: 'Liberacion pendiente', value: dashboard.tickets.risk_pending_release, icon: ClipboardList },
    { label: 'Prom. solucion', value: formatNumber(dashboard.tickets.avg_solution_hours, ' h'), icon: Gauge },
    { label: 'Prom. fuera operacion', value: formatNumber(dashboard.tickets.avg_downtime_hours, ' h'), icon: Activity },
  ], [dashboard]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-500)]">
            Mesa de Ayuda
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--color-brand-700)]">
            Indicadores operativos y auditoria
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--unilabor-neutral)]">
            Seguimiento de tickets, disponibilidad de activos, mantenimiento preventivo, reincidencias y trazabilidad ISO 15189:2022.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(0,65,106,0.12)] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Recargar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-3xl font-black text-[var(--color-brand-700)]">{card.value}</p>
                <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">{card.label}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
                <card.icon size={22} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpiCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-4 shadow-xl shadow-[rgba(0,65,106,0.08)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(191,212,230,0.28)] text-[var(--color-brand-700)]">
                <card.icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-black text-[var(--color-brand-700)]">{card.value}</p>
                <p className="text-xs text-[var(--unilabor-neutral)]">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <div className="flex items-center gap-3">
            <BarChart3 size={22} className="text-[var(--color-brand-700)]" />
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Disponibilidad por estado</h2>
          </div>
          <div className="mt-4 grid gap-3">
            {dashboard.availability.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
                Sin activos clasificados por estado.
              </p>
            ) : dashboard.availability.map((item) => (
              <div key={item.code} className="flex items-center justify-between rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-4 py-3">
                <div>
                  <p className="font-semibold text-[var(--color-brand-700)]">{item.name}</p>
                  <p className="text-xs text-[var(--unilabor-neutral)]">{item.code}</p>
                </div>
                <p className="text-xl font-black text-[var(--color-brand-700)]">{item.total}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={22} className="text-[var(--color-brand-700)]" />
            <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Mantenimiento preventivo</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['Programadas', dashboard.maintenance.scheduled],
              ['En proceso', dashboard.maintenance.in_progress],
              ['Vencidas', dashboard.maintenance.overdue],
              ['Cerradas', dashboard.maintenance.closed],
              ['Cumplimiento', `${dashboard.maintenance.compliance_percent}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-3 py-3">
                <p className="text-xl font-black text-[var(--color-brand-700)]">{value}</p>
                <p className="text-xs text-[var(--unilabor-neutral)]">{label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Reincidencias por equipo</h2>
          <div className="mt-4 space-y-3">
            {dashboard.recurrences.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
                No hay equipos con reincidencias registradas.
              </p>
            ) : dashboard.recurrences.map((item) => (
              <div key={item.asset_id} className="flex items-center justify-between rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-4 py-3">
                <div>
                  <p className="font-bold text-[var(--color-brand-700)]">{item.asset_code}</p>
                  <p className="text-sm text-[var(--unilabor-neutral)]">{item.asset_name}</p>
                </div>
                <p className="text-xl font-black text-[var(--color-brand-700)]">{item.ticket_count}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
          <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Reporte por area</h2>
          <div className="mt-4 space-y-3">
            {dashboard.by_area.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] p-4 text-sm text-[var(--unilabor-neutral)]">
                Sin actividad agrupada por area.
              </p>
            ) : dashboard.by_area.map((item) => (
              <div key={item.area} className="rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.96)] px-4 py-3">
                <p className="font-bold text-[var(--color-brand-700)]">{item.area}</p>
                <p className="mt-1 text-sm text-[var(--unilabor-neutral)]">
                  {item.ticket_count} tickets | {item.maintenance_count} mantenimientos
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]">
        <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Trazabilidad auditable reciente</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-[rgba(0,65,106,0.08)]">
          <table className="w-full text-left">
            <thead className="bg-[rgba(239,245,250,0.96)]">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Folio</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Activo</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Estado</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Riesgo</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,65,106,0.08)]">
              {dashboard.audit_items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-[var(--unilabor-neutral)]">
                    Sin eventos auditables recientes.
                  </td>
                </tr>
              ) : dashboard.audit_items.map((item) => (
                <tr key={`${item.kind}-${item.code}-${item.event_at}`}>
                  <td className="px-4 py-3 text-sm font-bold text-[var(--color-brand-700)]">{item.code}</td>
                  <td className="px-4 py-3 text-sm text-[var(--unilabor-ink)]">
                    {item.asset_code ?? 'Sin activo'}
                    <p className="text-xs text-[var(--unilabor-neutral)]">{item.asset_name ?? item.owner ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--unilabor-ink)]">{item.status}</td>
                  <td className="px-4 py-3 text-sm text-[var(--unilabor-ink)]">{riskLabel(item.risk_level)}</td>
                  <td className="px-4 py-3 text-sm text-[var(--unilabor-ink)]">{formatDateTime(item.event_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
