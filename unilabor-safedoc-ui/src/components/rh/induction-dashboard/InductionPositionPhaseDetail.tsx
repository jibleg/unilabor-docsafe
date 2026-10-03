import { Award, ExternalLink, StepForward } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { InductionTransitionTarget } from '../../../types/models';
import {
  COMPETENCY_DICTAMEN_LABEL,
  STAGE_META,
  TRANSITION_REASON_META,
  TRANSITION_TARGET_META,
  competencyLink,
  formatDate,
  formatDateTime,
  percent,
} from '../../../utils/inductionDashboard';
import type { ProgramTrackPhase } from '../../../utils/inductionProgramTrack';

interface InductionPositionPhaseDetailProps {
  phase: ProgramTrackPhase;
  positionId: number | null;
  /** Mover al colaborador a esta fase (misma validación de la bandeja). */
  onTransition: (target: InductionTransitionTarget) => void;
}

/**
 * Detalle de una fase por puesto que el colaborador aún no cursa (listo o
 * bloqueado, con el motivo y dónde resolverlo) o de su Fase 7 (evaluación de
 * competencia inicial). Las fases inscritas usan InductionEnrollmentDetail.
 */
export const InductionPositionPhaseDetail = ({ phase, positionId, onTransition }: InductionPositionPhaseDetailProps) => {
  const target = phase.phase_number as InductionTransitionTarget;
  return (
    <div className="space-y-3 rounded-2xl border border-[rgba(0,65,106,0.1)] bg-white p-4">
      <div>
        <p className="text-sm font-bold text-[var(--color-brand-700)]">
          Fase {phase.phase_number} · {phase.phase_name}
        </p>
        {phase.stage ? (
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_META[phase.stage].className}`}>
            {STAGE_META[phase.stage].label}
          </span>
        ) : null}
      </div>

      {phase.competency ? (
        <div className="space-y-1 text-xs text-[var(--unilabor-ink)]">
          <p className="inline-flex items-center gap-1.5 font-semibold">
            <Award size={13} /> Evaluación de competencia inicial (REH-REG-003)
          </p>
          <p className="text-[11px] text-[var(--unilabor-neutral)]">
            {phase.competency.status === 'DRAFT' ? 'Borrador' : `Cerrada ${formatDateTime(phase.competency.closed_at)}`} · fecha{' '}
            {formatDate(phase.competency.evaluation_date)} · evaluador {phase.competency.evaluator_name || '—'}
          </p>
          {phase.competency.dictamen ? (
            <p className="text-[11px]">
              Dictamen: <strong>{COMPETENCY_DICTAMEN_LABEL[phase.competency.dictamen] ?? phase.competency.dictamen}</strong> · resultado{' '}
              {percent(phase.competency.final_pct)}
              {phase.competency.authorization_result ? ` · autorización: ${phase.competency.authorization_result.replace(/_/g, ' ').toLowerCase()}` : ''}
            </p>
          ) : null}
          <Link
            to={competencyLink(phase.competency.evaluation_id)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand-500)] hover:underline"
          >
            Abrir en Evaluación de competencia <ExternalLink size={11} />
          </Link>
        </div>
      ) : phase.state === 'ready' ? (
        <div className="space-y-2">
          <p className="text-xs text-emerald-700">Aprobó la fase anterior y su puesto tiene todo listo: puede avanzar ahora.</p>
          <button
            type="button"
            onClick={() => onTransition(target)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            <StepForward size={14} /> {TRANSITION_TARGET_META[target].action}
          </button>
        </div>
      ) : phase.blocks.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--unilabor-ink)]">Aprobó la fase anterior pero no puede avanzar todavía:</p>
          <ul className="space-y-1.5">
            {phase.blocks.map((block) => (
              <li key={block.reason} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs">
                <p className="font-semibold text-rose-700">{TRANSITION_REASON_META[block.reason].label}</p>
                <p className="text-[11px] text-[var(--unilabor-ink)]">{block.detail}</p>
                <Link
                  to={TRANSITION_REASON_META[block.reason].path(positionId)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand-500)] hover:underline"
                >
                  {TRANSITION_REASON_META[block.reason].fix} <ExternalLink size={11} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-[var(--unilabor-neutral)]">Se habilita cuando apruebe la fase anterior.</p>
      )}
    </div>
  );
};
