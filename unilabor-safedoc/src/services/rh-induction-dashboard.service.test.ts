import { describe, expect, it } from 'vitest';
import { deriveInductionStage, mapRosterRow } from './rh-induction-dashboard.service';
import { diagnoseTruncatedAttempt, isAttemptTimerExhausted } from './rh-induction-attempt-repair.service';
import { rosterQuerySchema } from '../schemas/rh-induction-dashboard.schema';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const baseStage = {
  phase_published: true,
  readings_start_at: null as string | null,
  reading_total: 6,
  reading_signed: 0,
  reading_pages_seen: 0,
  reading_completed_at: null,
  reading_deadline_at: hoursAhead(48),
  evaluation_status: null,
  evaluation_started_at: null,
  evaluation_question_count: 0,
  attempt_time_limit_minutes: null,
};

describe('deriveInductionStage', () => {
  it('borrador -> en espera de publicacion', () => {
    expect(deriveInductionStage({ ...baseStage, phase_published: false }, NOW)).toBe('EN_ESPERA_PUBLICACION');
  });
  it('sin lecturas asignadas en fase publicada', () => {
    expect(deriveInductionStage({ ...baseStage, reading_total: 0 }, NOW)).toBe('SIN_LECTURAS');
  });
  it('descanso entre fases: sin lecturas y con inicio programado a futuro', () => {
    expect(deriveInductionStage({ ...baseStage, reading_total: 0, readings_start_at: hoursAhead(12) }, NOW)).toBe('EN_DESCANSO');
    expect(deriveInductionStage({ ...baseStage, reading_total: 0, readings_start_at: hoursAgo(1) }, NOW)).toBe('SIN_LECTURAS');
    expect(deriveInductionStage({ ...baseStage, readings_start_at: hoursAhead(12) }, NOW)).toBe('SIN_INICIAR');
  });
  it('sin iniciar / leyendo / lectura vencida / completa', () => {
    expect(deriveInductionStage(baseStage, NOW)).toBe('SIN_INICIAR');
    expect(deriveInductionStage({ ...baseStage, reading_pages_seen: 3 }, NOW)).toBe('LEYENDO');
    expect(deriveInductionStage({ ...baseStage, reading_deadline_at: hoursAgo(1) }, NOW)).toBe('LECTURA_VENCIDA');
    expect(deriveInductionStage({ ...baseStage, reading_completed_at: hoursAgo(1) }, NOW)).toBe('LECTURA_COMPLETA');
  });
  it('estados de la evaluacion', () => {
    const withEval = { ...baseStage, reading_completed_at: hoursAgo(5), evaluation_question_count: 20 };
    expect(deriveInductionStage({ ...withEval, evaluation_status: 'pending' }, NOW)).toBe('EVALUACION_DISPONIBLE');
    expect(
      deriveInductionStage({ ...withEval, evaluation_status: 'in_progress', evaluation_started_at: hoursAgo(0.1), attempt_time_limit_minutes: 50 }, NOW),
    ).toBe('EVALUACION_EN_CURSO');
    expect(
      deriveInductionStage({ ...withEval, evaluation_status: 'in_progress', evaluation_started_at: hoursAgo(2), attempt_time_limit_minutes: 50 }, NOW),
    ).toBe('EVALUACION_TRUNCADA');
    expect(deriveInductionStage({ ...withEval, evaluation_status: 'pending', evaluation_question_count: 0 }, NOW)).toBe('EVALUACION_TRUNCADA');
    expect(deriveInductionStage({ ...withEval, evaluation_status: 'grading' }, NOW)).toBe('EN_CALIFICACION');
    expect(deriveInductionStage({ ...withEval, evaluation_status: 'expired' }, NOW)).toBe('EVALUACION_VENCIDA');
    expect(deriveInductionStage({ ...withEval, evaluation_status: 'failed' }, NOW)).toBe('NO_ACREDITADA');
    expect(deriveInductionStage({ ...withEval, evaluation_status: 'passed' }, NOW)).toBe('APROBADA');
  });
});

