import { describe, expect, it } from 'vitest';
import { evaluateTransition, filterTransitionRows } from './rh-induction-transition.service';
import type { TransitionCandidate, TransitionRow } from './rh-induction-transition.service';
import { resolvePositionEvaluationState } from './rh-induction-position-evaluation';
import { competencyStage } from './rh-induction-phase7';
import type { CompetencySnapshot } from './rh-induction-phase7';
import { deriveInductionStage } from './rh-induction-dashboard.service';
import { executeTransitionSchema, transitionQuerySchema } from '../schemas/rh-induction-dashboard.schema';

const candidate = (overrides: Partial<TransitionCandidate> = {}): TransitionCandidate => ({
  employee_id: 1,
  employee_name: 'Ana Pérez',
  employee_code: 'E-1',
  user_linked: true,
  area: null,
  branch_name: 'Matriz',
  position_id: 7,
  position_code: 'RA',
  position_name: 'Responsable de área',
  previous_enrollment_id: 100,
  previous_passed_at: '2026-10-01T10:00:00.000Z',
  previous_percentage: 90,
  previous_certificate_document_id: 5,
  target_course_id: 40,
  documents_total: 12,
  competencies_total: 9,
  evaluation_state: 'READY',
  competency: null,
  ...overrides,
});

const reasons = (c: TransitionCandidate, target: 5 | 6 | 7, published = true) =>
  evaluateTransition(c, target, { published }).blocks.map((block) => block.reason);

describe('evaluateTransition', () => {
  it('listo cuando el puesto tiene todo y la fase está publicada', () => {
    expect(evaluateTransition(candidate(), 5, { published: true })).toEqual({ state: 'READY', blocks: [] });
  });
  it('opción A: el cuestionario del puesto sin publicar lo deja bloqueado con el motivo', () => {
    const result = evaluateTransition(candidate({ evaluation_state: 'DRAFT' }), 5, { published: true });
    expect(result.state).toBe('BLOCKED');
    expect(result.blocks[0]?.reason).toBe('EVALUACION_NO_LISTA');
    expect(result.blocks[0]?.detail).toContain('en borrador');
  });
  it('acumula todos los motivos para que RH los vea juntos', () => {
    expect(reasons(candidate({ user_linked: false, documents_total: 0, evaluation_state: 'NO_QUESTIONS' }), 5, false)).toEqual([
      'SIN_USUARIO',
      'FASE_EN_BORRADOR',
      'PUESTO_SIN_DOCUMENTOS',
      'EVALUACION_NO_LISTA',
    ]);
  });
  it('sin puesto o puesto no habilitado en la fase', () => {
    expect(reasons(candidate({ position_id: null, position_code: null }), 5)).toEqual(['SIN_PUESTO']);
    expect(reasons(candidate({ target_course_id: null }), 6)).toEqual(['PUESTO_NO_HABILITADO']);
  });
  it('la Fase 6 no exige documentos', () => {
    expect(reasons(candidate({ documents_total: 0 }), 6)).toEqual([]);
  });
  it('Fase 7: exige competencias del puesto y queda EN EVALUACION si ya tiene su REH-REG-003', () => {
    expect(reasons(candidate({ competencies_total: 0, user_linked: false }), 7, false)).toEqual(['PUESTO_SIN_COMPETENCIAS']);
    const started = candidate({ competency: { evaluation_id: 3, status: 'DRAFT' } as CompetencySnapshot });
    expect(evaluateTransition(started, 7, { published: false }).state).toBe('STARTED');
  });
});

describe('filterTransitionRows', () => {
  const rows: TransitionRow[] = [
    { ...candidate(), target: 5, state: 'READY', blocks: [], waiting_hours: 5 },
    {
      ...candidate({ employee_id: 2, employee_name: 'Luis Gómez', position_code: 'CHOF' }),
      target: 5,
      state: 'BLOCKED',
      blocks: [{ reason: 'PUESTO_SIN_DOCUMENTOS', detail: 'x' }],
      waiting_hours: 30,
    },
  ];
  it('cuenta por estado y por motivo, y filtra', () => {
    const page = filterTransitionRows(rows, { page: 1, limit: 30 });
    expect(page.state_counts).toEqual({ READY: 1, BLOCKED: 1, STARTED: 0 });
    expect(page.reason_counts.PUESTO_SIN_DOCUMENTOS).toBe(1);
    expect(filterTransitionRows(rows, { state: 'BLOCKED', page: 1, limit: 30 }).rows[0]?.employee_id).toBe(2);
    expect(filterTransitionRows(rows, { search: 'chof', page: 1, limit: 30 }).total).toBe(1);
  });
});

