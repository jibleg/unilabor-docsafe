import { describe, expect, it } from 'vitest';
import {
  canAutoClose,
  describeRoles,
  pendingSignerRoles,
  rolesOfEmployee,
  rolesToSign,
  signerIssues,
  type SupervisionSignerCandidate,
} from './rh-supervision-signature.rules';

const signer = (role: SupervisionSignerCandidate['role'], patch: Partial<SupervisionSignerCandidate> = {}): SupervisionSignerCandidate => ({
  role,
  employee_id: role === 'SUPERVISOR' ? 10 : role === 'AREA_RESPONSIBLE' ? 20 : 30,
  name: role === 'SUPERVISOR' ? 'Ana Supervisora' : role === 'AREA_RESPONSIBLE' ? 'Beto Responsable' : 'Caro Evaluada',
  is_active: true,
  has_user: true,
  ...patch,
});

const ALL = [signer('SUPERVISOR'), signer('AREA_RESPONSIBLE'), signer('EMPLOYEE')];
const IDS = { employee_id: 30, supervisor_employee_id: 10, area_responsible_employee_id: 20 };

describe('ANA-REG-060: validacion de firmantes antes de enviar a firma', () => {
  it('con los tres firmantes activos y con usuario se puede enviar', () => {
    expect(signerIssues(ALL)).toEqual([]);
  });

  it('dice quien falta y que hacer cuando no hay supervisor o responsable asignado', () => {
    const issues = signerIssues([signer('SUPERVISOR', { employee_id: null, name: '' }), signer('AREA_RESPONSIBLE', { employee_id: null }), signer('EMPLOYEE')]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('Supervisor / Auditor');
    expect(issues[0]).toContain('Pendientes Fase 6');
    expect(issues[1]).toContain('Responsable del Área');
    expect(issues[1]).toContain('Firmantes por área');
  });

  it('un firmante sin usuario vinculado impide el envio y lo nombra', () => {
    const issues = signerIssues([signer('SUPERVISOR'), signer('AREA_RESPONSIBLE', { has_user: false }), signer('EMPLOYEE')]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Beto Responsable (Responsable del Área)');
    expect(issues[0]).toContain('no tiene usuario');
  });

  it('un firmante dado de baja impide el envio (la baja pesa mas que la falta de usuario)', () => {
    const issues = signerIssues([signer('SUPERVISOR', { is_active: false, has_user: false }), signer('AREA_RESPONSIBLE'), signer('EMPLOYEE')]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('dado de baja');
  });

  it('un rol ausente de la lista de firmantes cuenta como faltante', () => {
    expect(signerIssues([signer('SUPERVISOR'), signer('EMPLOYEE')])).toHaveLength(1);
  });
});

describe('ANA-REG-060: firmas pendientes y cierre automatico', () => {
  it('lista las firmas que faltan en el orden del formato', () => {
    expect(pendingSignerRoles([])).toEqual(['SUPERVISOR', 'AREA_RESPONSIBLE', 'EMPLOYEE']);
    expect(pendingSignerRoles(['EMPLOYEE'])).toEqual(['SUPERVISOR', 'AREA_RESPONSIBLE']);
    expect(pendingSignerRoles(['EMPLOYEE', 'SUPERVISOR', 'AREA_RESPONSIBLE'])).toEqual([]);
  });

  it('solo se cierra sola en firma y con las tres firmas, en cualquier orden', () => {
    expect(canAutoClose('PENDING_SIGNATURES', ['EMPLOYEE', 'AREA_RESPONSIBLE', 'SUPERVISOR'])).toBe(true);
    expect(canAutoClose('PENDING_SIGNATURES', ['SUPERVISOR', 'AREA_RESPONSIBLE'])).toBe(false);
    expect(canAutoClose('PENDING_SIGNATURES', [])).toBe(false);
  });

  it('nunca cierra un borrador ni vuelve a cerrar una lista cerrada, aunque tenga firmas', () => {
    const all = pendingSignerRoles([]);
    expect(canAutoClose('DRAFT', all)).toBe(false);
    expect(canAutoClose('CLOSED', all)).toBe(false);
  });
});

describe('ANA-REG-060: roles de quien firma (nadie firma por otro)', () => {
  it('cada persona solo tiene su rol', () => {
    expect(rolesOfEmployee(IDS, 10)).toEqual(['SUPERVISOR']);
    expect(rolesOfEmployee(IDS, 20)).toEqual(['AREA_RESPONSIBLE']);
    expect(rolesOfEmployee(IDS, 30)).toEqual(['EMPLOYEE']);
  });

  it('quien no participa en la lista no tiene roles ni nada que firmar', () => {
    expect(rolesOfEmployee(IDS, 99)).toEqual([]);
    expect(rolesToSign(IDS, 99, [])).toEqual([]);
  });

  it('una lista sin supervisor o responsable asignado no le da ese rol a nadie', () => {
    const ids = { employee_id: 30, supervisor_employee_id: null, area_responsible_employee_id: null };
    expect(rolesOfEmployee(ids, 0)).toEqual([]);
    expect(rolesOfEmployee(ids, 30)).toEqual(['EMPLOYEE']);
  });

  it('quien es supervisor y responsable del area firma por ambos roles', () => {
    const ids = { employee_id: 30, supervisor_employee_id: 10, area_responsible_employee_id: 10 };
    expect(rolesOfEmployee(ids, 10)).toEqual(['SUPERVISOR', 'AREA_RESPONSIBLE']);
    expect(rolesToSign(ids, 10, ['EMPLOYEE'])).toEqual(['SUPERVISOR', 'AREA_RESPONSIBLE']);
    expect(describeRoles(rolesOfEmployee(ids, 10))).toBe('Supervisor / Auditor y Responsable del Área');
    expect(describeRoles(['SUPERVISOR', 'AREA_RESPONSIBLE', 'EMPLOYEE'])).toBe('Supervisor / Auditor, Responsable del Área y Colaborador evaluado');
    expect(describeRoles(['EMPLOYEE'])).toBe('Colaborador evaluado');
  });

  it('un rol ya firmado no se vuelve a firmar', () => {
    expect(rolesToSign(IDS, 10, ['SUPERVISOR'])).toEqual([]);
    expect(rolesToSign(IDS, 20, ['SUPERVISOR'])).toEqual(['AREA_RESPONSIBLE']);
  });
});
