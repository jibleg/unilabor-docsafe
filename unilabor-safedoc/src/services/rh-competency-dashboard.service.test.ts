import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/db', () => ({ default: { query: vi.fn() } }));

import { CompetencyDashboardEvaluation, resolveStanding } from './rh-competency-dashboard.service';

const TODAY = '2026-10-02';

const evaluation = (overrides: Partial<CompetencyDashboardEvaluation>): CompetencyDashboardEvaluation => ({
  id: 1,
  employee_id: 1,
  position_id: 1,
  position_name: 'Químico analista',
  evaluation_type: 'PERIODICA',
  evaluation_date: '2026-01-01',
  evaluator_name: 'Evaluador',
  status: 'CLOSED',
  competency_pct: 95,
  performance_pct: 95,
  knowledge_pct: 95,
  final_pct: 95,
  veto_applied: false,
  dictamen: 'COMPETENTE_Y_AUTORIZADO',
  authorization_result: 'AUTORIZADO',
  authorized_at: '2026-01-02',
  authorized_by_name: 'RH',
  valid_until: '2027-01-02',
  reference_course_title: null,
  knowledge_status: null,
  items_total: 10,
  items_scored: 10,
  actions_count: 0,
  document_id: 10,
  certificate_document_id: 11,
  closed_at: '2026-01-01T12:00:00.000Z',
  created_at: '2026-01-01T10:00:00.000Z',
  ...overrides,
});

describe('resolveStanding', () => {
  it('sin evaluaciones = SIN_EVALUACION; solo borrador = EN_CAPTURA', () => {
    expect(resolveStanding([], TODAY).standing).toBe('SIN_EVALUACION');
    const draft = resolveStanding([evaluation({ id: 7, status: 'DRAFT', closed_at: null })], TODAY);
    expect(draft).toMatchObject({ standing: 'EN_CAPTURA', current_evaluation_id: 7 });
  });

  it('clasifica la vigencia de la autorización (vigente, por vencer a 60 días, vencida)', () => {
    expect(resolveStanding([evaluation({ valid_until: '2027-01-02' })], TODAY)).toMatchObject({ standing: 'VIGENTE', days_to_expiry: 92 });
    expect(resolveStanding([evaluation({ valid_until: '2026-12-01' })], TODAY).standing).toBe('POR_VENCER');
    expect(resolveStanding([evaluation({ valid_until: '2026-10-01' })], TODAY)).toMatchObject({ standing: 'VENCIDA', days_to_expiry: -1 });
  });

  it('pendiente de autorizar y no competente / no autorizado', () => {
    expect(resolveStanding([evaluation({ authorization_result: 'PENDIENTE', valid_until: null })], TODAY).standing).toBe(
      'PENDIENTE_AUTORIZACION',
    );
    expect(resolveStanding([evaluation({ authorization_result: 'NO_AUTORIZADO', valid_until: null })], TODAY).standing).toBe(
      'NO_COMPETENTE',
    );
  });

  it('manda la última cerrada aunque haya un borrador de reevaluación', () => {
    const result = resolveStanding(
      [
        evaluation({ id: 3, status: 'DRAFT', closed_at: null }),
        evaluation({ id: 2, closed_at: '2026-06-01T00:00:00.000Z', authorization_result: 'PENDIENTE', valid_until: null }),
        evaluation({ id: 1, closed_at: '2025-06-01T00:00:00.000Z' }),
      ],
      TODAY,
    );
    expect(result).toMatchObject({ standing: 'PENDIENTE_AUTORIZACION', current_evaluation_id: 2 });
  });
});
