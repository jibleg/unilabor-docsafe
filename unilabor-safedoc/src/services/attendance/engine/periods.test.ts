import { describe, expect, it } from 'vitest';
import {
  blockOf, customRange, neighborPeriod, periodLabel, periodRange, trendGranularity,
} from './periods';

describe('periodRange', () => {
  it('dia, semana (domingo y lunes)', () => {
    expect(periodRange('day', '2026-10-14', 'sunday')).toEqual({ from: '2026-10-14', to: '2026-10-14' });
    expect(periodRange('week', '2026-10-14', 'sunday')).toEqual({ from: '2026-10-11', to: '2026-10-17' });
    expect(periodRange('week', '2026-10-14', 'monday')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });
  it('quincenas y meses', () => {
    expect(periodRange('fortnight', '2026-02-10', 'sunday')).toEqual({ from: '2026-02-01', to: '2026-02-15' });
    expect(periodRange('fortnight', '2028-02-20', 'sunday')).toEqual({ from: '2028-02-16', to: '2028-02-29' });
    expect(periodRange('month', '2026-04-30', 'sunday')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });
  it('periodos de varios meses alineados al multiplo', () => {
    expect(periodRange('bimester', '2026-04-15', 'sunday')).toEqual({ from: '2026-03-01', to: '2026-04-30' });
    expect(periodRange('quarter', '2026-08-01', 'sunday')).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(periodRange('semester', '2026-06-30', 'sunday')).toEqual({ from: '2026-01-01', to: '2026-06-30' });
    expect(periodRange('semester', '2026-07-01', 'sunday')).toEqual({ from: '2026-07-01', to: '2026-12-31' });
    expect(periodRange('year', '2026-10-12', 'sunday')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('custom acomoda invertidos y limita a 366 dias', () => {
    expect(periodRange('custom', '2026-03-10', 'sunday', '2026-03-01')).toEqual({ from: '2026-03-01', to: '2026-03-10' });
    expect(customRange('2026-01-01', '2028-01-01')).toEqual({ from: '2026-01-01', to: '2027-01-01' });
    expect(customRange('2026-01-01', '2026-12-31').to).toBe('2026-12-31');
  });
});

describe('neighborPeriod', () => {
  const w = 'sunday' as const;
  it('dia y semana', () => {
    expect(neighborPeriod('day', periodRange('day', '2026-03-01', w), -1, w).from).toBe('2026-02-28');
    expect(neighborPeriod('week', periodRange('week', '2026-10-14', w), 1, w)).toEqual({ from: '2026-10-18', to: '2026-10-24' });
  });
  it('quincena cruza mes y anio', () => {
    expect(neighborPeriod('fortnight', { from: '2026-12-16', to: '2026-12-31' }, 1, w)).toEqual({ from: '2027-01-01', to: '2027-01-15' });
    expect(neighborPeriod('fortnight', { from: '2026-01-01', to: '2026-01-15' }, -1, w)).toEqual({ from: '2025-12-16', to: '2025-12-31' });
    expect(neighborPeriod('fortnight', { from: '2026-03-01', to: '2026-03-15' }, 1, w)).toEqual({ from: '2026-03-16', to: '2026-03-31' });
    expect(neighborPeriod('fortnight', { from: '2026-03-16', to: '2026-03-31' }, -1, w)).toEqual({ from: '2026-03-01', to: '2026-03-15' });
  });
  it('meses, trimestres y anios', () => {
    expect(neighborPeriod('month', { from: '2026-01-01', to: '2026-01-31' }, -1, w)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(neighborPeriod('quarter', { from: '2026-10-01', to: '2026-12-31' }, 1, w)).toEqual({ from: '2027-01-01', to: '2027-03-31' });
    expect(neighborPeriod('year', { from: '2026-01-01', to: '2026-12-31' }, -1, w)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
  it('custom conserva la duracion', () => {
    expect(neighborPeriod('custom', { from: '2026-03-01', to: '2026-03-10' }, 1, w)).toEqual({ from: '2026-03-11', to: '2026-03-20' });
    expect(neighborPeriod('custom', { from: '2026-03-01', to: '2026-03-10' }, -1, w)).toEqual({ from: '2026-02-19', to: '2026-02-28' });
  });
});

describe('periodLabel / granularidad / bloques', () => {
  it('etiquetas en espanol', () => {
    expect(periodLabel('day', '2026-10-12', '2026-10-12')).toBe('12 de octubre de 2026');
    expect(periodLabel('fortnight', '2026-10-16', '2026-10-31')).toBe('2a quincena de octubre 2026');
    expect(periodLabel('month', '2026-10-01', '2026-10-31')).toBe('octubre 2026');
    expect(periodLabel('year', '2026-01-01', '2026-12-31')).toBe('2026');
    expect(periodLabel('quarter', '2026-07-01', '2026-09-30')).toBe('jul - sep 2026');
    expect(periodLabel('week', '2026-10-11', '2026-10-17')).toBe('11 oct - 17 oct 2026');
  });
  it('granularidad de la tendencia', () => {
    expect(trendGranularity('month')).toBe('day');
    expect(trendGranularity('quarter')).toBe('week');
    expect(trendGranularity('year')).toBe('month');
    expect(trendGranularity('custom', 31)).toBe('day');
    expect(trendGranularity('custom', 32)).toBe('week');
    expect(trendGranularity('custom', 120)).toBe('week');
    expect(trendGranularity('custom', 121)).toBe('month');
  });
  it('bloqueDe agrupa por dia, semana o mes', () => {
    expect(blockOf('2026-10-14', 'day', 'sunday')).toEqual({ key: '2026-10-14', label: '14' });
    expect(blockOf('2026-10-14', 'week', 'sunday')).toEqual({ key: '2026-10-11', label: '11/10' });
    expect(blockOf('2026-10-14', 'month', 'sunday')).toEqual({ key: '2026-10', label: 'oct' });
  });
});