describe('diagnoseTruncatedAttempt', () => {
  it('cronometro agotado', () => {
    expect(isAttemptTimerExhausted(new Date(hoursAgo(2)), 50, NOW)).toBe(true);
    expect(isAttemptTimerExhausted(new Date(hoursAgo(0.2)), 50, NOW)).toBe(false);
    expect(isAttemptTimerExhausted(null, 50, NOW)).toBe(false);
  });
  it('no truncado cuando esta pending sin iniciar y con preguntas, ni en estados terminales', () => {
    expect(diagnoseTruncatedAttempt({ status: 'pending', started_at: null, attempt_time_limit_minutes: 30, question_count: 20 }).truncated).toBe(false);
    expect(diagnoseTruncatedAttempt({ status: 'passed', started_at: new Date(hoursAgo(9)), attempt_time_limit_minutes: 30, question_count: 20 }).truncated).toBe(false);
  });
  it('iniciado sin enviar cuenta como truncado (RH decide)', () => {
    const d = diagnoseTruncatedAttempt({ status: 'in_progress', started_at: new Date(), attempt_time_limit_minutes: 30, question_count: 20 });
    expect(d.truncated).toBe(true);
    expect(d.reasons).toEqual(['STARTED_NOT_SUBMITTED']);
  });
  it('sin preguntas', () => {
    const d = diagnoseTruncatedAttempt({ status: 'pending', started_at: null, attempt_time_limit_minutes: null, question_count: 0 });
    expect(d.reasons).toEqual(['NO_QUESTIONS']);
  });
});

describe('mapRosterRow acciones y alertas', () => {
  const dbRow = {
    enrollment_id: 1, phase_id: 2, phase_number: 2, published_at: hoursAgo(100), training_course_id: 14, origin: 'AUTO_ADVANCE',
    enrolled_at: hoursAgo(90), readings_start_at: null, employee_id: 7, employee_name: 'Ana', employee_code: 'A1', employee_email: null, area: null,
    branch_name: null, missing_branch: true, position_name: null, reading_completed_at: null, reading_deadline_at: hoursAgo(1),
    supervisor_employee_id: null, supervisor_name: null, assignment_id: null, evaluation_status: null, attempt_no: null,
    available_at: null, evaluation_deadline_at: null, started_at: null, submitted_at: null, graded_at: null, percentage: null,
    certificate_document_id: null, attempt_time_limit_minutes: null, question_count: 0, response_count: 0, attempts_total: 0,
    reading_total: 4, reading_signed: 1, pages_total: 40, pages_seen: 12, active_seconds: 900, reading_started_at: hoursAgo(50),
    checklist_total: 3, checklist_completed: 0, next_phase_id: 3, next_phase_published: false, next_phase_enrolled: false,
    quiz_published: true,
  };
  it('lectura vencida -> reabrir lectura + reenviar aviso + datos de constancia', () => {
    const row = mapRosterRow(dbRow, NOW);
    expect(row.stage).toBe('LECTURA_VENCIDA');
    expect(row.alerts).toContain('LECTURA_VENCIDA');
    expect(row.alerts).toContain('DATOS_CONSTANCIA');
    expect(row.actions).toEqual(expect.arrayContaining(['REOPEN_READING', 'RESEND_NOTICE', 'COMPLETE_DATA', 'UNENROLL']));
  });
  it('aprobada sin avanzar y sin constancia -> avanzar + emitir constancia', () => {
    const row = mapRosterRow(
      { ...dbRow, assignment_id: 9, evaluation_status: 'passed', attempt_no: 1, submitted_at: hoursAgo(10), percentage: 95, question_count: 20, response_count: 20, missing_branch: false },
      NOW,
    );
    expect(row.stage).toBe('APROBADA');
    expect(row.alerts).toEqual(expect.arrayContaining(['AVANCE_PENDIENTE', 'SIN_CONSTANCIA']));
    expect(row.actions).toEqual(expect.arrayContaining(['ADVANCE', 'ISSUE_CERTIFICATE']));
    expect(row.actions).not.toContain('UNENROLL');
    expect(row.elapsed_hours).toBe(80);
  });
});

describe('rosterQuerySchema', () => {
  it('parsea csv de etapas y descarta desconocidas', () => {
    const parsed = rosterQuerySchema.parse({ stage: 'LEYENDO,NADA,APROBADA', page: '2', limit: '50', q: '  ana ' });
    expect(parsed.stage).toEqual(['LEYENDO', 'APROBADA']);
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(50);
    expect(parsed.q).toBe('ana');
  });
  it('defaults', () => {
    const parsed = rosterQuerySchema.parse({});
    expect(parsed).toMatchObject({ page: 1, limit: 30 });
    expect(parsed.stage).toBeUndefined();
  });
});
