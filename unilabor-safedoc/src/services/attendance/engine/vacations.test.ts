import { describe, expect, it } from 'vitest';
import type { EngineAssignment, EngineShift } from './schedule';
import {
  aniosCumplidos,
  countWorkingDays,
  diasPorAntiguedad,
  distribuirTomados,
  evaluateRequest,
  fechaAniversario,
  planPeriods,
  summarizeBalance,
  sumarMeses,
  type PolicyRow,
} from './vacations';

const TABLE: PolicyRow[] = [
  { fromSeniorityYear: 1, vacationDays: 12 },
  { fromSeniorityYear: 2, vacationDays: 14 },
  { fromSeniorityYear: 6, vacationDays: 22 },
  { fromSeniorityYear: 11, vacationDays: 24 },
];

describe('diasPorAntiguedad', () => {
  it('toma la fila con mayor anio <= n', () => {
    expect(diasPorAntiguedad(1, TABLE)).toBe(12);
    expect(diasPorAntiguedad(5, TABLE)).toBe(14);
    expect(diasPorAntiguedad(6, TABLE)).toBe(22);
    expect(diasPorAntiguedad(30, TABLE)).toBe(24);
  });
  it('devuelve 0 con n < 1 o tabla vacia', () => {
    expect(diasPorAntiguedad(0, TABLE)).toBe(0);
    expect(diasPorAntiguedad(3, [])).toBe(0);
  });
});

describe('fechas de antiguedad', () => {
  it('cuenta anios cumplidos', () => {
    expect(aniosCumplidos('2020-03-15', '2026-03-14')).toBe(5);
    expect(aniosCumplidos('2020-03-15', '2026-03-15')).toBe(6);
    expect(aniosCumplidos('2026-01-01', '2026-06-01')).toBe(0);
  });
  it('maneja 29 de febrero', () => {
    expect(fechaAniversario('2020-02-29', 1)).toBe('2021-02-28');
    expect(aniosCumplidos('2020-02-29', '2021-02-27')).toBe(0);
    expect(aniosCumplidos('2020-02-29', '2021-02-28')).toBe(1);
  });
  it('suma meses con tope de fin de mes', () => {
    expect(sumarMeses('2026-03-15', 18)).toBe('2027-09-15');
    expect(sumarMeses('2026-08-31', 6)).toBe('2027-02-28');
  });
  it('planea un periodo por aniversario con vencimiento', () => {
    const plans = planPeriods('2023-05-10', '2026-06-01', 18, TABLE);
    expect(plans.map((p) => p.seniorityYear)).toEqual([1, 2, 3]);
    expect(plans[0]).toMatchObject({ startDate: '2024-05-10', dueDate: '2025-11-10', daysEntitled: 12 });
    expect(plans[2]).toMatchObject({ startDate: '2026-05-10', daysEntitled: 14 });
  });
});

describe('distribuirTomados', () => {
  const p = (entitled: number, expired = false, adjustment = 0) => ({ entitled, adjustment, expired });
  it('reparte del mas antiguo al mas nuevo', () => {
    expect(distribuirTomados([p(12), p(14)], 15)).toEqual([12, 3]);
  });
  it('los vencidos aportan 0', () => {
    expect(distribuirTomados([p(12, true), p(14)], 5)).toEqual([0, 5]);
  });
  it('el remanente va al ultimo y deja saldo negativo', () => {
    expect(distribuirTomados([p(12), p(14)], 30)).toEqual([12, 18]);
  });
  it('considera ajustes y sin periodos no falla', () => {
    expect(distribuirTomados([p(12, false, 2)], 14)).toEqual([14]);
    expect(distribuirTomados([], 5)).toEqual([]);
  });
});

describe('summarizeBalance', () => {
  it('suma solo periodos vigentes y detecta el periodo por vencer', () => {
    const summary = summarizeBalance([
      { entitled: 12, adjustment: 0, taken: 0, expired: true, dueDate: '2025-01-01' },
      { entitled: 14, adjustment: 1, taken: 14, expired: false, dueDate: '2026-12-01' },
      { entitled: 16, adjustment: 0, taken: 4, expired: false, dueDate: '2027-12-01' },
    ]);
    expect(summary).toMatchObject({ entitled: 30, adjustment: 1, taken: 18, balance: 13 });
    expect(summary.expiring).toEqual({ days: 1, due_date: '2026-12-01' });
  });
  it('sin saldo no hay periodo por vencer', () => {
    expect(summarizeBalance([]).expiring).toBeNull();
  });
});

describe('evaluateRequest', () => {
  const base = { deductsVacation: true, isHourly: false, hasHireDate: true, workingDays: 5, balance: 6, pending: 3 };
  it('no aplica si el tipo no descuenta', () => {
    expect(evaluateRequest({ ...base, deductsVacation: false, policy: 'block' }).applies).toBe(false);
  });
  it('resta lo pendiente y calcula el exceso', () => {
    const result = evaluateRequest({ ...base, policy: 'warn' });
    expect(result).toMatchObject({ available: 3, exceeds: 2, blocked: false });
    expect(result.message).not.toBeNull();
  });
  it('bloquea con politica block y permite con allow', () => {
    expect(evaluateRequest({ ...base, policy: 'block' }).blocked).toBe(true);
    const allow = evaluateRequest({ ...base, policy: 'allow' });
    expect(allow.blocked).toBe(false);
    expect(allow.message).toBeNull();
  });
  it('sin exceso no hay mensaje', () => {
    expect(evaluateRequest({ ...base, workingDays: 2, policy: 'block' })).toMatchObject({ exceeds: 0, blocked: false });
  });
  it('sin fecha de ingreso lo reporta', () => {
    expect(evaluateRequest({ ...base, hasHireDate: false, policy: 'block' })).toMatchObject({ no_hire_date: true, blocked: true });
  });
});

describe('countWorkingDays', () => {
  const shifts = new Map<number, EngineShift>([
    [1, { id: 1, name: 'M', startTime: '08:00', endTime: '16:00', breakMinutes: 0, flexible: false, isActive: true }],
  ]);
  const assignment = (weekdays: number[], shiftId: number | null = 1): EngineAssignment => ({
    id: 1, shiftId, startDate: '2026-01-01', endDate: null, repeatsWeekly: true, weekInterval: 1, weekdays,
  });
  // 2026-10-12 es lunes.
  const run = (assignments: EngineAssignment[], holidays: string[] = []) =>
    countWorkingDays({
      from: '2026-10-12', to: '2026-10-18', assignments, shiftsById: shifts,
      holidays: new Set(holidays), weekStart: 'monday',
    });

  it('sin programacion asume lunes a viernes', () => {
    expect(run([])).toBe(5);
  });
  it('con programacion cuenta solo dias con turno', () => {
    expect(run([assignment([1, 2, 3, 4, 5, 6])])).toBe(6);
    expect(run([assignment([2, 4])])).toBe(2);
  });
  it('excluye festivos', () => {
    expect(run([], ['2026-10-14'])).toBe(4);
  });
  it('una semana solo con descanso esta programada y no cuenta', () => {
    expect(run([assignment([1, 2, 3, 4, 5, 6, 7], null)])).toBe(0);
  });
});
