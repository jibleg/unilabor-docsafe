import type {
  InductionCompetencySnapshot,
  InductionEmployee360,
  InductionPositionTrackEntry,
  InductionRosterRow,
  InductionStage,
  InductionTransitionBlock,
} from '../types/models';
import { STAGE_META, TRANSITION_REASON_META, competencyStage } from './inductionDashboard';

/**
 * done = aprobada; active = cursándola; ready/blocked = aprobó la anterior y
 * espera entrar (listo o bloqueado); available = se abrirá al avanzar;
 * locked = aún no le toca.
 */
export type ProgramPhaseState = 'done' | 'active' | 'ready' | 'blocked' | 'available' | 'locked';

export interface ProgramTrackPhase {
  phase_number: number;
  phase_name: string;
  published: boolean;
  scope: 'INSTITUTIONAL' | 'POSITION';
  state: ProgramPhaseState;
  /** Etiqueta corta para la ruta (etapa, "Listo para entrar", motivo...). */
  label: string;
  stage: InductionStage | null;
  row: InductionRosterRow | null;
  blocks: InductionTransitionBlock[];
  competency: InductionCompetencySnapshot | null;
  /** Fases por puesto: la ruta del colaborador (vacía en las institucionales). */
  positions: InductionPositionTrackEntry[];
}

/**
 * Etapa agregada de una fase por puesto: aprobada solo con TODOS los puestos
 * acreditados; si acreditó el puesto en curso pero sigue uno en cola,
 * SIGUIENTE_PUESTO; si no, la etapa del puesto en curso.
 */
const positionPhaseStage = (positions: InductionPositionTrackEntry[], currentStage: InductionStage | null): InductionStage | null => {
  const open = positions.filter((entry) => entry.queue_status !== 'CANCELLED');
  if (open.length === 0) return currentStage;
  if (open.every((entry) => entry.passed)) return 'APROBADA';
  if (currentStage === 'APROBADA' || currentStage === null) return 'SIGUIENTE_PUESTO';
  return currentStage;
};

const stateFromStage = (stage: InductionStage): ProgramPhaseState => (stage === 'APROBADA' ? 'done' : 'active');

/** Ruta completa de las 7 fases del colaborador a partir de su vista 360. */
export const buildProgramTrack = (detail: InductionEmployee360): ProgramTrackPhase[] => {
  const institutional: ProgramTrackPhase[] = detail.track.map((phase) => {
    const row = detail.enrollments.find((item) => item.phase_number === phase.phase_number) ?? null;
    const state: ProgramPhaseState = row ? stateFromStage(row.stage) : phase.access === 'AVAILABLE' ? 'available' : 'locked';
    return {
      phase_number: phase.phase_number,
      phase_name: phase.phase_name,
      published: phase.published,
      scope: 'INSTITUTIONAL',
      state,
      label: row ? STAGE_META[row.stage].short : state === 'available' ? 'Disponible al avanzar' : 'Bloqueada',
      stage: row?.stage ?? null,
      row,
      blocks: [],
      competency: null,
      positions: [],
    };
  });
  const byPosition: ProgramTrackPhase[] = (detail.position_track ?? []).map((phase) => {
    const positions = phase.positions ?? [];
    // Fila del puesto en curso (o la de la fase si aún no hay ruta por puesto).
    const row =
      (phase.enrollment_id ? detail.enrollments.find((item) => item.enrollment_id === phase.enrollment_id) : null) ??
      detail.enrollments.find((item) => item.phase_number === phase.phase_number) ??
      null;
    const currentStage = row ? row.stage : phase.competency ? competencyStage(phase.competency) : null;
    const hasRoute = positions.some((entry) => entry.queue_status !== 'CANCELLED' || entry.competency);
    const stage = hasRoute ? positionPhaseStage(positions, currentStage) : currentStage;
    let state: ProgramPhaseState = 'locked';
    let label = 'Pendiente de fases previas';
    const open = positions.filter((entry) => entry.queue_status !== 'CANCELLED');
    const progress = open.length > 1 ? ` · ${open.filter((entry) => entry.passed).length}/${open.length} puestos` : '';
    if (stage) {
      state = stateFromStage(stage);
      label = `${STAGE_META[stage].short}${progress}`;
    } else if (phase.transition?.state === 'READY') {
      state = 'ready';
      label = 'Listo para entrar';
    } else if (phase.transition?.state === 'BLOCKED') {
      state = 'blocked';
      const first = phase.transition.blocks[0];
      label = first ? TRANSITION_REASON_META[first.reason].label : 'Bloqueado';
    }
    return {
      phase_number: phase.phase_number,
      phase_name: phase.phase_name,
      published: phase.published,
      scope: 'POSITION',
      state,
      label,
      stage,
      row,
      blocks: phase.transition?.blocks ?? [],
      competency: phase.competency,
      positions,
    };
  });
  return [...institutional, ...byPosition];
};
