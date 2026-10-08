import { useState } from 'react';
import { InductionEnrollmentDetail } from './InductionEnrollmentDetail';
import { InductionPositionRoute } from './InductionPositionRoute';
import { InductionPositionPhaseDetail } from './InductionPositionPhaseDetail';
import type { InductionAction, InductionEmployee360, InductionRosterRow, InductionTransitionTarget } from '../../../types/models';
import { buildProgramTrack } from '../../../utils/inductionProgramTrack';

interface InductionPhaseDetailProps {
  detail: InductionEmployee360;
  phaseNumber: number | null;
  onAction: (action: InductionAction, row: InductionRosterRow) => void;
  onTransition: (target: InductionTransitionTarget) => void;
  /** Puesto (inscripcion) a mostrar al abrir; por defecto, el que esta en curso. */
  initialEnrollmentId?: number | undefined;
}

/** Detalle de la fase elegida en la ruta: la inscripción (1-6) o el estado de avance / Fase 7. */
export const InductionPhaseDetail = ({ detail, phaseNumber, onAction, onTransition, initialEnrollmentId }: InductionPhaseDetailProps) => {
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(initialEnrollmentId ?? null);
  const phase = buildProgramTrack(detail).find((item) => item.phase_number === phaseNumber);
  if (!phase) return null;
  // Fases por puesto: la ruta arriba; abajo el detalle del puesto elegido (por defecto, el que esta en curso).
  const route =
    phase.scope === 'POSITION' && phase.positions.length > 0 ? (
      <InductionPositionRoute
        phaseNumber={phase.phase_number}
        positions={phase.positions}
        selectedEnrollmentId={selectedEnrollmentId ?? phase.row?.enrollment_id ?? null}
        onSelect={setSelectedEnrollmentId}
      />
    ) : null;
  const selected =
    selectedEnrollmentId !== null ? detail.enrollments.find((item) => item.enrollment_id === selectedEnrollmentId) : undefined;
  // La seleccion solo aplica dentro de la misma fase (al cambiar de fase vuelve al puesto en curso).
  const chosen = selected && selected.phase_number === phase.phase_number ? selected : phase.row;
  if (chosen) {
    const row = chosen;
    return (
      <div className="space-y-3">
        {route}
        <InductionEnrollmentDetail
          key={row.enrollment_id}
          row={row}
          employeeName={detail.employee.full_name}
          documents={detail.documents.filter((doc) => doc.enrollment_id === row.enrollment_id)}
          attempts={detail.attempts.filter((attempt) =>
            // Fases por puesto: solo los intentos de ESTE puesto (no los de los otros puestos de la fase).
            attempt.enrollment_id !== undefined ? attempt.enrollment_id === row.enrollment_id : attempt.phase_number === row.phase_number,
          )}
          onAction={onAction}
        />
      </div>
    );
  }
  if (phase.scope === 'POSITION') {
    return (
      <div className="space-y-3">
        {route}
        <InductionPositionPhaseDetail phase={phase} positionId={detail.employee.position_id} onTransition={onTransition} />
      </div>
    );
  }
  return null;
};
