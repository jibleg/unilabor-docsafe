import { describe, expect, it } from 'vitest';
import {
  resolveAuthorizedPersonnelRow,
  summarizeAuthorizedPersonnel,
  type AuthorizedPersonnelEvaluation,
} from './rh-authorized-personnel.rules';

const TODAY = '2026-11-23';

const evaluation = (overrides: Partial<AuthorizedPersonnelEvaluation> = {}): AuthorizedPersonnelEvaluation => ({
  id: 1,
  evaluation_date: '2026-11-20',
  dictamen: 'COMPETENTE_Y_AUTORIZADO',
  authorization_result: 'AUTORIZADO',
  authorized_at: '2026-11-21',
  valid_until: '2027-11-21',
  authorization_level_id: 2,
  authorization_level_no: 2,
  authorization_level_name: 'Operación',
  ...overrides,
});

const resolve = (latestClosed: AuthorizedPersonnelEvaluation | null, hasDraft = false, hasPosition = true) =>
  resolveAuthorizedPersonnelRow({ hasPosition, latestClosed, hasDraft }, TODAY);

describe('resolveAuthorizedPersonnelRow', () => {
  it('deja la fila en blanco cuando el puesto no tiene evaluacion cerrada', () => {
    const row = resolve(null);
    expect(row).toMatchObject({ competent: null, authorized: null, last_evaluation_date: null, alert: 'SIN_EVALUACION' });
    expect(resolve(null, true).alert).toBe('EN_CAPTURA');
    expect(resolve(null, false, false).alert).toBe('SIN_PUESTO');
  });

  it('autorizado y vigente: cuenta regresiva de dias y nivel', () => {
    const row = resolve(evaluation());
    expect(row).toMatchObject({ competent: true, authorized: true, authorized_at: '2026-11-21', days_remaining: 363, authorization_level_no: 2, alert: 'OK', alert_text: '' });
  });

  it('avisa por vencer a 60 dias o menos y vencida al pasar la vigencia', () => {
    expect(resolve(evaluation({ valid_until: '2027-01-22' }))).toMatchObject({ days_remaining: 60, alert: 'POR_VENCER', alert_text: 'POR VENCER — quedan 60 días' });
    expect(resolve(evaluation({ valid_until: '2027-01-23' })).alert).toBe('OK');
    expect(resolve(evaluation({ valid_until: '2026-11-22' }))).toMatchObject({ days_remaining: -1, alert: 'VENCIDA', alert_tone: 'red' });
  });

  it('competente pendiente de autorizar: sin decision ni vigencia', () => {
    const row = resolve(evaluation({ authorization_result: 'PENDIENTE', valid_until: null, authorization_level_id: null, authorization_level_no: null }));
    expect(row).toMatchObject({ competent: true, authorized: null, authorized_at: null, days_remaining: null, alert: 'PENDIENTE_AUTORIZACION' });
  });

  it('no competente nunca aparece autorizado', () => {
    const row = resolve(evaluation({ dictamen: 'NO_COMPETENTE', authorization_result: 'NO_AUTORIZADO', valid_until: null }));
    expect(row).toMatchObject({ competent: false, authorized: false, authorization_level_no: null, alert: 'NO_COMPETENTE' });
  });

  it('marca al autorizado que nacio sin nivel de autorizacion', () => {
    const row = resolve(evaluation({ authorization_level_id: null, authorization_level_no: null, authorization_level_name: null }));
    expect(row).toMatchObject({ authorized: true, alert: 'SIN_NIVEL' });
  });
});

describe('summarizeAuthorizedPersonnel', () => {
  it('cuenta filas por puesto y personas distintas', () => {
    const rows = [
      { employee_id: 1, ...resolve(evaluation({ authorization_level_no: 4 })) },
      { employee_id: 1, ...resolve(null) },
      { employee_id: 2, ...resolve(evaluation({ valid_until: '2026-11-01' })) },
    ];
    expect(summarizeAuthorizedPersonnel(rows)).toEqual({
      rows_total: 3,
      people_total: 2,
      competent: 2,
      authorized: 2,
      authorized_not_competent: 0,
      without_evaluation_date: 1,
      expired: 1,
      expiring_soon: 0,
      report_release_level: 1,
    });
  });
});
