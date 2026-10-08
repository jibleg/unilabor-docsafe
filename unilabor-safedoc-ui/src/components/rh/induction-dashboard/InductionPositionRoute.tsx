import type { InductionPositionTrackEntry } from '../../../types/models';
import { STAGE_META, competencyStage } from '../../../utils/inductionDashboard';

const entryLabel = (entry: InductionPositionTrackEntry): { text: string; className: string } => {
  if (entry.queue_status === 'CANCELLED') return { text: 'Baja (puesto retirado)', className: 'bg-slate-100 text-slate-500 line-through' };
  if (entry.competency) {
    const stage = competencyStage(entry.competency);
    return { text: STAGE_META[stage].short, className: STAGE_META[stage].className };
  }
  if (entry.passed) return { text: 'Acreditado', className: 'bg-emerald-100 text-emerald-700' };
  if (entry.queue_status === 'QUEUED') return { text: 'En cola', className: 'bg-slate-100 text-slate-600' };
  if (entry.queue_status === 'ACTIVE') return { text: 'En curso', className: 'bg-sky-100 text-sky-800' };
  return { text: 'Pendiente', className: 'bg-amber-100 text-amber-800' };
};

interface InductionPositionRouteProps {
  phaseNumber: number;
  positions: InductionPositionTrackEntry[];
  selectedEnrollmentId: number | null;
  onSelect: (enrollmentId: number) => void;
}

/**
 * Ruta por puesto de una fase (5-7) en la vista 360: los puestos en orden, uno
 * tras otro, con su estado. Elegir un puesto iniciado muestra su detalle.
 */
export const InductionPositionRoute = ({ phaseNumber, positions, selectedEnrollmentId, onSelect }: InductionPositionRouteProps) => {
  const open = positions.filter((entry) => entry.queue_status !== 'CANCELLED');
  return (
    <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-3">
      <p className="text-xs font-bold text-[var(--color-brand-700)]">
        Ruta por puesto · Fase {phaseNumber} ({open.filter((entry) => entry.passed).length} de {open.length} acreditados)
      </p>
      <ol className="mt-2 space-y-1">
        {positions.map((entry) => {
          const label = entryLabel(entry);
          const selectable = entry.enrollment_id !== null && entry.queue_status === 'ACTIVE';
          const selected = selectable && entry.enrollment_id === selectedEnrollmentId;
          return (
            <li key={`${entry.position_id}-${entry.sequence}`}>
              <button
                type="button"
                disabled={!selectable}
                onClick={() => entry.enrollment_id && onSelect(entry.enrollment_id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1 text-left text-[11px] ${
                  selected ? 'border-[var(--color-brand-300)] bg-[rgba(191,212,230,0.3)]' : 'border-transparent hover:bg-slate-50'
                } disabled:cursor-default`}
              >
                <span className="truncate">
                  <span className="mr-1 font-mono text-[10px] text-[var(--unilabor-neutral)]">{entry.sequence}.</span>
                  <span className="font-mono font-semibold">{entry.position_code}</span> {entry.position_name}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${label.className}`}>{label.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
