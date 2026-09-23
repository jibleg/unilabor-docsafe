import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Loader2, X } from 'lucide-react';
import { fetchProgramKpis, getApiErrorMessage } from '../../../api/service';
import type { CalendarFilters, ProgramKpis } from '../../../types/helpdesk-program';
import { KIND_LABELS, KIND_STYLES, formatDateShort, formatDateTime } from '../../../utils/maintenanceProgram';
import { notifyError } from '../../../utils/notify';

interface KpiPanelProps {
  open: boolean;
  from: string;
  to: string;
  filters: CalendarFilters;
  onClose: () => void;
}

const CRIT_LABEL: Record<string, string> = { CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja', NONE: 'Sin criticidad' };
const CRIT_BAR: Record<string, string> = { CRITICAL: 'bg-[#b02a2a]', HIGH: 'bg-[#ea580c]', MEDIUM: 'bg-[#d0952a]', LOW: 'bg-[#1c7a4a]', NONE: 'bg-[#64748b]' };

const Bar = ({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="w-28 shrink-0 text-[var(--unilabor-ink)]">{label}</span>
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[rgba(191,212,230,0.35)]">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%` }} />
    </div>
    <span className="w-8 text-right font-bold text-[var(--color-brand-700)]">{value}</span>
  </div>
);

export const KpiPanel = ({ open, from, to, filters, onClose }: KpiPanelProps) => {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<ProgramKpis | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKpis(await fetchProgramKpis(from, to, filters));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron calcular los indicadores.'));
    } finally {
      setLoading(false);
    }
  }, [from, to, filters]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;
  const maxKind = Math.max(1, ...(kpis?.by_kind.map((k) => k.scheduled) ?? [1]));
  const maxCrit = Math.max(1, ...(kpis?.overdue_by_criticality.map((c) => c.count) ?? [1]));
  const pct = kpis?.compliance.pct ?? null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-[rgba(11,34,53,0.35)] backdrop-blur-[1px]" onClick={onClose}>
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Indicadores del programa</p>
            <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--color-brand-700)]">
              <BarChart3 size={18} /> {formatDateShort(from)} – {formatDateShort(to)}
            </h3>
            <p className="text-xs text-[var(--unilabor-neutral)]">Respetan los filtros del calendario. Base para la revisión por la dirección (ISO 15189 8.6).</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading || !kpis ? (
            <p className="flex items-center gap-2 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={16} className="animate-spin" /> Calculando...
            </p>
          ) : (
            <>
              <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] p-4">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-sm font-bold text-[var(--color-brand-700)]">Cumplimiento en ventana</h4>
                  <span className={`text-2xl font-bold ${pct === null ? 'text-[var(--unilabor-neutral)]' : pct >= 90 ? 'text-[#1c7a4a]' : pct >= 70 ? 'text-[#d0952a]' : 'text-[#b02a2a]'}`}>{pct === null ? '—' : `${pct}%`}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[rgba(191,212,230,0.35)]">
                  <div className={`h-full rounded-full ${pct !== null && pct >= 90 ? 'bg-[#1c7a4a]' : pct !== null && pct >= 70 ? 'bg-[#d0952a]' : 'bg-[#b02a2a]'}`} style={{ width: `${pct ?? 0}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                  <div><p className="text-lg font-bold text-[var(--color-brand-700)]">{kpis.compliance.due}</p><p className="text-[10px] uppercase text-[var(--unilabor-neutral)]">Debían ejecutarse</p></div>
                  <div><p className="text-lg font-bold text-[#1c7a4a]">{kpis.compliance.on_time}</p><p className="text-[10px] uppercase text-[var(--unilabor-neutral)]">En ventana</p></div>
                  <div><p className="text-lg font-bold text-[#d0952a]">{kpis.compliance.late}</p><p className="text-[10px] uppercase text-[var(--unilabor-neutral)]">Tarde</p></div>
                  <div><p className="text-lg font-bold text-[#b02a2a]">{kpis.compliance.open_overdue}</p><p className="text-[10px] uppercase text-[var(--unilabor-neutral)]">Vencidas abiertas</p></div>
                </div>
              </section>

              <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] p-4">
                <h4 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">Vencidas abiertas por criticidad</h4>
                <div className="space-y-1.5">
                  {kpis.overdue_by_criticality.map((c) => (
                    <Bar key={c.criticality} label={CRIT_LABEL[c.criticality] ?? c.criticality} value={c.count} max={maxCrit} tone={CRIT_BAR[c.criticality] ?? 'bg-[#64748b]'} />
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] p-4">
                <h4 className="mb-2 text-sm font-bold text-[var(--color-brand-700)]">Servicios por tipo</h4>
                <div className="space-y-1.5">
                  {kpis.by_kind.length === 0 ? <p className="text-xs text-[var(--unilabor-neutral)]">Sin servicios en el periodo.</p> : null}
                  {kpis.by_kind.map((k) => (
                    <div key={k.kind}>
                      <Bar label={KIND_LABELS[k.kind as keyof typeof KIND_LABELS] ?? k.kind} value={k.scheduled} max={maxKind} tone={KIND_STYLES[k.kind as keyof typeof KIND_STYLES]?.dot ?? 'bg-[#64748b]'} />
                      <p className="ml-30 pl-[7.5rem] text-[10px] text-[var(--unilabor-neutral)]">{k.closed} cerradas · {k.overdue} vencidas</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] p-4">
                  <h4 className="text-sm font-bold text-[var(--color-brand-700)]">Tiempo fuera de servicio</h4>
                  <p className="mt-1 text-xs text-[var(--unilabor-ink)]">Mantenimientos: <strong>{kpis.downtime.orders_avg_minutes ?? '—'}</strong> min promedio</p>
                  <p className="text-xs text-[var(--unilabor-ink)]">Correctivos: <strong>{kpis.downtime.tickets_avg_minutes ?? '—'}</strong> min promedio · {kpis.downtime.tickets_total_minutes} min totales</p>
                </div>
                <div className="rounded-2xl border border-[rgba(0,65,106,0.08)] p-4">
                  <h4 className="text-sm font-bold text-[var(--color-brand-700)]">Servicios externos</h4>
                  <p className="mt-1 text-xs text-[var(--unilabor-ink)]">{kpis.external_services.closed} de {kpis.external_services.scheduled} ejecutados</p>
                  <p className={`text-xs ${kpis.external_services.without_evidence > 0 ? 'font-semibold text-[#b02a2a]' : 'text-[var(--unilabor-ink)]'}`}>{kpis.external_services.without_evidence} cerrados sin evidencia adjunta</p>
                  <p className="text-xs text-[var(--unilabor-ink)]">{kpis.pending_validation} en validación</p>
                </div>
              </section>

              <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] p-4">
                <h4 className="mb-1 text-sm font-bold text-[var(--color-brand-700)]">Correctivos repetidos (≥3 en 6 meses)</h4>
                <p className="mb-2 text-[11px] text-[var(--unilabor-neutral)]">Candidatos a revisión del programa, reemplazo o baja.</p>
                {kpis.repeated_correctives.length === 0 ? (
                  <p className="text-xs text-[var(--unilabor-neutral)]">Ningún activo con correctivos repetidos.</p>
                ) : (
                  <ul className="divide-y divide-[rgba(0,65,106,0.06)]">
                    {kpis.repeated_correctives.map((a) => (
                      <li key={a.asset_id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                        <span className="min-w-0 truncate">
                          <strong className="text-[var(--color-brand-700)]">{a.asset_code}</strong> · {a.name} · <span className="font-bold text-[#b02a2a]">{a.tickets_6m} tickets</span>
                          {a.last_reported_at ? <span className="text-[var(--unilabor-neutral)]"> · último {formatDateTime(a.last_reported_at)}</span> : null}
                        </span>
                        <button type="button" onClick={() => navigate(`/helpdesk/assets/${a.asset_id}/program`)} className="inline-flex shrink-0 items-center gap-1 text-[var(--color-brand-500)] hover:underline">
                          Programa <ArrowRight size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
};
