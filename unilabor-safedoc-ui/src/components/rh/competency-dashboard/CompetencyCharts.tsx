import { useState } from 'react';
import { BarChart3, Gavel, PieChart } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CompetencyDashboardEmployee, CompetencyDashboardEvaluation, CompetencyStanding } from '../../../types/competencyDashboard';
import { DICTAMEN_UI } from '../../../utils/competency';
import {
  DICTAMEN_COLORS,
  DICTAMEN_ORDER,
  SECTION_META,
  STANDING_META,
  STANDING_ORDER,
  countByDictamen,
  countByStanding,
  scoreColor,
  sectionAverages,
} from '../../../utils/competencyDashboard';

export const ChartCard = ({ icon: Icon, title, hint, children }: { icon: typeof PieChart; title: string; hint?: string; children: ReactNode }) => (
  <section className="rounded-2xl border border-[rgba(0,65,106,0.08)] bg-white/90 p-5 shadow-xl shadow-[rgba(0,65,106,0.08)]" style={{ animation: 'agr-pop .5s ease both' }}>
    <div className="mb-3">
      <h2 className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
        <Icon size={16} /> {title}
      </h2>
      {hint ? <p className="mt-0.5 text-[11px] text-[var(--unilabor-neutral)]">{hint}</p> : null}
    </div>
    {children}
  </section>
);

