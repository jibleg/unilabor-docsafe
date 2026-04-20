import { AlertTriangle, CalendarClock, CircleAlert, SearchCheck } from 'lucide-react';
import type { EmployeeAlert, EmployeeAlertState, EmployeeAlertsSummary } from '../../types/models';

interface EmployeeAlertsSummaryPanelProps {
  title: string;
  summary: EmployeeAlertsSummary;
  alerts: EmployeeAlert[];
  loading?: boolean;
}

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

const formatDisplayDate = (value?: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('es-MX');
};

export const EmployeeAlertsSummaryPanel = ({
  title,
  summary,
  alerts,
  loading = false,
}: EmployeeAlertsSummaryPanelProps) => {
  const summaryCards = [
    { label: 'Faltantes', value: summary.missing, icon: SearchCheck },
    { label: 'Por vencer', value: summary.expiring, icon: CalendarClock },
    { label: 'Vencidos', value: summary.expired, icon: CircleAlert },
    { label: 'Total', value: summary.total, icon: AlertTriangle },
  ];

  return (
    <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
              Seguimiento documental
            </p>
            <h3 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">{title}</h3>
          </div>
          <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
            {summary.total} alerta{summary.total === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-[rgba(0,65,106,0.08)] px-5 py-5 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,0.92)] p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(191,212,230,0.32)] text-[var(--color-brand-700)]">
              <card.icon size={18} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-brand-700)]">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="divide-y divide-[rgba(0,65,106,0.08)]">
        {loading ? (
          <div className="px-5 py-8 text-sm text-[var(--unilabor-neutral)]">Cargando alertas del expediente...</div>
        ) : alerts.length === 0 ? (
          <div className="px-5 py-8 text-sm text-[var(--unilabor-neutral)]">
            No hay alertas activas para este expediente.
          </div>
        ) : (
          alerts.slice(0, 6).map((alert, index) => (
            <div
              key={`${alert.state}-${alert.document_type_id}-${alert.document_id ?? 'missing'}-${index}`}
              className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-[var(--color-brand-700)]">{alert.document_type_name}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getStateClassName(alert.state)}`}>
                    {getStateLabel(alert.state)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">{alert.section_name}</p>
              </div>

              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.82)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                {alert.state === 'missing' ? (
                  <p>Documento obligatorio pendiente en el expediente.</p>
                ) : (
                  <>
                    <p>Vence: {formatDisplayDate(alert.expiry_date)}</p>
                    <p>
                      {alert.state === 'expiring'
                        ? `Dias restantes: ${alert.days_remaining ?? 0}`
                        : `Dias vencido: ${Math.abs(alert.days_remaining ?? 0)}`}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
