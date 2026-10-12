import { Target } from 'lucide-react';
import type { CommitmentBoard } from '../../../api/service.api-attendance-boards';
import { COMMITMENT_LEVEL_LABEL } from '../shared/dayResult';
import { levelColor } from './boardHelpers';
import { buildKpis } from './boardKpis';
import { LevelBadge, MiniBar, ProgressRing } from './BoardParts';
import { cardClass } from './boardStyles';

export const CommitmentKpis = ({ board }: { board: CommitmentBoard }) => {
  const { team, weights } = board;
  const color = levelColor(team.level);
  const kpis = buildKpis(team, weights);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
      <div className={`${cardClass} flex items-center gap-4`}>
        <ProgressRing value={team.index} color={color} size={112} sub="Compromiso" />
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--unilabor-neutral)]">
            <Target size={14} aria-hidden="true" /> Equipo
          </p>
          <div className="mt-1.5"><LevelBadge label={COMMITMENT_LEVEL_LABEL[team.level] ?? team.level} color={color} /></div>
          <p className="mt-2 text-xs text-[var(--unilabor-neutral)]">{team.employees} colaboradores</p>
          <p className="text-xs text-[var(--unilabor-neutral)]">Ejemplar ≥ {weights.exemplary} · Atención &lt; {weights.attention}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${cardClass} !p-4`}>
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--unilabor-neutral)]">
              <kpi.icon size={15} style={{ color: kpi.color }} aria-hidden="true" />
              {kpi.label}
            </div>
            <p className="mt-1 text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
            {kpi.bar !== undefined && <div className="mt-1.5"><MiniBar value={kpi.bar} color={kpi.color} /></div>}
            <p className="mt-1.5 text-[11px] leading-tight text-[var(--unilabor-neutral)]">{kpi.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
