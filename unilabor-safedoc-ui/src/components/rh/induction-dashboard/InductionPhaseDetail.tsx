import { InductionEnrollmentDetail } from './InductionEnrollmentDetail';
import { InductionPositionPhaseDetail } from './InductionPositionPhaseDetail';
import type { InductionAction, InductionEmployee360, InductionRosterRow, InductionTransitionTarget } from '../../../types/models';
import { buildProgramTrack } from '../../../utils/inductionProgramTrack';

interface InductionPhaseDetailProps {
  detail: InductionEmployee360;
  phaseNumber: number | null;
  onAction: (action: InductionAction, row: InductionRosterRow) => void;
  onTransition: (target: InductionTransitionTarget) => void;
}

/** Detalle de la fase elegida en la ruta: la inscripción (1-6) o el estado de avance / Fase 7. */
export const InductionPhaseDetail = ({ detail, phaseNumber, onAction, onTransition }: InductionPhaseDetailProps) => {
  const phase = buildProgramTrack(detail).find((item) => item.phase_number === phaseNumber);
  if (!phase) return null;
  if (phase.row) {
    const row = phase.row;
    return (
      <InductionEnrollmentDetail
        key={row.enrollment_id}
        row={row}
        employeeName={detail.employee.full_name}
        documents={detail.documents.filter((doc) => doc.enrollment_id === row.enrollment_id)}
        attempts={detail.attempts.filter((attempt) => attempt.phase_number === row.phase_number)}
        onAction={onAction}
      />
    );
  }
  if (phase.scope === 'POSITION') {
    return <InductionPositionPhaseDetail phase={phase} positionId={detail.employee.position_id} onTransition={onTransition} />;
  }
  return null;
};
