import { ClipboardList } from 'lucide-react';
import { InductionPositionReadinessTable } from './InductionPositionReadinessTable';
import { InductionTransitionBoard } from './InductionTransitionBoard';
import type { InductionProgramOverview, InductionTransitionTarget } from '../../../types/models';
import { TRANSITION_TARGET_META, TRANSITION_TARGETS } from '../../../utils/inductionDashboard';

export type TransitionsTab = InductionTransitionTarget | 'positions';

interface InductionTransitionsViewProps {
  tab: TransitionsTab;
  overview: InductionProgramOverview | null;
  refreshKey: number;
  onTabChange: (tab: TransitionsTab) => void;
  onChanged: () => void;
  onOpenEmployee: (employeeId: number) => void;
}

const cardClass = 'rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]';

/**
 * "Bandeja de avance" del tablero: control de las fases por puesto (5-7). Una
 * pestaña por transición con sus listos/bloqueados y una de preparación por
 * puesto para saber qué configurar para destrabar a los bloqueados.
 */
export const InductionTransitionsView = ({ tab, overview, refreshKey, onTabChange, onChanged, onOpenEmployee }: InductionTransitionsViewProps) => {
  const counts = (target: InductionTransitionTarget) => overview?.transitions.find((item) => item.target === target);
  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
      active ? 'bg-[var(--color-brand-700)] text-white shadow' : 'bg-[rgba(191,212,230,0.4)] text-[var(--color-brand-700)] hover:bg-[rgba(124,173,211,0.3)]'
    }`;

  return (
    <section className={`${cardClass} space-y-4`}>
      <div>
        <h2 className="text-lg font-bold text-[var(--color-brand-700)]">Bandeja de avance · Fases 5-7 por puesto</h2>
        <p className="text-xs text-[var(--unilabor-neutral)]">
          Nadie se queda detenido: quien aprueba una fase aparece aquí hasta que entra a la siguiente. Una fase por puesto solo recibe colaboradores
          cuando su puesto tiene todo listo (evaluación publicada, documentos, habilitación).
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TRANSITION_TARGETS.map((target) => {
          const item = counts(target);
          const waiting = (item?.READY ?? 0) + (item?.BLOCKED ?? 0);
          return (
            <button key={target} type="button" onClick={() => onTabChange(target)} className={tabClass(tab === target)}>
              {TRANSITION_TARGET_META[target].label}
              {item ? (
                <span className="flex items-center gap-1 text-[10px] font-bold">
                  <span className="rounded-full bg-emerald-100 px-1.5 text-emerald-800">{item.READY} listos</span>
                  {item.BLOCKED > 0 ? <span className="rounded-full bg-rose-100 px-1.5 text-rose-700">{item.BLOCKED} bloq.</span> : null}
                  {waiting === 0 && item.STARTED === 0 ? <span className="opacity-70">sin pendientes</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
        <button type="button" onClick={() => onTabChange('positions')} className={tabClass(tab === 'positions')}>
          <ClipboardList size={15} /> Preparación por puesto
        </button>
      </div>

      {tab === 'positions' ? (
        <InductionPositionReadinessTable refreshKey={refreshKey} />
      ) : (
        <InductionTransitionBoard key={tab} target={tab} refreshKey={refreshKey} onChanged={onChanged} onOpenEmployee={onOpenEmployee} />
      )}
    </section>
  );
};
