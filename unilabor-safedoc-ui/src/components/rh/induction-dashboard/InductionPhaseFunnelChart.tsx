import { useState } from 'react';
import type { InductionPhaseOverview, InductionStage } from '../../../types/models';
import { STAGE_GROUP_META, STAGE_GROUP_ORDER, STAGE_META, STAGE_ORDER, type InductionStageGroup } from '../../../utils/inductionDashboard';

interface InductionPhaseFunnelChartProps {
  phases: InductionPhaseOverview[];
  onSelectPhase?: (phaseId: number) => void;
}

interface Segment {
  group: InductionStageGroup;
  value: number;
  detail: Array<{ stage: InductionStage; count: number }>;
}

const groupSegments = (phase: InductionPhaseOverview): Segment[] =>
  STAGE_GROUP_ORDER.map((group) => {
    const detail = STAGE_ORDER.filter((stage) => STAGE_META[stage].group === group)
      .map((stage) => ({ stage, count: phase.stage_counts[stage] ?? 0 }))
      .filter((item) => item.count > 0);
    return { group, value: detail.reduce((acc, item) => acc + item.count, 0), detail };
  });

const BAR_HEIGHT = 26;
const ROW_GAP = 18;
const LABEL_WIDTH = 150;
const VALUE_WIDTH = 56;
const GAP = 2;

/**
 * Embudo por fase: una barra apilada por fase (misma escala en todas) con los
 * cuatro grupos de etapa. Etiquetas directas en los segmentos anchos, leyenda
 * siempre presente, tooltip por segmento y tabla de respaldo bajo la gráfica.
 */
export const InductionPhaseFunnelChart = ({ phases, onSelectPhase }: InductionPhaseFunnelChartProps) => {
  const [hover, setHover] = useState<{ phaseId: number; group: InductionStageGroup; x: number; y: number } | null>(null);
  const [width, setWidth] = useState(720);
  const max = Math.max(1, ...phases.map((phase) => phase.enrolled));
  const plotWidth = Math.max(120, width - LABEL_WIDTH - VALUE_WIDTH);
  const height = phases.length * (BAR_HEIGHT + ROW_GAP) + 8;

  const hovered = hover
    ? (() => {
        const phase = phases.find((item) => item.phase_id === hover.phaseId);
        const segment = phase ? groupSegments(phase).find((item) => item.group === hover.group) : null;
        return phase && segment ? { phase, segment } : null;
      })()
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {STAGE_GROUP_ORDER.map((group) => (
          <span key={group} className="inline-flex items-center gap-1.5 text-[var(--unilabor-ink)]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STAGE_GROUP_META[group].color }} aria-hidden />
            {STAGE_GROUP_META[group].label}
          </span>
        ))}
      </div>

      <div
        className="relative"
        ref={(node) => {
          if (node && Math.abs(node.clientWidth - width) > 4) setWidth(node.clientWidth);
        }}
      >
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Inscritos por fase y etapa">
          {phases.map((phase, index) => {
            const y = index * (BAR_HEIGHT + ROW_GAP) + 4;
            const segments = groupSegments(phase);
            let x = LABEL_WIDTH;
            return (
              <g key={phase.phase_id}>
                <text
                  x={LABEL_WIDTH - 12}
                  y={y + BAR_HEIGHT / 2 + 4}
                  textAnchor="end"
                  className="cursor-pointer fill-[var(--unilabor-ink)] text-[12px] font-semibold"
                  onClick={() => onSelectPhase?.(phase.phase_id)}
                >
                  Fase {phase.phase_number}
                </text>
                <rect x={LABEL_WIDTH} y={y} width={plotWidth} height={BAR_HEIGHT} rx={4} fill="rgba(0,65,106,0.05)" />
                {segments.map((segment) => {
                  if (segment.value === 0) return null;
                  const w = Math.max(0, (segment.value / max) * plotWidth - GAP);
                  const rectX = x;
                  x += (segment.value / max) * plotWidth;
                  const isHover = hover?.phaseId === phase.phase_id && hover.group === segment.group;
                  return (
                    <g key={segment.group}>
                      <rect
                        x={rectX}
                        y={y}
                        width={w}
                        height={BAR_HEIGHT}
                        rx={3}
                        fill={STAGE_GROUP_META[segment.group].color}
                        opacity={hover && !isHover ? 0.55 : 1}
                        className="cursor-pointer transition-opacity"
                        onMouseEnter={() => setHover({ phaseId: phase.phase_id, group: segment.group, x: rectX + w / 2, y })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => onSelectPhase?.(phase.phase_id)}
                      />
                      {w >= 28 ? (
                        <text
                          x={rectX + w / 2}
                          y={y + BAR_HEIGHT / 2 + 4}
                          textAnchor="middle"
                          className="pointer-events-none fill-white text-[11px] font-bold"
                        >
                          {segment.value}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                <text x={LABEL_WIDTH + plotWidth + 10} y={y + BAR_HEIGHT / 2 + 4} className="fill-[var(--unilabor-neutral)] text-[12px] font-semibold">
                  {phase.enrolled}
                </text>
              </g>
            );
          })}
        </svg>
        {hovered ? (
          <div
            className="pointer-events-none absolute z-10 min-w-[180px] -translate-x-1/2 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: hover?.x, top: (hover?.y ?? 0) + BAR_HEIGHT + 6 }}
          >
            <p className="font-bold text-[var(--color-brand-700)]">
              Fase {hovered.phase.phase_number} · {STAGE_GROUP_META[hovered.segment.group].label}: {hovered.segment.value}
            </p>
            <ul className="mt-1 space-y-0.5 text-[var(--unilabor-ink)]">
              {hovered.segment.detail.map((item) => (
                <li key={item.stage} className="flex justify-between gap-3">
                  <span>{STAGE_META[item.stage].label}</span>
                  <span className="font-semibold">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-[var(--color-brand-500)]">Ver tabla de etapas</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-[rgba(248,251,253,0.9)] text-[10px] uppercase tracking-wide text-[var(--unilabor-neutral)]">
              <tr>
                <th className="px-3 py-1.5">Etapa</th>
                {phases.map((phase) => (
                  <th key={phase.phase_id} className="px-3 py-1.5 text-right">
                    Fase {phase.phase_number}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAGE_ORDER.map((stage) => (
                <tr key={stage} className="border-t border-[rgba(0,65,106,0.06)]">
                  <td className="px-3 py-1">{STAGE_META[stage].label}</td>
                  {phases.map((phase) => (
                    <td key={phase.phase_id} className="px-3 py-1 text-right tabular-nums">
                      {phase.stage_counts[stage] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};
