import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Layers, Loader2, Search, X } from 'lucide-react';
import { getApiErrorMessage, listMaintenancePlans } from '../../../api/service';
import { Pagination } from '../../Pagination';
import type { HelpdeskMaintenancePlan } from '../../../types/models';
import { addDays, formatDateShort, todayIso } from '../../../utils/maintenanceProgram';
import { notifyError } from '../../../utils/notify';

interface PlansPanelProps {
  open: boolean;
  onClose: () => void;
  onShowInCalendar: (plan: HelpdeskMaintenancePlan) => void;
}

type PlanState = 'overdue' | 'soon' | 'ok';

const SOON_DAYS = 30;
const PAGE_SIZE = 10;

const STATE_BADGES: Record<PlanState, { label: string; className: string }> = {
  overdue: { label: 'Vencido', className: 'bg-[rgba(190,40,40,0.12)] text-[#b02a2a]' },
  soon: { label: 'Próximo', className: 'bg-[rgba(208,149,42,0.16)] text-[#8a5a00]' },
  ok: { label: 'Vigente', className: 'bg-[rgba(34,139,84,0.12)] text-[#1c7a4a]' },
};

// Las fechas ISO (AAAA-MM-DD) se comparan como texto.
const planState = (plan: HelpdeskMaintenancePlan, today: string): PlanState => {
  const due = plan.next_due_on.slice(0, 10);
  if (due < today) return 'overdue';
  return due <= addDays(today, SOON_DAYS) ? 'soon' : 'ok';
};

// Inventario de planes (rutinas) de todos los activos. Es de consulta: los planes se
// crean y modifican en el programa de cada activo y las ordenes se atienden en el calendario.
export const PlansPanel = ({ open, onClose, onShowInCalendar }: PlansPanelProps) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<HelpdeskMaintenancePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await listMaintenancePlans());
    } catch (error) {
      notifyError(getApiErrorMessage(error, 'No se pudieron cargar los planes de mantenimiento.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  const today = todayIso();
  const rows = useMemo(() => plans.map((plan) => ({ plan, state: planState(plan, today) })), [plans, today]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return rows;
    }
    return rows.filter(({ plan }) =>
      [plan.plan_code, plan.title, plan.asset?.asset_code, plan.asset?.name, plan.frequency?.name, plan.responsible_employee?.full_name, plan.provider_name]
        .some((value) => (value ?? '').toLowerCase().includes(normalizedQuery)),
    );
  }, [rows, query]);

  if (!open) {
    return null;
  }

  // El servicio devuelve todos los planes, asi que se pagina en el cliente. La pagina se
  // acota por si la lista se acorta (busqueda o recarga) estando en una pagina posterior.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const changePage = (next: number) => {
    setPage(next);
    listRef.current?.scrollTo({ top: 0 });
  };

  const counters = [
    { label: 'Planes', value: rows.length, tone: 'text-[var(--color-brand-700)]' },
    { label: 'Vencidos', value: rows.filter((row) => row.state === 'overdue').length, tone: 'text-[#b02a2a]' },
    { label: `Próximos ${SOON_DAYS} días`, value: rows.filter((row) => row.state === 'soon').length, tone: 'text-[#8a5a00]' },
  ];
  const actionClass = 'inline-flex items-center gap-1 rounded-lg border border-[rgba(0,65,106,0.14)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]';

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-[rgba(11,34,53,0.35)] backdrop-blur-[1px]" onClick={onClose}>
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">Planes de mantenimiento</p>
            <h3 className="text-lg font-bold text-[var(--color-brand-700)]">Rutinas de todos los activos</h3>
            <p className="text-xs text-[var(--unilabor-neutral)]">Solo consulta: los planes se crean y modifican en el programa de cada activo.</p>
          </div>
          <button type="button" onClick={onClose} title="Cerrar" className="rounded-lg p-1 text-[var(--unilabor-neutral)] hover:bg-[rgba(191,212,230,0.3)]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 border-b border-[rgba(0,65,106,0.08)] px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            {counters.map((counter) => (
              <div key={counter.label} className="rounded-xl bg-[rgba(248,251,253,0.9)] px-3 py-2">
                <p className={`text-xl font-bold ${counter.tone}`}>{counter.value}</p>
                <p className="text-[11px] text-[var(--unilabor-neutral)]">{counter.label}</p>
              </div>
            ))}
          </div>
          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--unilabor-neutral)]" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar por plan, activo, frecuencia, responsable o proveedor"
              className="h-9 w-full rounded-xl border border-[rgba(0,65,106,0.14)] bg-white pl-8 pr-3 text-sm text-[var(--unilabor-ink)]"
            />
          </label>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--unilabor-neutral)]">
              <Loader2 size={16} className="animate-spin" /> Cargando planes...
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--unilabor-neutral)]">
              {rows.length === 0 ? 'No hay planes de mantenimiento registrados.' : 'Ningún plan coincide con la búsqueda.'}
            </p>
          ) : (
            <ul className="divide-y divide-[rgba(0,65,106,0.06)]">
              {pageRows.map(({ plan, state }) => (
                <li key={plan.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-brand-700)]">
                        {plan.plan_code} <span className="font-normal text-[var(--unilabor-ink)]">· {plan.title}</span>
                      </p>
                      <p className="truncate text-[11px] text-[var(--unilabor-neutral)]">
                        {[plan.asset ? `${plan.asset.asset_code} ${plan.asset.name}` : 'Sin activo', plan.frequency?.name ?? 'Sin frecuencia', plan.responsible_employee?.full_name ?? plan.provider_name]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-[var(--unilabor-ink)]">{formatDateShort(plan.next_due_on)}</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_BADGES[state].className}`}>{STATE_BADGES[state].label}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={actionClass} title="Abrir el programa del activo: ahí se modifican sus planes" onClick={() => navigate(`/helpdesk/assets/${plan.asset_id}/program`)}>
                      <Layers size={12} /> Programa
                    </button>
                    <button type="button" className={actionClass} title="Ver su próxima orden en el calendario" onClick={() => onShowInCalendar(plan)}>
                      <CalendarDays size={12} /> Calendario
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {loading ? null : (
          <div className="border-t border-[rgba(0,65,106,0.08)] px-1">
            <Pagination page={currentPage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={changePage} />
          </div>
        )}
      </aside>
    </div>
  );
};
