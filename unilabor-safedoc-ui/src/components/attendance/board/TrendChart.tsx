import { DAY_RESULT_COLOR } from '../shared/dayResult';
import { niceMax } from './boardHelpers';
import { EmptyNote } from './BoardParts';

interface Block { key: string; label: string; attendances: number; lates: number; absences: number; incidents: number }

const SERIES = [
  { key: 'attendances', label: 'Asistencias', color: DAY_RESULT_COLOR.present },
  { key: 'lates', label: 'Retardos', color: DAY_RESULT_COLOR.late },
  { key: 'absences', label: 'Faltas', color: DAY_RESULT_COLOR.absent },
  { key: 'incidents', label: 'Incidencias', color: DAY_RESULT_COLOR.incident },
] as const;

/** Barras apiladas SVG hechas a mano; sirve para la tendencia en vivo (14 dias) y la de compromiso. */
export const StackedTrend = ({ blocks, title, tooltipLabel }: {
  blocks: Block[];
  title: string;
  tooltipLabel?: (block: Block) => string;
}) => {
  const W = 640;
  const H = 200;
  const padL = 28;
  const padB = 28;
  const padT = 8;
  const total = (b: Block) => b.attendances + b.lates + b.absences + b.incidents;
  const max = niceMax(blocks.map(total));
  const slot = (W - padL) / Math.max(1, blocks.length);
  const barW = Math.min(36, slot * 0.7);
  const plotH = H - padB - padT;
  const everyN = blocks.length > 16 ? 2 : 1;
  const hasData = blocks.some((b) => total(b) > 0);

  return (
    <div>
      {!hasData && <EmptyNote>Sin movimientos registrados en este periodo.</EmptyNote>}
      <div className={hasData ? '' : 'hidden'}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={W} y1={padT + plotH * (1 - f)} y2={padT + plotH * (1 - f)} stroke="rgba(0,65,106,0.1)" />
              <text x={padL - 4} y={padT + plotH * (1 - f) + 3} textAnchor="end" fontSize="10" fill="#6b7280">{Math.round(max * f)}</text>
            </g>
          ))}
          {blocks.map((block, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            let acc = 0;
            const tip = tooltipLabel
              ? tooltipLabel(block)
              : `${block.label}: ${block.attendances} asistencias, ${block.lates} retardos, ${block.absences} faltas, ${block.incidents} incidencias`;
            return (
              <g key={block.key}>
                <title>{tip}</title>
                {SERIES.map((serie) => {
                  const value = block[serie.key];
                  if (!value) return null;
                  const h = (value / max) * plotH;
                  acc += h;
                  return <rect key={serie.key} x={x} y={padT + plotH - acc} width={barW} height={h} fill={serie.color} rx={2} />;
                })}
                {i % everyN === 0 && (
                  <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="#6b7280">{block.label}</text>
                )}
              </g>
            );
          })}
        </svg>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--unilabor-neutral)]">
          {SERIES.map((serie) => (
            <li key={serie.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: serie.color }} aria-hidden="true" />
              {serie.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
