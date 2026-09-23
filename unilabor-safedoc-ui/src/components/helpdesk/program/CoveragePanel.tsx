import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { fetchProgramCoverage, getApiErrorMessage } from '../../../api/service';
import type { CalendarFilters, CoverageSummary } from '../../../types/helpdesk-program';
import { notifyError } from '../../../utils/notify';

interface CoveragePanelProps {
  open: boolean;
  filters: CalendarFilters;
  onClose: () => void;
}

export const CoveragePanel = ({ open, filters, onClose }: CoveragePanelProps) => {
  const navigate = useNavigate();
  const [coverage, setCoverage] = useState<CoverageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCoverage(await fetchProgramCoverage(filters));
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudo calcular la cobertura.'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  if (!open) {
    return null;
  }
  const pct = coverage?.coverage_pct ?? 0;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-[rgba(11,34,53,0.35)] backdrop-blur-[1px]" onClick={onClose}>
      <aside className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Cobertura del programa</p>
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">Activos sin programa vigente</h3>
            <p className="text-xs text-[var(--unilabor-neutral)]">Criticidad media o mayor, o equipos sin criticidad definida. Respeta los filtros de unidad, área y responsable.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]">
            <X size={18} />
          </button>
        </div>
        <div className="border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${pct >= 90 ? 'bg-[rgba(34,139,84,0.12)] text-[#1c7a4a]' : 'bg-[rgba(190,40,40,0.12)] text-[#b02a2a]'}`}>
              {pct >= 90 ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
            </span>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[var(--color-brand-700)]">{coverage?.coverage_pct === null || !coverage ? '—' : `${coverage.coverage_pct}%`}</span>
                <span className="text-xs text-[var(--unilabor-neutral)]">
                  {coverage?.covered ?? 0} de {coverage?.should_have ?? 0} activos con rutina activa
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[rgba(191,212,230,0.4)]">
                <div className={`h-full rounded-full ${pct >= 90 ? 'bg-[#1c7a4a]' : pct >= 70 ? 'bg-[#d0952a]' : 'bg-[#b02a2a]'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={16} className="animate-spin" /> Calculando cobertura...
            </div>
          ) : coverage && coverage.gap_assets.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--unilabor-neutral)]">Todos los activos que lo requieren tienen programa vigente.</p>
          ) : (
            <ul className="divide-y divide-[rgba(0,65,106,0.06)]">
              {coverage?.gap_assets.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-brand-700)]">
                      {asset.asset_code} <span className="font-normal text-[var(--unilabor-ink)]">· {asset.name}</span>
                    </p>
                    <p className="truncate text-[11px] text-[var(--unilabor-neutral)]">
                      {[asset.category_name, asset.unit_name, asset.area_name, asset.criticality_name ?? 'Sin criticidad', asset.responsible_employee_name].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/helpdesk/assets/${asset.id}/program`)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
                  >
                    Crear programa <ArrowRight size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
};
