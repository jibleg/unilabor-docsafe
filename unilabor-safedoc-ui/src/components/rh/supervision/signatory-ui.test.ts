import { describe, expect, it } from 'vitest';
import type { SignatoryPerson, SupervisionAreaSignatory, SupervisionUnitAreaSignatory, SupervisionUnitSignatories } from '../../../types/models';
import { generalWarnings, hasStaff, ownCoverage, unitAreaWarnings } from './signatory-ui';

const CENTRO = 1;
const CIDE = 2;

const person = (patch: Partial<SignatoryPerson> = {}): SignatoryPerson => ({
  employee_id: 62,
  name: 'Flor General',
  is_active: true,
  has_user: true,
  unit_id: CENTRO,
  unit_name: 'UNILABOR CENTRO',
  ...patch,
});

const cell = (patch: Partial<SupervisionUnitAreaSignatory> = {}): SupervisionUnitAreaSignatory => ({
  area_key: 'PRE',
  area_name: 'PREANALÍTICA',
  employees: 5,
  phase6_pending: 2,
  drafts: 2,
  in_signature: 0,
  own: null,
  effective: person(),
  effective_source: 'GENERAL',
  effective_self_evaluations: 0,
  ...patch,
});

const general = (patch: Partial<SupervisionAreaSignatory> = {}): SupervisionAreaSignatory => ({
  area_key: 'PRE',
  area_name: 'PREANALÍTICA',
  area_responsible_employee_id: 62,
  area_responsible_name: 'Flor General',
  alternate_employee_id: null,
  alternate_name: '',
  responsible: person(),
  alternate: null,
  positions: 3,
  employees: 40,
  phase6_pending: 10,
  configured: true,
  responsible_self_evaluations: 0,
  ...patch,
});

describe('Firmantes por área: advertencias de una unidad', () => {
  it('un responsable de la misma unidad, con usuario y sin listas propias no advierte nada', () => {
    expect(unitAreaWarnings(CENTRO, cell())).toEqual([]);
  });

  it('avisa (informativo) cuando el responsable es de otra unidad', () => {
    const warnings = unitAreaWarnings(CIDE, cell());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.tone).toBe('info');
    expect(warnings[0]?.text).toContain('UNILABOR CENTRO');
  });

  it('un responsable sin usuario bloquea el envío a firma', () => {
    const warnings = unitAreaWarnings(CENTRO, cell({ effective: person({ has_user: false }) }));
    expect(warnings[0]?.tone).toBe('danger');
    expect(warnings[0]?.text).toContain('Sin usuario');
  });

  it('avisa en cuántas listas el responsable es el evaluado', () => {
    const warnings = unitAreaWarnings(CENTRO, cell({ effective_self_evaluations: 3 }));
    expect(warnings[0]?.text).toContain('3 listas');
  });

  it('el responsable propio dado de baja se reporta aunque ya firme el general', () => {
    const warnings = unitAreaWarnings(CENTRO, cell({ own: person({ employee_id: 90, name: 'Propio de Baja', is_active: false }) }));
    expect(warnings[0]?.text).toContain('Propio de Baja');
    expect(warnings[0]?.text).toContain('de baja');
  });

  it('sin responsable solo alarma si hay listas que no se podrán enviar', () => {
    const empty = { effective: null, effective_source: null };
    expect(unitAreaWarnings(CENTRO, cell(empty))[0]?.tone).toBe('danger');
    expect(unitAreaWarnings(CENTRO, cell({ ...empty, phase6_pending: 0, drafts: 0 }))).toEqual([]);
  });
});

describe('Firmantes por área: advertencias del responsable general', () => {
  it('sin suplente, el general evaluado en su propia área deja listas sin responsable', () => {
    const warnings = generalWarnings(general({ responsible_self_evaluations: 2 }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.tone).toBe('warning');
    expect(warnings[0]?.text).toContain('2 listas');
  });

  it('con suplente vigente solo informa que firma el suplente', () => {
    const warnings = generalWarnings(general({ responsible_self_evaluations: 1, alternate: person({ employee_id: 64, name: 'Memo Suplente' }) }));
    expect(warnings[0]?.tone).toBe('info');
    expect(warnings[0]?.text).toContain('1 lista de');
  });

  it('reporta al general o al suplente dados de baja o sin usuario', () => {
    const warnings = generalWarnings(general({ responsible: person({ is_active: false }), alternate: person({ employee_id: 64, name: 'Memo Suplente', has_user: false }) }));
    expect(warnings.map((warning) => warning.tone)).toEqual(['danger', 'danger']);
    expect(warnings[0]?.text).toContain('de baja');
    expect(warnings[1]?.text).toContain('no tiene usuario');
  });
});

describe('Firmantes por área: áreas visibles y cobertura de la unidad', () => {
  const unit: SupervisionUnitSignatories = {
    unit_id: CIDE,
    unit_code: 'B',
    unit_name: 'UNILABOR CIDE',
    employees: 23,
    phase6_pending: 21,
    areas: [
      cell({ area_key: 'PRE', own: person({ employee_id: 86, name: 'Victor de CIDE', unit_id: CIDE }) }),
      cell({ area_key: 'ANA' }),
      cell({ area_key: 'POS', employees: 0, phase6_pending: 0, drafts: 0 }),
      cell({ area_key: 'ADM', employees: 0, phase6_pending: 0, drafts: 0, own: person({ employee_id: 91, is_active: false }) }),
    ],
  };

  it('oculta por defecto las áreas sin personal, salvo que tengan un responsable propio que revisar', () => {
    expect(unit.areas.map(hasStaff)).toEqual([true, true, false, true]);
  });

  it('cuenta las áreas con responsable propio vigente entre las que tienen personal', () => {
    expect(ownCoverage(unit)).toEqual({ own: 1, total: 3 });
  });
});
