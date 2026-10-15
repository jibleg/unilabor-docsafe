import { describe, expect, it } from 'vitest';
import {
  canJustifyDay, defaultDaysRange, defaultPunchesRange, dayRowTone, exportResultParam, formatSummary, rangeDays, reasonLabel, resultFilterToQuery, validateRange,
} from './dayHelpers';
import { deviceTimeDiffers, isFutureMoment, normalizeReviewParam, validateManualPunch } from '../punches/punchHelpers';

describe('dayHelpers', () => {
  it('rango por defecto: el dia actual en Dias y en Checadas', () => {
    expect(defaultDaysRange('2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(defaultPunchesRange('2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-12' });
  });
  it('valida el rango', () => {
    const today = '2027-03-01';
    expect(validateRange('2026-01-01', '2026-01-10', today)).toBeNull();
    expect(validateRange('2026-02-01', '2026-01-10', today)).toMatch(/posterior a la final/);
    expect(validateRange('2026-01-01', '2027-01-02', today)).toMatch(/366/);
    expect(rangeDays('2024-01-01', '2024-12-31')).toBe(366);
    expect(validateRange('2026-01-01', '2026-12-31', today)).toBeNull();
  });
  it('rechaza fechas anteriores al 01/01/2026 o posteriores a hoy', () => {
    expect(validateRange('2025-12-31', '2026-01-05', '2026-10-15')).toMatch(/01\/01\/2026/);
    expect(validateRange('2026-10-10', '2026-10-16', '2026-10-15')).toMatch(/posterior a hoy/);
    expect(validateRange('2026-10-15', '2026-10-15', '2026-10-15')).toBeNull();
  });
  it('traduce el filtro de resultado', () => {
    expect(resultFilterToQuery('problems')).toEqual({ only_issues: true });
    expect(resultFilterToQuery('late')).toEqual({ result: 'late' });
    expect(resultFilterToQuery('')).toEqual({});
    expect(exportResultParam('problems')).toContain('absent');
  });
  it('justificar solo aplica a falta, parcial, retardo y salida anticipada', () => {
    expect(canJustifyDay({ day_result: 'absent' })).toBe(true);
    expect(canJustifyDay({ day_result: 'present' })).toBe(false);
    expect(canJustifyDay({ day_result: 'incident' })).toBe(false);
  });
  it('tono de fila y resumen', () => {
    expect(dayRowTone({ day_result: 'absent', has_pending_review: false, is_late_accumulation_absence: false })).toBe('absent');
    expect(dayRowTone({ day_result: 'late', has_pending_review: true, is_late_accumulation_absence: false })).toBe('review');
    expect(formatSummary({ absent: 2, late: 3, late_accumulation_absence: 1 })).toBe('2 faltas · 3 retardos · 1 faltas por retardos');
    expect(reasonLabel('incident:VAC')).toBe('Incidencia VAC');
  });
});

describe('punchHelpers', () => {
  it('normaliza review de la URL', () => {
    expect(normalizeReviewParam('pending')).toBe('pending');
    expect(normalizeReviewParam('x')).toBe('');
  });
  it('detecta momentos futuros y valida checada manual', () => {
    const now = new Date(2026, 9, 12, 10, 0);
    expect(isFutureMoment('2026-10-13', '08:00', now)).toBe(true);
    expect(isFutureMoment('2026-10-11', '23:00', now)).toBe(false);
    expect(validateManualPunch({ employeeId: '', date: '2026-10-11', time: '08:00', reason: 'motivo ok' }, now)).toMatch(/colaborador/);
    expect(validateManualPunch({ employeeId: '1', date: '2026-10-11', time: '08:00', reason: 'abc' }, now)).toMatch(/motivo/);
    expect(validateManualPunch({ employeeId: '1', date: '2026-10-11', time: '08:00', reason: 'olvido checar' }, now)).toBeNull();
  });
  it('hora del reloj distinta', () => {
    expect(deviceTimeDiffers('2026-10-08T15:00:00.000Z', '2026-10-08T15:00:01.000Z')).toBe(true);
    expect(deviceTimeDiffers('2026-10-08T15:00:00.000Z', '2026-10-08T15:00:00.400Z')).toBe(false);
    expect(deviceTimeDiffers('2026-10-08T15:00:00.000Z', null)).toBe(false);
  });
});
