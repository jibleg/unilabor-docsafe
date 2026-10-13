import { describe, expect, it } from 'vitest';
import type { AttendanceEmployee } from '../../../api/service.api-attendance-employees';
import { computeReadiness, isReadyToPunch, isValidDeviceNumber, onlyDeviceDigits, validateVacationAdjustment } from './readiness';

const employee: AttendanceEmployee = {
  id: 1, employee_code: 'E1', full_name: 'Ana', email: null, area: null, position: null, is_active: true,
  branch_id: 1, branch_name: 'Centro', hire_date: null, is_enabled: true, device_employee_number: '1001',
  suggested_device_number: '1001', device_sync_status: 'synced', device_sync_error: null, device_synced_at: null, has_schedule: true,
  number_locked: false, has_face_photo: false, face_photo_updated_at: null, face_sync_status: 'not_applicable', face_sync_error: null, device_branches: [], biometrics: { fingerprint: false, face: false },
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

  it('valida numero de empleado', () => {
    expect(isValidDeviceNumber('54321')).toBe(true);
    expect(isValidDeviceNumber('AB-12')).toBe(false); // el reloj no acepta letras ni guiones
    expect(isValidDeviceNumber('con espacio')).toBe(false);
    expect(isValidDeviceNumber('')).toBe(false);
    expect(isValidDeviceNumber('1'.repeat(21))).toBe(false);
  });

  it('valida ajuste de vacaciones', () => {
    expect(validateVacationAdjustment('2.5', 'motivo ok')).toBeNull();
    expect(validateVacationAdjustment('', 'motivo ok')).toMatch(/Indica/);
    expect(validateVacationAdjustment('61', 'motivo ok')).toMatch(/-60/);
    expect(validateVacationAdjustment('0.3', 'motivo ok')).toMatch(/0.5/);
    expect(validateVacationAdjustment('1', 'abc')).toMatch(/motivo/);
  });
});

describe('numero de empleado no valido para el reloj', () => {
  it('un numero con letras ya guardado no cuenta como listo y explica por que', () => {
    const legacy = { ...employee, device_employee_number: 'TEST-3' };
    const item = computeReadiness(legacy).find((entry) => entry.key === 'number');
    expect(item?.ok).toBe(false);
    expect(item?.detail).toContain('no es válido para el reloj');
    expect(isReadyToPunch(legacy)).toBe(false);
  });
});

describe('onlyDeviceDigits', () => {
  it('descarta todo lo que no sea digito y limita a 20', () => {
    expect(onlyDeviceDigits('ab-12 c3!')).toBe('123');
    expect(onlyDeviceDigits('TEST-3')).toBe('3');
    expect(onlyDeviceDigits('9'.repeat(25))).toBe('9'.repeat(20));
    expect(onlyDeviceDigits('')).toBe('');
  });
});
