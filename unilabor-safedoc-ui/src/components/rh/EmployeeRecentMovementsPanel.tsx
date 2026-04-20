import { Activity, Clock3 } from 'lucide-react';
import type { AuditLog } from '../../types/models';

interface EmployeeRecentMovementsPanelProps {
  logs: AuditLog[];
  loading?: boolean;
}

const formatDisplayDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('es-MX');
};

export const EmployeeRecentMovementsPanel = ({
  logs,
  loading = false,
}: EmployeeRecentMovementsPanelProps) => {
  return (
    <div className="rounded-3xl border border-[rgba(0,65,106,0.08)] bg-white/92 shadow-xl shadow-[rgba(0,65,106,0.08)]">
      <div className="border-b border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.96)] px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--unilabor-neutral)]">
          Ultimos movimientos del expediente
        </p>
        <h3 className="mt-1 text-lg font-bold text-[var(--color-brand-700)]">Trazabilidad reciente</h3>
      </div>

      <div className="divide-y divide-[rgba(0,65,106,0.08)]">
        {loading ? (
          <div className="px-5 py-8 text-sm text-[var(--unilabor-neutral)]">Cargando movimientos recientes...</div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-8 text-sm text-[var(--unilabor-neutral)]">
            Aun no hay movimientos recientes para este expediente.
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={`${log.accessed_at}-${log.action}-${index}`} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_180px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.28)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-700)]">
                    {log.action}
                  </span>
                  {log.document_type_name ? (
                    <p className="text-sm font-bold text-[var(--color-brand-700)]">{log.document_type_name}</p>
                  ) : (
                    <p className="text-sm font-bold text-[var(--color-brand-700)]">{log.document || 'Movimiento RH'}</p>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--unilabor-neutral)]">
                  {log.full_name} {log.email ? `| ${log.email}` : ''}
                </p>
              </div>

              <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-[rgba(239,245,250,0.82)] px-4 py-3 text-xs text-[var(--unilabor-neutral)]">
                <div className="flex items-center gap-2 font-semibold text-[var(--color-brand-700)]">
                  <Clock3 size={14} />
                  {formatDisplayDate(log.accessed_at)}
                </div>
                {log.ip_address ? (
                  <p className="mt-2 inline-flex items-center gap-2">
                    <Activity size={12} />
                    {log.ip_address}
                  </p>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
