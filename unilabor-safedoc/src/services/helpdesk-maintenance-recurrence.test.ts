import { describe, expect, it } from 'vitest';
import {
  addMonthsIso,
  computeNextDate,
  computeWindow,
  projectDates,
  requiresPostRepairVerification,
  requiresResponsibleSignature,
  windowState,
  type RecurrenceRule,
} from './helpdesk-maintenance-recurrence';

const monthly: RecurrenceRule = {
  interval_months: 1,
  custom_interval_value: null,
  custom_interval_unit: null,
  anchor_mode: 'FIXED',
  recurrence_end_on: null,
  recurrence_max_occurrences: null,
};

describe('recurrencia del programa de mantenimiento', () => {
  it('suma meses cayendo al ultimo dia cuando el mes es mas corto', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-03-31', 6)).toBe('2026-09-30');
    expect(addMonthsIso('2026-05-15', 2)).toBe('2026-07-15');
  });

  it('prefiere el intervalo personalizado sobre el catalogo', () => {
    const rule: RecurrenceRule = { ...monthly, custom_interval_value: 2, custom_interval_unit: 'WEEK' };
    expect(computeNextDate(rule, '2026-10-01')).toBe('2026-10-15');
    expect(computeNextDate({ ...rule, custom_interval_unit: 'DAY', custom_interval_value: 45 }, '2026-10-01')).toBe('2026-11-15');
  });

  it('proyecta dentro del horizonte y respeta fin y maximo de ocurrencias', () => {
    expect(projectDates({ rule: monthly, fromDate: '2026-10-05', horizonEnd: '2027-01-31', occurrencesSoFar: 0 })).toEqual([
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
    ]);
    expect(
      projectDates({ rule: { ...monthly, recurrence_end_on: '2026-11-30' }, fromDate: '2026-10-05', horizonEnd: '2027-01-31', occurrencesSoFar: 0 }),
    ).toEqual(['2026-10-05', '2026-11-05']);
    expect(
      projectDates({ rule: { ...monthly, recurrence_max_occurrences: 5 }, fromDate: '2026-10-05', horizonEnd: '2027-12-31', occurrencesSoFar: 3 }),
    ).toHaveLength(2);
    expect(projectDates({ rule: { ...monthly, interval_months: null }, fromDate: '2026-10-05', horizonEnd: '2027-12-31', occurrencesSoFar: 0 })).toEqual([
      '2026-10-05',
    ]);
  });

  it('acota la ventana posterior segun criticidad', () => {
    expect(computeWindow({ scheduledFor: '2026-10-10', beforeDays: 3, afterDays: 10, criticalityCode: 'CRITICAL' })).toEqual({
      starts_on: '2026-10-07',
      ends_on: '2026-10-10',
      after_days: 0,
    });
    expect(computeWindow({ scheduledFor: '2026-10-10', beforeDays: 0, afterDays: 10, criticalityCode: 'HIGH' }).ends_on).toBe('2026-10-17');
    expect(computeWindow({ scheduledFor: '2026-10-10', beforeDays: 0, afterDays: 10, criticalityCode: null }).ends_on).toBe('2026-10-20');
  });

  it('clasifica el estado respecto a la ventana', () => {
    expect(windowState('2026-10-07', '2026-10-17', '2026-10-05')).toBe('EARLY');
    expect(windowState('2026-10-07', '2026-10-17', '2026-10-12')).toBe('ON_TIME');
    expect(windowState('2026-10-07', '2026-10-17', '2026-10-18')).toBe('OVERDUE');
  });

  it('aplica las reglas de firma y verificacion post-reparacion', () => {
    expect(requiresResponsibleSignature('EXTERNAL_PROVIDER', 'LOW')).toBe(true);
    expect(requiresResponsibleSignature('INTERNAL_TECH', 'HIGH')).toBe(true);
    expect(requiresResponsibleSignature('INTERNAL_TECH', 'MEDIUM')).toBe(false);
    expect(requiresPostRepairVerification('CRITICAL')).toBe(true);
    expect(requiresPostRepairVerification('MEDIUM')).toBe(false);
    expect(requiresPostRepairVerification(null)).toBe(false);
  });
});
