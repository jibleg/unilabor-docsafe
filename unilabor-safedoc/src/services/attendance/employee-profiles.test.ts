import { describe, expect, it } from 'vitest';
import { bulkEnableSchema, updateEmployeeProfileSchema } from '../../schemas/attendance/employees.schema';
import { enableViolation, nextSyncStatus, suggestDeviceNumber, type ProfileState } from './employee-profiles.service';

const base: ProfileState = { is_enabled: false, device_employee_number: null, branch_id: null };

describe('perfiles de colaborador', () => {
  it('sugiere el numero de reloj desde el codigo solo si es valido', () => {
    expect(suggestDeviceNumber('EMP-001')).toBe('EMP-001');
    expect(suggestDeviceNumber('EMP 001')).toBeNull();
    expect(suggestDeviceNumber(null)).toBeNull();
  });
  it('no permite habilitar sin sucursal ni numero', () => {
    expect(enableViolation({ ...base, is_enabled: true })).toMatch(/sucursal/);
    expect(enableViolation({ ...base, is_enabled: true, branch_id: 1 })).toMatch(/numero de reloj/);
    expect(enableViolation({ is_enabled: true, branch_id: 1, device_employee_number: '12' })).toBeNull();
    expect(enableViolation(base)).toBeNull();
  });
  it('calcula el estado de sincronizacion', () => {
    const enabled: ProfileState = { is_enabled: true, device_employee_number: 'A1', branch_id: 1 };
    expect(nextSyncStatus(base, enabled)).toBe('pending');
    expect(nextSyncStatus(enabled, { ...enabled, is_enabled: false })).toBe('not_applicable');
    expect(nextSyncStatus(enabled, { ...enabled, branch_id: 2 })).toBe('pending');
    expect(nextSyncStatus(enabled, { ...enabled, device_employee_number: 'a1' })).toBeNull();
    expect(nextSyncStatus(enabled, { ...enabled, device_employee_number: 'B2' })).toBe('pending');
  });
  it('valida entradas', () => {
    expect(updateEmployeeProfileSchema.safeParse({}).success).toBe(false);
    expect(updateEmployeeProfileSchema.safeParse({ device_employee_number: 'bad number' }).success).toBe(false);
    expect(updateEmployeeProfileSchema.safeParse({ device_employee_number: null, hire_date: '2026-02-31' }).success).toBe(false);
    expect(updateEmployeeProfileSchema.safeParse({ branch_id: null, hire_date: '2024-03-01' }).success).toBe(true);
    expect(bulkEnableSchema.safeParse({ rows: [] }).success).toBe(false);
  });
});
