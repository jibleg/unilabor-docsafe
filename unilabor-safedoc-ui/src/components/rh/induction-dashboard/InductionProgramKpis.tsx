import { AlertTriangle, Award, BookOpenCheck, CheckCircle2, GraduationCap, Hourglass, Trophy, Users } from 'lucide-react';
import type { InductionProgramOverview } from '../../../types/models';

interface InductionProgramKpisProps {
  overview: InductionProgramOverview;
  onFocusAttention?: () => void;
  /** Abre la bandeja de avance de las fases por puesto. */
  onOpenTransitions?: () => void;
}

const Tile = ({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Users;
  accent: string;
  onClick?: () => void;
}) => {
  const content = (
    <>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black leading-tight text-[var(--color-brand-700)]">{value}</p>
        <p className="text-xs font-semibold text-[var(--unilabor-ink)]">{label}</p>
        {hint ? <p className="mt-0.5 truncate text-[11px] text-[var(--unilabor-neutral)]">{hint}</p> : null}
      </div>
    </>
  );
  const className =
    'flex items-center gap-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 px-4 py-3 text-left shadow-sm shadow-[rgba(0,65,106,0.05)]';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} transition hover:border-[var(--color-brand-300)] hover:shadow-md`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
};

/** KPIs del programa (Fases 1-7). */
export const InductionProgramKpis = ({ overview, onFocusAttention, onOpenTransitions }: InductionProgramKpisProps) => {
  const waiting = overview.transitions.reduce((acc, item) => acc + item.READY + item.BLOCKED, 0);
  const blocked = overview.transitions.reduce((acc, item) => acc + item.BLOCKED, 0);
  const { totals } = overview;
  const coverage = overview.employees_active > 0 ? Math.round((overview.employees_in_program / overview.employees_active) * 100) : 0;
  const completionPct =
    overview.employees_in_program > 0 ? Math.round((overview.employees_completed_1_4 / overview.employees_in_program) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        label="Colaboradores en el programa"
        value={overview.employees_in_program}
        hint={`${coverage} % de ${overview.employees_active} activos`}
        icon={Users}
        accent="bg-[rgba(191,212,230,0.5)] text-[var(--color-brand-700)]"
      />
      <Tile
        label="Completaron Fases 1-4"
        value={overview.employees_completed_1_4}
        hint={`${completionPct} % de los inscritos`}
        icon={Trophy}
        accent="bg-emerald-50 text-emerald-700"
      />
      <Tile
        label="Esperan la siguiente fase"
        value={waiting}
        hint={waiting > 0 ? `Fases 5-7 por puesto · ${blocked} bloqueados` : 'Nadie detenido entre fases'}
        icon={Hourglass}
        accent={blocked > 0 ? 'bg-rose-50 text-rose-700' : 'bg-[rgba(191,212,230,0.5)] text-[var(--color-brand-700)]'}
        onClick={onOpenTransitions}
      />
      <Tile
        label="Concluyeron Fases 1-7"
        value={overview.employees_completed_1_7}
        hint={`${overview.phase7.pending_authorization} por autorizar · ${overview.phase7.in_process} en evaluación`}
        icon={Award}
        accent="bg-emerald-50 text-emerald-700"
      />
      <Tile label="En lectura" value={totals.in_reading} hint="Inscripciones leyendo documentos" icon={BookOpenCheck} accent="bg-sky-50 text-sky-700" />
      <Tile label="En evaluación" value={totals.in_evaluation} hint="Cuestionario abierto o en revisión" icon={GraduationCap} accent="bg-amber-50 text-amber-700" />
      <Tile label="Fases aprobadas" value={totals.passed} hint={`de ${totals.enrollments} inscripciones`} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-700" />
      <Tile
        label="Requieren atención"
        value={totals.needs_attention}
        hint="Vencidas, truncadas, reprobadas, sin avanzar"
        icon={AlertTriangle}
        accent={totals.needs_attention > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}
        onClick={onFocusAttention}
      />
    </div>
  );
};
