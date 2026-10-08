import type { InductionTransitionPositionStatus } from '../../../types/models';
import { POSITION_STATUS_META } from '../../../utils/inductionDashboard';

export interface PositionChip {
  position_code: string;
  position_name: string;
  status: InductionTransitionPositionStatus;
  detail?: string | null;
}

/**
 * Ruta por puesto de un colaborador en una línea: un chip por puesto, en orden,
 * con su estado (el detalle va en el tooltip). `highlight` marca el puesto con
 * el que inicia o sigue la fase.
 */
export const InductionPositionChips = ({ positions, highlight }: { positions: PositionChip[]; highlight?: string | null }) => (
  <div className="flex max-w-[260px] flex-wrap gap-1">
    {positions.map((position, index) => {
      const meta = POSITION_STATUS_META[position.status];
      return (
        <span
          key={`${position.position_code}-${index}`}
          title={`${index + 1}. ${position.position_name} — ${meta.label}${position.detail ? `: ${position.detail}` : ''}`}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${meta.className} ${
            highlight && highlight === position.position_code ? 'ring-1 ring-[var(--color-brand-500)]' : ''
          }`}
        >
          <span className="text-[9px] opacity-60">{index + 1}</span>
          {position.position_code}
        </span>
      );
    })}
  </div>
);
