import { describe, expect, it } from 'vitest';
import type { SupervisionChecklistSection, SupervisionSigner } from '../../../types/models';
import { countPendingStates, describeSignerRoles, pendingRowState, quickFillPending, signerIssue } from './supervision-ui';

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

describe('ANA-REG-060: captura rápida', () => {
  const item = (item_id: number, position_na = false) => ({ item_id, position_na }) as SupervisionChecklistSection['items'][number];
  const sections = [{ section_code: 'A', section_title: 'A', section_order: 1, items: [item(1), item(2, true), item(3)] }] as SupervisionChecklistSection[];

  it('completa lo pendiente con SÍ y deja en N/A lo que no aplica al puesto', () => {
    expect(quickFillPending(sections, {})).toEqual({ 1: 'SI', 2: 'NA', 3: 'SI' });
  });

  it('nunca pisa lo que el supervisor ya calificó', () => {
    expect(quickFillPending(sections, { 1: { result: 'NO' }, 2: { result: 'SI' }, 3: { result: null } })).toEqual({ 3: 'SI' });
  });
});

describe('ANA-REG-060: estado en la bandeja de la Fase 6', () => {
  const row = (patch: Partial<Parameters<typeof pendingRowState>[0]> = {}) => ({
    draft_status: null,
    draft_checklist_id: null,
    evaluation_status: null,
    closed_count: 0,
    ...patch,
  });

  it('distingue cada estado', () => {
    expect(pendingRowState(row({ draft_status: 'PENDING_SIGNATURES', draft_checklist_id: 5 }))).toBe('IN_SIGNATURE');
    expect(pendingRowState(row({ draft_status: 'DRAFT', draft_checklist_id: 5 }))).toBe('DRAFT');
    expect(pendingRowState(row({ evaluation_status: 'passed', closed_count: 1 }))).toBe('PASSED');
    expect(pendingRowState(row({ evaluation_status: 'failed', closed_count: 1 }))).toBe('FAILED');
    expect(pendingRowState(row({ closed_count: 2 }))).toBe('INTERMEDIATE');
    expect(pendingRowState(row())).toBe('NO_LIST');
  });

  it('la lista en curso manda sobre el resultado previo', () => {
    expect(pendingRowState(row({ evaluation_status: 'passed', draft_status: 'DRAFT', draft_checklist_id: 9 }))).toBe('DRAFT');
  });

  it('cuenta solo los estados presentes', () => {
    const rows = [row({ draft_status: 'DRAFT', draft_checklist_id: 1 }), row({ draft_status: 'DRAFT', draft_checklist_id: 2 }), row()];
    expect(countPendingStates(rows)).toEqual({ DRAFT: 2, NO_LIST: 1 });
  });
});
