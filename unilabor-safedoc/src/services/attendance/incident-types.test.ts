import { describe, expect, it } from 'vitest';
import { createIncidentTypeSchema } from '../../schemas/attendance/incident-types.schema';
import { systemTypeViolation } from './incident-types.service';

describe('tipos de incidencia', () => {
  it('valida el codigo y el nombre', () => {
    const ok = createIncidentTypeSchema.safeParse({ code: 'home_office', name: 'Home office' });
    expect(ok.success).toBe(true);
    for (const code of ['A', '1abc', 'Home', 'a', 'a'.repeat(31), 'con espacio']) {
      expect(createIncidentTypeSchema.safeParse({ code, name: 'Valido' }).success).toBe(false);
    }
    expect(createIncidentTypeSchema.safeParse({ code: 'ok_code', name: 'x' }).success).toBe(false);
  });
  it('protege los tipos de sistema', () => {
    const system = { is_system: true, code: 'vacation' };
    expect(systemTypeViolation(system, { code: 'otro' })).toMatch(/codigo/);
    expect(systemTypeViolation(system, { is_active: false })).toMatch(/desactivar/);
    expect(systemTypeViolation(system, { name: 'Nuevo', code: 'vacation' })).toBeNull();
    expect(systemTypeViolation({ is_system: false, code: 'x1' }, { is_active: false })).toBeNull();
  });
});
