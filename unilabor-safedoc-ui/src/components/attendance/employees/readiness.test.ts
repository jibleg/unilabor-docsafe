import { describe, expect, it } from 'vitest';
import type { AttendanceEmployee } from '../../../api/service.api-attendance-employees';
import { computeReadiness, isReadyToPunch, isValidDeviceNumber, validateVacationAdjustment } from './readiness';

const employee: AttendanceEmployee = {
  id: 1, employee_code: 'E1', full_name: 'Ana', email: null, area: null, position: null, is_active: true,
  branch_id: 1, branch_name: 'Centro', hire_date: null, is_enabled: true, device_employee_number: 'E1',
  suggested_device_number: 'E1', device_sync_status: 'synced', device_sync_error: null, device_synced_at: null, has_schedule: true,
};

describe('readiness', () => {
  it('detecta colaborador listo', () => {
    expect(isReadyToPunch(employee)).toBe(true);
  });

  it('reporta lo que falta', () => {
    const items = computeReadiness({ ...employee, branch_id: null, has_schedule: false, device_sync_status: 'error', device_sync_error: 'x' });
    expect(items.filter((item) => !item.ok).map((item) => item.key)).toEqual(['branch', 'schedule', 'synced']);
    expect(isReadyToPunch({ ...employee, device_employee_number: null })).toBe(false);
  });

  it('valida numero de reloj', () => {
    expect(isValidDeviceNumber('AB-12')).toBe(true);
    expect(isValidDeviceNumber('con espacio')).toBe(false);
    expect(isValidDeviceNumber('')).toBe(false);
    expect(isValidDeviceNumber('x'.repeat(21))).toBe(false);
  });

  it('valida ajuste de vacaciones', () => {
    expect(validateVacationAdjustment('2.5', 'motivo ok')).toBeNull();
    expect(validateVacationAdjustment('', 'motivo ok')).toMatch(/Indica/);
    expect(validateVacationAdjustment('61', 'motivo ok')).toMatch(/-60/);
    expect(validateVacationAdjustment('0.3', 'motivo ok')).toMatch(/0.5/);
    expect(validateVacationAdjustment('1', 'abc')).toMatch(/motivo/);
  });
});
