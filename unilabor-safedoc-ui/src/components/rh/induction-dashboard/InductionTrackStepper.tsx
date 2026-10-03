import { AlertTriangle, CheckCircle2, Circle, Lock, StepForward, User } from 'lucide-react';
import { InductionSection as Section } from './InductionSection';
import type { InductionEmployee360 } from '../../../types/models';
import { buildProgramTrack, type ProgramPhaseState } from '../../../utils/inductionProgramTrack';

interface InductionTrackStepperProps {
  detail: InductionEmployee360;
  openPhase: number | null;
  onSelectPhase: (phaseNumber: number) => void;
}

const STATE_ICON: Record<ProgramPhaseState, React.ReactNode> = {
  done: <CheckCircle2 size={13} className="text-emerald-600" />,
  active: <Circle size={13} className="text-amber-500" />,
  ready: <StepForward size={13} className="text-emerald-600" />,
  blocked: <AlertTriangle size={13} className="text-rose-600" />,
  available: <Circle size={13} className="text-sky-500" />,
  locked: <Lock size={13} className="text-slate-400" />,
};

/** Ruta del colaborador en las 7 fases; cada fase con detalle (inscrita o Fase 7 abierta) se puede abrir. */
export const InductionTrackStepper = ({ detail, openPhase, onSelectPhase }: InductionTrackStepperProps) => (
  <Section icon={User} title="Ruta de inducción (Fases 1-7)">
    <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
      {buildProgramTrack(detail).map((phase) => {
        const selectable = Boolean(phase.row) || Boolean(phase.competency) || phase.blocks.length > 0 || phase.state === 'ready';
        return (
          <li key={phase.phase_number}>
            <button
              type="button"
              disabled={!selectable}
              onClick={() => onSelectPhase(phase.phase_number)}
              title={phase.phase_name}
              className={`w-full rounded-xl border px-1.5 py-2 text-left transition ${
                openPhase === phase.phase_number ? 'border-[var(--color-brand-500)] bg-white shadow-sm' : 'border-[rgba(0,65,106,0.08)] bg-white/70'
              } ${phase.state === 'blocked' ? 'border-rose-200' : ''} disabled:cursor-default`}
            >
              <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-brand-700)]">
                {STATE_ICON[phase.state]}
                Fase {phase.phase_number}
              </span>
              <span className={`mt-0.5 block truncate text-[10px] ${phase.state === 'blocked' ? 'text-rose-600' : 'text-[var(--unilabor-neutral)]'}`}>
                {phase.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  </Section>
);