const polar = (cx: number, cy: number, r: number, angle: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
const arcPath = (cx: number, cy: number, r: number, from: number, to: number): string => {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${b.x} ${b.y}`;
};

interface StandingDonutProps {
  employees: CompetencyDashboardEmployee[];
  activeStanding: CompetencyStanding | null;
  onFocusStanding: (standing: CompetencyStanding | null) => void;
}

/** Dona del estado de competencia con leyenda clicable (enfoca el tablero). */
const StandingDonut = ({ employees, activeStanding, onFocusStanding }: StandingDonutProps) => {
  const [hover, setHover] = useState<CompetencyStanding | null>(null);
  const counts = countByStanding(employees);
  const total = employees.length;
  const cx = 80, cy = 80, r = 62;
  const present = STANDING_ORDER.filter((standing) => counts[standing] > 0);
  const sweeps = present.map((standing) => (counts[standing] / Math.max(1, total)) * Math.PI * 2);
  const segments = present.map((standing, i) => {
    const from = -Math.PI / 2 + sweeps.slice(0, i).reduce((sum, value) => sum + value, 0);
    const gap = sweeps[i] >= Math.PI * 2 - 0.01 ? 0.001 : 0.035;
    return { standing, from, to: Math.max(from + 0.02, from + sweeps[i] - gap) };
  });
  const focus = hover ?? activeStanding;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Colaboradores por estado de competencia">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,65,106,0.08)" strokeWidth="20" />
        {segments.map((segment) => (
          <path
            key={segment.standing}
            d={arcPath(cx, cy, r, segment.from, segment.to)}
            fill="none"
            stroke={STANDING_META[segment.standing].color}
            strokeWidth={focus === segment.standing ? 26 : 20}
            opacity={focus && focus !== segment.standing ? 0.3 : 1}
            className="cursor-pointer transition-all duration-300"
            onMouseEnter={() => setHover(segment.standing)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onFocusStanding(activeStanding === segment.standing ? null : segment.standing)}
            style={{ animation: 'agr-draw 1s ease both', strokeDasharray: 400 }}
          >
            <title>{`${STANDING_META[segment.standing].label}: ${counts[segment.standing]}`}</title>
          </path>
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-[var(--color-brand-700)] text-[28px] font-black">
          {focus ? counts[focus] : total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-[var(--unilabor-neutral)] text-[9px] font-semibold uppercase">
          {focus ? STANDING_META[focus].label.slice(0, 22) : 'colaboradores'}
        </text>
      </svg>
      <ul className="min-w-[180px] flex-1 space-y-1 text-xs">
        {STANDING_ORDER.map((standing) => {
          const meta = STANDING_META[standing];
          const Icon = meta.icon;
          return (
            <li key={standing}>
              <button
                type="button"
                onMouseEnter={() => setHover(standing)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onFocusStanding(activeStanding === standing ? null : standing)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-[rgba(239,245,250,1)] ${
                  activeStanding === standing ? 'bg-[rgba(239,245,250,1)] ring-1 ring-[rgba(0,105,166,0.2)]' : ''
                }`}
              >
                <span className="inline-flex items-center gap-2 text-[var(--unilabor-ink)]">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
                  <Icon size={13} className={meta.text} />
                  {meta.label}
                </span>
                <span className="font-bold tabular-nums text-[var(--color-brand-700)]">{counts[standing]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Promedio por sección del REH-REG-003 (evaluaciones cerradas) con su peso. */
const SectionAverages = ({ evaluations }: { evaluations: CompetencyDashboardEvaluation[] }) => {
  const averages = sectionAverages(evaluations);
  const closed = evaluations.filter((evaluation) => evaluation.status === 'CLOSED').length;
  if (closed === 0) {
    return <EmptyChart text="Aún no hay evaluaciones cerradas en la selección." />;
  }
  return (
    <div className="space-y-3">
      {SECTION_META.map((section, i) => {
        const value = averages[section.key];
        return (
          <div key={section.key} className="text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-[var(--unilabor-ink)]">
                {section.label} <span className="font-normal text-[var(--unilabor-neutral)]">· peso {section.weight}%</span>
              </span>
              <span className="font-black tabular-nums text-[var(--color-brand-700)]">{value !== null ? `${value}%` : '—'}</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
              <span className="block h-full rounded-full" style={{ width: `${value ?? 0}%`, backgroundColor: section.color, animation: `agr-wide .8s ease ${i * 90}ms both` }} />
              <span className="absolute inset-y-0 w-px bg-[var(--color-brand-700)]/40" style={{ left: '90%' }} title="Umbral competente y autorizado (90%)" />
            </div>
          </div>
        );
      })}
      <div className="mt-2 flex items-center justify-between rounded-xl border border-[rgba(0,65,106,0.08)] bg-[rgba(248,251,253,1)] px-3 py-2">
        <span className="text-xs font-semibold text-[var(--unilabor-ink)]">Calificación final promedio</span>
        <span className="text-lg font-black tabular-nums" style={{ color: scoreColor(averages.final_pct) }}>
          {averages.final_pct !== null ? `${averages.final_pct}%` : '—'}
        </span>
      </div>
      <p className="text-[10px] text-[var(--unilabor-neutral)]">Base: {closed} evaluación(es) cerrada(s). La línea marca el umbral de 90%.</p>
    </div>
  );
};

/** Distribución de dictámenes de las evaluaciones cerradas. */
const DictamenBars = ({ evaluations }: { evaluations: CompetencyDashboardEvaluation[] }) => {
  const counts = countByDictamen(evaluations);
  const total = DICTAMEN_ORDER.reduce((sum, dictamen) => sum + counts[dictamen], 0);
  const vetoes = evaluations.filter((evaluation) => evaluation.status === 'CLOSED' && evaluation.veto_applied).length;
  if (total === 0) {
    return <EmptyChart text="Sin dictámenes emitidos en la selección." />;
  }
  return (
    <div className="space-y-3">
      <div className="flex h-4 overflow-hidden rounded-full">
        {DICTAMEN_ORDER.filter((dictamen) => counts[dictamen] > 0).map((dictamen, i) => (
          <span
            key={dictamen}
            title={`${DICTAMEN_UI[dictamen]?.label}: ${counts[dictamen]}`}
            style={{ width: `${(counts[dictamen] / total) * 100}%`, backgroundColor: DICTAMEN_COLORS[dictamen], marginLeft: i ? 2 : 0, animation: `agr-wide .8s ease ${i * 80}ms both` }}
          />
        ))}
      </div>
      <ul className="space-y-1.5 text-xs">
        {DICTAMEN_ORDER.map((dictamen) => (
          <li key={dictamen} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-[var(--unilabor-ink)]">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: DICTAMEN_COLORS[dictamen] }} />
              {DICTAMEN_UI[dictamen]?.label}
            </span>
            <span className="tabular-nums text-[var(--unilabor-neutral)]">
              <b className="text-[var(--color-brand-700)]">{counts[dictamen]}</b> · {Math.round((counts[dictamen] / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
      {vetoes > 0 ? (
        <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">
          {vetoes} con veto por competencia crítica (A) reprobada
        </p>
      ) : null}
    </div>
  );
};

export const EmptyChart = ({ text }: { text: string }) => (
  <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[rgba(0,65,106,0.14)] text-xs text-[var(--unilabor-neutral)]">{text}</div>
);

interface CompetencyChartsProps extends StandingDonutProps {
  evaluations: CompetencyDashboardEvaluation[];
}

export const CompetencyCharts = ({ employees, evaluations, activeStanding, onFocusStanding }: CompetencyChartsProps) => (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
    <ChartCard icon={PieChart} title="Estado de competencia" hint="Clic en un segmento para enfocar el tablero">
      <StandingDonut employees={employees} activeStanding={activeStanding} onFocusStanding={onFocusStanding} />
    </ChartCard>
    <ChartCard icon={BarChart3} title="Resultados por sección" hint="Promedio de evaluaciones cerradas">
      <SectionAverages evaluations={evaluations} />
    </ChartCard>
    <ChartCard icon={Gavel} title="Dictámenes emitidos" hint="Evaluaciones cerradas por dictamen">
      <DictamenBars evaluations={evaluations} />
    </ChartCard>
  </div>
);
