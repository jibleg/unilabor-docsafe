import { describe, expect, it } from 'vitest';
import type { SupervisionSigner } from '../../../types/models';
import { describeSignerRoles, signerIssue } from './supervision-ui';

const signer = (patch: Partial<SupervisionSigner> = {}): SupervisionSigner => ({
  role: 'SUPERVISOR',
  employee_id: 10,
  name: 'Ana Supervisora',
  is_active: true,
  has_user: true,
  signed_at: null,
  ...patch,
});

describe('ANA-REG-060: firmantes en la interfaz', () => {
  it('un firmante asignado, activo y con usuario está listo para firmar', () => {
    expect(signerIssue(signer())).toBeNull();
  });

  it('explica por qué un firmante no puede firmar en su Buzón', () => {
    expect(signerIssue(signer({ employee_id: null }))).toBe('Sin asignar');
    expect(signerIssue(signer({ is_active: false, has_user: false }))).toBe('Dado de baja');
    expect(signerIssue(signer({ has_user: false }))).toBe('Sin usuario vinculado');
  });

  it('describe uno, dos o tres roles', () => {
    expect(describeSignerRoles([])).toBe('');
    expect(describeSignerRoles(['EMPLOYEE'])).toBe('Colaborador evaluado');
    expect(describeSignerRoles(['SUPERVISOR', 'AREA_RESPONSIBLE'])).toBe('Supervisor / Auditor y Responsable del Área');
    expect(describeSignerRoles(['SUPERVISOR', 'AREA_RESPONSIBLE', 'EMPLOYEE'])).toBe('Supervisor / Auditor, Responsable del Área y Colaborador evaluado');
  });
});
