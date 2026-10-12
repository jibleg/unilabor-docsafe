import { describe, expect, it } from 'vitest';
import { AttendanceError } from '../../services/attendance/attendance-errors';
import { commitmentQuerySchema, liveBoardQuerySchema, parseQuery } from './boards.schema';
import { daysExportQuerySchema, overtimeExportQuerySchema } from './exports.schema';

describe('liveBoardQuerySchema', () => {
  it('acepta vacio y parametros opcionales', () => {
    expect(parseQuery(liveBoardQuerySchema, {})).toEqual({});
    expect(parseQuery(liveBoardQuerySchema, { date: '2026-10-12', branch_id: '3' })).toEqual({ date: '2026-10-12', branch_id: 3 });
    expect(parseQuery(liveBoardQuerySchema, { date: '', branch_id: '' })).toEqual({});
  });
  it('rechaza fechas imposibles e ids invalidos con AttendanceError', () => {
    expect(() => parseQuery(liveBoardQuerySchema, { date: '2026-02-30' })).toThrow(AttendanceError);
    expect(() => parseQuery(liveBoardQuerySchema, { branch_id: '-1' })).toThrow(AttendanceError);
  });
});

describe('commitmentQuerySchema', () => {
  it('usa mes por defecto', () => {
    expect(parseQuery(commitmentQuerySchema, {}).period).toBe('month');
  });
  it('rechaza periodos desconocidos', () => {
    expect(() => parseQuery(commitmentQuerySchema, { period: 'decade' })).toThrow(AttendanceError);
  });
  it('custom exige rango y limita a 366 dias (acepta invertido)', () => {
    expect(() => parseQuery(commitmentQuerySchema, { period: 'custom' })).toThrow(AttendanceError);
    expect(() => parseQuery(commitmentQuerySchema, { period: 'custom', from: '2025-01-01', to: '2026-12-31' })).toThrow(AttendanceError);
    expect(parseQuery(commitmentQuerySchema, { period: 'custom', from: '2026-03-10', to: '2026-03-01' }).period).toBe('custom');
    expect(parseQuery(commitmentQuerySchema, { period: 'custom', from: '2026-01-01', to: '2026-12-31' }).period).toBe('custom');
  });
});

describe('exports', () => {
  it('days exige from/to, valida resultado y rango', () => {
    expect(() => parseQuery(daysExportQuerySchema, { from: '2026-01-01' })).toThrow(AttendanceError);
    expect(() => parseQuery(daysExportQuerySchema, { from: '2026-01-01', to: '2026-01-31', result: 'nope' })).toThrow(AttendanceError);
    expect(() => parseQuery(daysExportQuerySchema, { from: '2026-02-01', to: '2026-01-01' })).toThrow(AttendanceError);
    expect(parseQuery(daysExportQuerySchema, { from: '2026-01-01', to: '2026-01-31', result: 'late' }).result).toBe('late');
  });
  it('overtime limita a 366 dias', () => {
    expect(() => parseQuery(overtimeExportQuerySchema, { from: '2025-01-01', to: '2026-06-01' })).toThrow(AttendanceError);
    expect(parseQuery(overtimeExportQuerySchema, { from: '2026-01-01', to: '2026-06-01', branch_id: '2' }).branch_id).toBe(2);
  });
});
