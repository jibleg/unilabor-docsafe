import { useState } from 'react';
import { Briefcase, CalendarRange } from 'lucide-react';
import type { CompetencyDashboardEmployee, CompetencyDashboardEvaluation } from '../../../types/competencyDashboard';
import {
  STANDING_META,
  STANDING_ORDER,
  coverageByPosition,
  formatMonth,
  monthlyTimeline,
} from '../../../utils/competencyDashboard';
import { ChartCard, EmptyChart } from './CompetencyCharts';

const SERIES = [
  { key: 'closed', label: 'Evaluaciones cerradas', color: '#0069a6' },
  { key: 'drafts', label: 'En captura', color: '#7cadd3' },
  { key: 'expiring', label: 'Vencimientos de autorización', color: '#d97706' },
] as const;

/** Barras agrupadas por mes: evaluaciones realizadas y vencimientos (misma unidad: colaboradores/evaluaciones). */
const MonthlyChart = ({ evaluations, employees, today }: { evaluations: CompetencyDashboardEvaluation[]; employees: CompetencyDashboardEmployee[]; today: string }) => {
  const [hover, setHover] = useState<number | null>(null);
  const data = monthlyTimeline(evaluations, employees, today);
  const max = Math.max(1, ...data.map((m) => Math.max(m.closed + m.drafts, m.expiring)));
  const W = 760, H = 190, padL = 28, padB = 28, top = 14;
  const slot = (W - padL) / data.length;
  const bw = Math.max(6, slot / 2 - 4);
  const plotH = H - padB - top;
  const current = today.slice(0, 7);
  return (
    <div className="relative">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evaluaciones y vencimientos por mes">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={H - padB - t * plotH} y2={H - padB - t * plotH} stroke="rgba(0,65,106,0.08)" />
            <text x={padL - 5} y={H - padB - t * plotH + 3} textAnchor="end" className="fill-[var(--unilabor-neutral)] text-[9px]">
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        {data.map((m, i) => {
          const x = padL + i * slot + 3;
          const base = H - padB;
          const hClosed = (plotH * m.closed) / max;
          const hDraft = (plotH * m.drafts) / max;
          const hExp = (plotH * m.expiring) / max;
          const isCurrent = m.month === current;
          const dim = hover !== null && hover !== i ? 0.4 : 1;
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={top} width={slot} height={plotH} fill={isCurrent ? 'rgba(0,105,166,0.06)' : 'transparent'} />
              <rect x={x} y={base - hClosed} width={bw} height={hClosed} rx={3} fill={SERIES[0].color} opacity={dim} style={{ transformOrigin: `${x}px ${base}px`, animation: `agr-grow .6s ease ${i * 30}ms both` }} />
              <rect x={x} y={base - hClosed - hDraft - (hDraft && hClosed ? 2 : 0)} width={bw} height={hDraft} rx={3} fill={SERIES[1].color} opacity={dim} style={{ transformOrigin: `${x}px ${base}px`, animation: `agr-grow .6s ease ${i * 30 + 60}ms both` }} />
              <rect x={x + bw + 2} y={base - hExp} width={bw} height={hExp} rx={3} fill={SERIES[2].color} opacity={dim} style={{ transformOrigin: `${x}px ${base}px`, animation: `agr-grow .6s ease ${i * 30 + 120}ms both` }} />
              <text x={padL + i * slot + slot / 2} y={H - 9} textAnchor="middle" className={`text-[9px] ${isCurrent ? 'fill-[var(--color-brand-700)] font-bold' : 'fill-[var(--unilabor-neutral)]'}`}>
                {i % 2 === 0 || isCurrent || hover === i ? formatMonth(m.month) : ''}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null ? (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-[rgba(0,65,106,0.12)] bg-white px-3 py-2 text-xs shadow-lg" style={{ animation: 'agr-fade .15s ease both' }}>
          <p className="font-bold text-[var(--color-brand-700)]">{formatMonth(data[hover].month)}</p>
          {SERIES.map((series) => (
            <p key={series.key} className="flex items-center gap-1.5 text-[var(--unilabor-ink)]">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: series.color }} /> {series.label}: <b>{data[hover][series.key]}</b>
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-[var(--unilabor-ink)]">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} /> {series.label}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Barras apiladas por puesto (estado de cada colaborador); clic filtra por puesto. */
const PositionCoverageChart = ({ employees, activePositionId, onFocusPosition }: { employees: CompetencyDashboardEmployee[]; activePositionId: string; onFocusPosition: (positionId: string) => void }) => {
  const rows = coverageByPosition(employees).slice(0, 12);
  if (rows.length === 0) {
    return <EmptyChart text="No hay colaboradores con puesto en la selección." />;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row, i) => {
        const competent = row.counts.VIGENTE + row.counts.POR_VENCER;
        const active = activePositionId === String(row.position_id);
        return (
          <li key={row.position_id}>
            <button
              type="button"
              onClick={() => onFocusPosition(active ? '' : String(row.position_id))}
              className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[rgba(239,245,250,1)] ${active ? 'bg-[rgba(239,245,250,1)] ring-1 ring-[rgba(0,105,166,0.25)]' : ''}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-[var(--unilabor-ink)]">{row.position_name}</span>
                <span className="shrink-0 tabular-nums text-[var(--unilabor-neutral)]">
                  <b className="text-emerald-700">{competent}</b>/{row.total} competentes
                </span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.06)]">
                {STANDING_ORDER.filter((standing) => row.counts[standing] > 0).map((standing, j) => (
                  <span
                    key={standing}
                    title={`${STANDING_META[standing].label}: ${row.counts[standing]}`}
                    style={{ width: `${(row.counts[standing] / row.total) * 100}%`, backgroundColor: STANDING_META[standing].color, marginLeft: j ? 2 : 0, animation: `agr-wide .7s ease ${i * 40}ms both` }}
                  />
                ))}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

interface CompetencyTimelineCoverageProps {
  evaluations: CompetencyDashboardEvaluation[];
  employees: CompetencyDashboardEmployee[];
  today: string;
  activePositionId: string;
  onFocusPosition: (positionId: string) => void;
}

export const CompetencyTimelineCoverage = ({ evaluations, employees, today, activePositionId, onFocusPosition }: CompetencyTimelineCoverageProps) => (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
    <div className="xl:col-span-3">
      <ChartCard icon={CalendarRange} title="Calendario de evaluaciones y vencimientos" hint="6 meses atrás y 12 hacia adelante · el mes actual va resaltado">
        <MonthlyChart evaluations={evaluations} employees={employees} today={today} />
      </ChartCard>
    </div>
    <div className="xl:col-span-2">
      <ChartCard icon={Briefcase} title="Cobertura por puesto" hint="Estado de los colaboradores de cada puesto · clic para filtrar">
        <PositionCoverageChart employees={employees} activePositionId={activePositionId} onFocusPosition={onFocusPosition} />
      </ChartCard>
    </div>
  </div>
);
