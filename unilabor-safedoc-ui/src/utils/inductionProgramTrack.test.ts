import { describe, expect, it } from 'vitest';
import type { InductionEmployee360, InductionRosterRow } from '../types/models';
import { buildProgramTrack } from './inductionProgramTrack';

const trackPhase = (n: number, passed: boolean) => ({
  phase_id: n,
  phase_number: n,
  phase_name: `Fase ${n}`,
  published: true,
  access: 'ENROLLED',
  passed,
}) as unknown as InductionEmployee360['track'][number];

const row = (n: number, stage: InductionRosterRow['stage']) => ({ phase_number: n, enrollment_id: 100 + n, stage }) as InductionRosterRow;

const detail = (overrides: Partial<InductionEmployee360>): InductionEmployee360 =>
  ({
    employee: { id: 1, full_name: 'Ana', position_id: 7 },
    track: [1, 2, 3, 4].map((n) => trackPhase(n, true)),
    position_track: [
      { phase_id: 5, phase_number: 5, phase_name: 'Fase 5', published: true, enrollment_id: null, transition: { state: 'BLOCKED', blocks: [{ reason: 'EVALUACION_NO_LISTA', detail: 'x' }] }, competency: null },
      { phase_id: 6, phase_number: 6, phase_name: 'Fase 6', published: true, enrollment_id: null, transition: null, competency: null },
      { phase_id: 7, phase_number: 7, phase_name: 'Fase 7', published: false, enrollment_id: null, transition: null, competency: null },
    ],
    enrollments: [1, 2, 3, 4].map((n) => row(n, 'APROBADA')),
    documents: [],
    attempts: [],
    audit: [],
    ...overrides,
  }) as InductionEmployee360;

describe('buildProgramTrack', () => {
  it('arma las 7 fases y marca a quien aprobó la 4 y está bloqueado para la 5', () => {
    const track = buildProgramTrack(detail({}));
    expect(track.map((phase) => phase.phase_number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(track.slice(0, 4).every((phase) => phase.state === 'done')).toBe(true);
    expect(track[4]).toMatchObject({ state: 'blocked', label: 'Evaluación del puesto no lista', scope: 'POSITION' });
    expect(track[5]?.state).toBe('locked');
  });
  it('la Fase 7 toma su etapa de la evaluación de competencia', () => {
    const base = detail({});
    const track = buildProgramTrack({
      ...base,
      position_track: base.position_track.map((phase) =>
        phase.phase_number === 7
          ? { ...phase, competency: { evaluation_id: 3, status: 'CLOSED', evaluation_date: null, evaluator_name: 'X', final_pct: 92, dictamen: 'COMPETENTE_Y_AUTORIZADO', authorization_result: 'PENDIENTE', closed_at: null } }
          : phase,
      ),
    });
    expect(track[6]).toMatchObject({ state: 'active', stage: 'COMPETENCIA_POR_AUTORIZAR' });
  });
  it('una fase por puesto inscrita usa la etapa de su inscripción', () => {
    const track = buildProgramTrack(detail({ enrollments: [...[1, 2, 3, 4].map((n) => row(n, 'APROBADA')), row(5, 'LEYENDO')] }));
    expect(track[4]).toMatchObject({ state: 'active', stage: 'LEYENDO' });
  });
});
