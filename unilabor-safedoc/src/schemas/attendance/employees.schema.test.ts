import { describe, expect, it } from 'vitest';
import { bulkEnableSchema, updateEmployeeProfileSchema } from './employees.schema';

describe('numero de empleado en el reloj', () => {
  it('solo acepta digitos (la terminal rechaza letras y guiones)', () => {
    expect(updateEmployeeProfileSchema.safeParse({ device_employee_number: '54321' }).success).toBe(true);
    for (const bad of ['TEST-3', 'AB12', '12 34', '12-34', '', '1'.repeat(21)]) {
      expect(updateEmployeeProfileSchema.safeParse({ device_employee_number: bad }).success, bad).toBe(false);
    }
    expect(updateEmployeeProfileSchema.safeParse({ device_employee_number: null }).success).toBe(true);
  });

  it('el habilitado en lote aplica la misma regla', () => {
    const row = (number: string) => ({ rows: [{ employee_id: 1, device_employee_number: number }] });
    expect(bulkEnableSchema.safeParse(row('1001')).success).toBe(true);
    expect(bulkEnableSchema.safeParse(row('EMP-1')).success).toBe(false);
  });
});
