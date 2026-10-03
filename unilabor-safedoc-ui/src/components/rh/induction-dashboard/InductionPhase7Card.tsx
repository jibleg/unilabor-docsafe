import { ArrowRight, Award } from 'lucide-react';
import type { InductionPhase7Overview } from '../../../types/models';

interface InductionPhase7CardProps {
  phase7: InductionPhase7Overview;
  onOpen: () => void;
}

const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className="rounded-lg bg-[rgba(248,251,253,0.96)] px-2 py-1.5 text-center">
    <dt className="text-[10px] uppercase text-[var(--unilabor-neutral)]">{label}</dt>
    <dd className={`text-sm font-bold ${tone}`}>{value}</dd>
  </div>
);

/** Tarjeta de la Fase 7 en el panorama: se resuelve con la evaluación de competencia inicial (REH-REG-003). */
export const InductionPhase7Card = ({ phase7, onOpen }: InductionPhase7CardProps) => (
  <div className="flex flex-col rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4 shadow-sm shadow-[rgba(0,65,106,0.05)]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-500)]">Fase 7 · por puesto</p>
        <h3 className="mt-0.5 text-base font-bold leading-tight text-[var(--color-brand-700)]">Evaluación de competencia inicial</h3>
      </div>
      <Award size={18} className="shrink-0 text-[var(--color-brand-500)]" />
    </div>
    <p className="mt-2 text-[11px] text-[var(--unilabor-neutral)]">Sin inscripción: se abre el REH-REG-003 inicial a quien aprobó la Fase 6.</p>
    <dl className="mt-3 grid grid-cols-3 gap-2">
      <Stat label="Esperan" value={phase7.waiting} tone={phase7.waiting > 0 ? 'text-rose-600' : 'text-[var(--color-brand-700)]'} />
      <Stat label="En proceso" value={phase7.in_process} tone="text-amber-700" />
      <Stat label="Por autorizar" value={phase7.pending_authorization} tone="text-violet-700" />
      <Stat label="Aprobados" value={phase7.approved} tone="text-emerald-700" />
      <Stat label="No acreditados" value={phase7.not_approved} tone="text-rose-700" />
      <Stat label="Listos" value={phase7.waiting_ready} tone="text-emerald-700" />
    </dl>
    <button
      type="button"
      onClick={onOpen}
      className="mt-4 inline-flex items-center justify-center gap-1 rounded-xl border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.4)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
    >
      Gestionar Fase 7 <ArrowRight size={14} />
    </button>
  </div>
);