describe('resolvePositionEvaluationState', () => {
  it('distingue inexistente, borrador, sin preguntas y lista', () => {
    expect(resolvePositionEvaluationState({ template_id: null, status: null, question_count: 0 }, 'quiz')).toBe('MISSING');
    expect(resolvePositionEvaluationState({ template_id: 1, status: 'draft', question_count: 20 }, 'quiz')).toBe('DRAFT');
    expect(resolvePositionEvaluationState({ template_id: 1, status: 'published', question_count: 0 }, 'quiz')).toBe('NO_QUESTIONS');
    expect(resolvePositionEvaluationState({ template_id: 1, status: 'published', question_count: 0 }, 'practical')).toBe('READY');
  });
});

describe('competencyStage (Fase 7)', () => {
  const base = { evaluation_id: 1, evaluation_date: null, evaluator_name: 'X', final_pct: 85, closed_at: null } as const;
  it('borrador, por autorizar, aprobada y no acreditada', () => {
    expect(competencyStage({ ...base, status: 'DRAFT', dictamen: null, authorization_result: null })).toBe('COMPETENCIA_EN_PROCESO');
    expect(competencyStage({ ...base, status: 'CLOSED', dictamen: 'COMPETENTE_CON_OBSERVACIONES', authorization_result: 'PENDIENTE' })).toBe(
      'COMPETENCIA_POR_AUTORIZAR',
    );
    expect(competencyStage({ ...base, status: 'CLOSED', dictamen: 'COMPETENTE_Y_AUTORIZADO', authorization_result: 'AUTORIZADO' })).toBe('APROBADA');
    expect(competencyStage({ ...base, status: 'CLOSED', dictamen: 'NO_COMPETENTE', authorization_result: null })).toBe('NO_ACREDITADA');
    expect(competencyStage({ ...base, status: 'CLOSED', dictamen: 'COMPETENTE_BAJO_SUPERVISION', authorization_result: 'NO_AUTORIZADO' })).toBe(
      'NO_ACREDITADA',
    );
  });
});

describe('deriveInductionStage en la Fase 6 (práctica)', () => {
  const stage = {
    evaluation_mode: 'practical' as const,
    phase_published: true,
    readings_start_at: null,
    reading_total: 0,
    reading_signed: 0,
    reading_pages_seen: 0,
    reading_completed_at: '2026-10-01T10:00:00.000Z',
    reading_deadline_at: null,
    evaluation_status: null,
    evaluation_started_at: null,
    evaluation_question_count: 0,
    attempt_time_limit_minutes: null,
  };
  it('sin captura queda en práctica pendiente; con captura, aprobada o no acreditada', () => {
    expect(deriveInductionStage(stage)).toBe('PRACTICA_PENDIENTE');
    expect(deriveInductionStage({ ...stage, phase_published: false })).toBe('EN_ESPERA_PUBLICACION');
    expect(deriveInductionStage({ ...stage, evaluation_status: 'passed' })).toBe('APROBADA');
    expect(deriveInductionStage({ ...stage, evaluation_status: 'failed' })).toBe('NO_ACREDITADA');
  });
});

describe('esquemas de la bandeja', () => {
  it('valida destino y exige evaluador para la Fase 7', () => {
    expect(transitionQuerySchema.safeParse({ target: '4' }).success).toBe(false);
    expect(transitionQuerySchema.parse({ target: '6' }).target).toBe(6);
    expect(executeTransitionSchema.safeParse({ target: 7, employee_ids: [1] }).success).toBe(false);
    expect(executeTransitionSchema.parse({ target: 5, employee_ids: [1, 1, '2'] }).employee_ids).toEqual([1, 2]);
  });
});
