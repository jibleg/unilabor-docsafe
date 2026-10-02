import { Award, CalendarClock, FileCheck2, Users } from 'lucide-react';
import type { CompetencyDashboardEmployee, CompetencyDashboardEvaluation, CompetencyStanding } from '../../../types/competencyDashboard';
import { useCountUp } from '../../../hooks/useCountUp';
import { STANDING_META, STANDING_ORDER, countByStanding, sectionAverages } from '../../../utils/competencyDashboard';

interface CompetencyHeroProps {
  employees: CompetencyDashboardEmployee[];
  evaluations: CompetencyDashboardEvaluation[];
  activeStandings: CompetencyStanding[];
  onFocusStanding: (standing: CompetencyStanding | null) => void;
}

/** Medidor radial del índice de competencia vigente (vigentes + por vencer / total). */
const Gauge = ({ pct }: { pct: number }) => {
  const shown = useCountUp(pct);
  const r = 58;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`Índice de competencia vigente: ${pct}%`}>
      <circle cx="75" cy="75" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="14" />
      <circle
        cx="75"
        cy="75"
        r={r}
        fill="none"
        stroke="url(#comp-gauge)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - shown / 100)}
        transform="rotate(-90 75 75)"
      />
      <defs>
        <linearGradient id="comp-gauge" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <text x="75" y="76" textAnchor="middle" className="fill-white text-[32px] font-black">
        {shown}%
      </text>
      <text x="75" y="96" textAnchor="middle" className="fill-white/70 text-[10px] font-semibold uppercase tracking-wider">
        competente
      </text>
    </svg>
  );
};

const HeroStat = ({ icon: Icon, value, label }: { icon: typeof Users; value: string | number; label: string }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
      <Icon size={19} />
    </div>
    <div>
      <p className="text-xl font-black leading-tight tabular-nums">{value}</p>
      <p className="text-[11px] font-medium text-white/75">{label}</p>
    </div>
  </div>
);

const StandingTile = ({
  standing,
  value,
  total,
  active,
  onClick,
  delay,
}: {
  standing: CompetencyStanding;
  value: number;
  total: number;
  active: boolean;
  onClick: () => void;
  delay: number;
}) => {
  const meta = STANDING_META[standing];
  const Icon = meta.icon;
  const shown = useCountUp(value);
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={meta.description}
      className={`group relative overflow-hidden rounded-2xl border bg-white/95 p-3.5 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
        active ? 'border-[var(--color-brand-500)] ring-2 ring-[rgba(0,105,166,0.2)]' : 'border-[rgba(0,65,106,0.1)]'
      }`}
      style={{ animation: `agr-pop .45s ease ${delay}ms both` }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: meta.color }} />
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 ${meta.soft} ${meta.text}`}>
          <Icon size={18} />
        </span>
        <span className="text-[11px] font-bold tabular-nums text-[var(--unilabor-neutral)]">{pct}%</span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums text-[var(--color-brand-700)]">{shown}</p>
      <p className="text-xs font-semibold text-[var(--unilabor-ink)]">{meta.label}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(0,65,106,0.08)]">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color, animation: 'agr-wide .8s ease both' }} />
      </div>
    </button>
  );
};

/**
 * Cabecera del panel: banda con el índice de competencia vigente y cifras
 * globales, y debajo un mosaico por estado que enfoca el tablero al hacer clic.
 */
export const CompetencyHero = ({ employees, evaluations, activeStandings, onFocusStanding }: CompetencyHeroProps) => {
  const counts = countByStanding(employees);
  const total = employees.length;
  const competent = counts.VIGENTE + counts.POR_VENCER;
  const indexPct = total > 0 ? Math.round((competent / total) * 100) : 0;
  const closed = evaluations.filter((evaluation) => evaluation.status === 'CLOSED').length;
  const averages = sectionAverages(evaluations);
  const certificates = evaluations.filter((evaluation) => evaluation.certificate_document_id).length;
  const single = activeStandings.length === 1 ? activeStandings[0] : null;

  return (
    <div className="space-y-3">
      <section
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b2235] via-[var(--color-brand-700)] to-[var(--color-brand-500)] p-6 text-white shadow-xl shadow-[rgba(0,65,106,0.25)]"
        style={{ animation: 'agr-fade .5s ease both' }}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          <Gauge pct={indexPct} />
          <div className="min-w-[220px] flex-1">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
              <Award size={13} /> Índice de competencia vigente
            </p>
            <p className="mt-2 text-2xl font-black leading-tight">
              {competent} de {total} colaboradores con competencia autorizada y vigente
            </p>
            <p className="mt-1 text-sm text-white/75">
              ISO 15189 §6.2.3 · REH-REG-003. Vigencia de 12 meses desde la autorización.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-2">
            <HeroStat icon={Users} value={total} label="Colaboradores en alcance" />
            <HeroStat icon={FileCheck2} value={closed} label="Evaluaciones cerradas" />
            <HeroStat icon={Award} value={averages.final_pct !== null ? `${averages.final_pct}%` : '—'} label="Calificación final promedio" />
            <HeroStat icon={CalendarClock} value={certificates} label="Constancias emitidas" />
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {STANDING_ORDER.map((standing, i) => (
          <StandingTile
            key={standing}
            standing={standing}
            value={counts[standing]}
            total={total}
            active={single === standing}
            onClick={() => onFocusStanding(single === standing ? null : standing)}
            delay={i * 45}
          />
        ))}
      </div>
    </div>
  );
};
