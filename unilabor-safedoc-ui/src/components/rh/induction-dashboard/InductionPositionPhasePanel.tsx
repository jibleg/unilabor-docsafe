import { CheckCircle2, CircleDashed, ClipboardList, Settings2, StepForward } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { InductionPhaseOverview } from '../../../types/models';

interface InductionPositionPhasePanelProps {
  phase: InductionPhaseOverview;
  onOpenTransitions: () => void;
  onOpenPositions: () => void;
}

const Row = ({ ok, label, value }: { ok: boolean; label: string; value: string }) => (
  <li className="flex items-start justify-between gap-2 text-xs">
    <span className={`inline-flex items-center gap-1.5 ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
      {ok ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
      {label}
    </span>
    <span className="text-right font-semibold text-[var(--unilabor-ink)]">{value}</span>
  </li>
);

/**
 * Panel de una fase por puesto (5 o 6) en el tablero: su configuración vive
 * en cada puesto, así que aquí se resume cuántos puestos están listos, quién
 * espera entrar y se enlaza a la bandeja y a la preparación por puesto.
 */
export const InductionPositionPhasePanel = ({ phase, onOpenTransitions, onOpenPositions }: InductionPositionPhasePanelProps) => {
  const navigate = useNavigate();
  const summary = phase.position_summary ?? { positions_enabled: 0, positions_ready: 0, waiting: 0, waiting_ready: 0 };
  const blocked = summary.waiting - summary.waiting_ready;
  const isPractical = phase.phase_number === 6;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white/90 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--unilabor-neutral)]">Configuración por puesto</p>
        <ul className="mt-2 space-y-1.5">
          <Row ok={phase.readiness.published} label="Fase publicada" value={phase.readiness.published ? 'Sí' : 'Borrador'} />
          <Row ok={summary.positions_enabled > 0} label="Puestos habilitados" value={String(summary.positions_enabled)} />
          <Row
            ok={summary.positions_ready > 0}
            label={isPractical ? 'Con práctica publicada' : 'Con cuestionario y documentos'}
            value={`${summary.positions_ready} de ${summary.positions_enabled}`}
          />
          <Row ok={phase.readiness.duration_ok} label="Duración (constancia)" value={phase.rules.duration_hours ? `${phase.rules.duration_hours} h` : '—'} />
          <Row ok={phase.checklist_items_total > 0} label="Checklist REH-REG-005" value={`${phase.checklist_items_total} puntos`} />
        </ul>
        <p className="mt-3 text-[11px] leading-5 text-[var(--unilabor-neutral)]">
          {isPractical
            ? 'Sin lectura: RH captura la evaluación práctica (0-10) de cada inscrito desde la tabla.'
            : 'Cada colaborador lee los documentos de su puesto y presenta el cuestionario de su puesto.'}{' '}
          Solo se inscribe a quien tiene su puesto listo.
        </p>
      </div>

      <div className={`rounded-2xl border p-4 ${blocked > 0 ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--unilabor-neutral)]">Esperan entrar a la Fase {phase.phase_number}</p>
        <p className="mt-1 text-2xl font-black text-[var(--color-brand-700)]">{summary.waiting}</p>
        <p className="text-xs text-[var(--unilabor-ink)]">
          {summary.waiting_ready} listos · {blocked} bloqueados
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenTransitions}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            <StepForward size={14} /> Abrir bandeja de avance
          </button>
          <button
            type="button"
            onClick={onOpenPositions}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
          >
            <ClipboardList size={14} /> Preparación por puesto
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/rh/induction')}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[rgba(0,65,106,0.14)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-brand-700)] hover:bg-[rgba(191,212,230,0.3)]"
      >
        <Settings2 size={14} /> Habilitar puestos / publicar en Fases 5-7
      </button>
    </div>
  );
};
