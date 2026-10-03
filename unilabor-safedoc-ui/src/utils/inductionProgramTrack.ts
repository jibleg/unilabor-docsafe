import type {
  InductionCompetencySnapshot,
  InductionEmployee360,
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
}

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
    };
  });
  const byPosition: ProgramTrackPhase[] = (detail.position_track ?? []).map((phase) => {
    const row = detail.enrollments.find((item) => item.phase_number === phase.phase_number) ?? null;
    const stage = row ? row.stage : phase.competency ? competencyStage(phase.competency) : null;
    let state: ProgramPhaseState = 'locked';
    let label = 'Pendiente de fases previas';
    if (stage) {
      state = stateFromStage(stage);
      label = STAGE_META[stage].short;
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
    };
  });
  return [...institutional, ...byPosition];
};
