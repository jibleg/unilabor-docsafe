import { describe, expect, it } from 'vitest';
import type { VacationPolicyRow } from '../../../api/service.api-attendance-settings';
import {
  formatSettingValue,
  isValidIncidentCode,
  isValidIsoDate,
  isPolicyEqualToLaw,
  suggestIncidentCode,
  vacationRowLabel,
  validateSettingInput,
} from './settingsHelpers';

const intSetting = { type: 'integer', min: 0, max: 120, options: null, unit: 'min' };
const row = (year: number, days: number, differs = false): VacationPolicyRow => ({
  from_seniority_year: year, vacation_days: days, law_days: days, differs_from_law: differs,
});

describe('settingsHelpers', () => {
  it('formatea valores con unidad y enum', () => {
    expect(formatSettingValue({ type: 'integer', unit: 'min' }, 10)).toBe('10 min');
    expect(formatSettingValue({ type: 'enum', unit: null }, 'fortnight')).toBe('Quincena');
    expect(formatSettingValue({ type: 'time', unit: null }, '04:00')).toBe('04:00');
  });
  it('valida enteros, rango y motivo', () => {
    expect(validateSettingInput(intSetting, '10', 'ajuste por política')).toBeNull();
    expect(validateSettingInput(intSetting, '', 'ajuste por política')).toMatch(/valor/);
    expect(validateSettingInput(intSetting, '1.5', 'ajuste por política')).toMatch(/entero/);
    expect(validateSettingInput(intSetting, '121', 'ajuste por política')).toMatch(/máximo/);
    expect(validateSettingInput(intSetting, '10', 'abc')).toMatch(/motivo/);
  });
  it('valida hora y opciones', () => {
    const time = { type: 'time', min: null, max: null, options: null };
    expect(validateSettingInput(time, '25:00', 'motivo ok')).toMatch(/HH:MM/);
    expect(validateSettingInput(time, '04:30', 'motivo ok')).toBeNull();
    const en = { type: 'enum', min: null, max: null, options: ['a', 'b'] };
    expect(validateSettingInput(en, 'c', 'motivo ok')).toMatch(/opción/);
  });
  it('valida claves de incidencia', () => {
    expect(isValidIncidentCode('permiso_1')).toBe(true);
    expect(isValidIncidentCode('1abc')).toBe(false);
    expect(isValidIncidentCode('Abc')).toBe(false);
    expect(suggestIncidentCode('Permiso médico')).toBe('permiso_medico');
  });
  it('etiqueta filas de vacaciones', () => {
    const rows = [row(1, 12), row(2, 14), row(6, 22), row(11, 24)];
    expect(vacationRowLabel(rows, 0)).toBe('Año 1');
    expect(vacationRowLabel(rows, 2)).toBe('Años 6 a 10');
    expect(vacationRowLabel(rows, 3)).toBe('Año 11 en adelante');
    expect(isPolicyEqualToLaw(rows)).toBe(true);
    expect(isPolicyEqualToLaw([row(1, 15, true)])).toBe(false);
  });
  it('valida fechas', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026-03-01')).toBe(true);
  });
});
