import { describe, expect, it } from 'vitest';
import {
  nextDraftAreaResponsible,
  resolveAreaResponsible,
  type AreaResponsibleCandidate,
  type AreaSignatoryConfig,
  type DraftAreaResponsible,
} from './rh-supervision-area-responsible.rules';

const CENTRO = 1;
const CIDE = 2;

const person = (employee_id: number, name: string, is_active = true): AreaResponsibleCandidate => ({ employee_id, name, is_active });

const GENERAL = person(62, 'Flor General');
const ALTERNATE = person(64, 'Memo Suplente');
const CIDE_OWN = person(86, 'Victor de CIDE');

const area = (patch: Partial<AreaSignatoryConfig> = {}): AreaSignatoryConfig => ({
  general: GENERAL,
  alternate: ALTERNATE,
  units: new Map([[CIDE, CIDE_OWN]]),
  ...patch,
});

describe('Responsable del Area: cadena unidad -> general -> suplente', () => {
  it('la unidad con responsable propio usa el suyo', () => {
    expect(resolveAreaResponsible(area(), CIDE, 10)).toEqual({ candidate: CIDE_OWN, source: 'UNIT' });
  });

  it('la unidad sin responsable propio hereda el general', () => {
    expect(resolveAreaResponsible(area(), CENTRO, 10)).toEqual({ candidate: GENERAL, source: 'GENERAL' });
  });

  it('un colaborador sin sucursal salta el nivel de unidad', () => {
    expect(resolveAreaResponsible(area(), null, 10)).toEqual({ candidate: GENERAL, source: 'GENERAL' });
  });

  it('un puesto sin area del proceso queda sin responsable', () => {
    expect(resolveAreaResponsible(undefined, CIDE, 10)).toBeNull();
    expect(resolveAreaResponsible(null, CIDE, 10)).toBeNull();
  });

  it('sin evaluado concreto (vista de configuracion) resuelve igual', () => {
    expect(resolveAreaResponsible(area(), CIDE, null)?.source).toBe('UNIT');
  });
});

describe('Responsable del Area: nadie avala su propia supervision', () => {
  it('si el evaluado es el responsable de su unidad, firma el general', () => {
    expect(resolveAreaResponsible(area(), CIDE, CIDE_OWN.employee_id)).toEqual({ candidate: GENERAL, source: 'GENERAL' });
  });

  it('si el evaluado es el general, firma el suplente', () => {
    expect(resolveAreaResponsible(area(), CENTRO, GENERAL.employee_id)).toEqual({ candidate: ALTERNATE, source: 'ALTERNATE' });
  });

  it('si el evaluado es el general y no hay suplente, queda vacio', () => {
    expect(resolveAreaResponsible(area({ alternate: null }), CENTRO, GENERAL.employee_id)).toBeNull();
  });

  it('si el evaluado ocupa todos los niveles, queda vacio', () => {
    const same = area({ alternate: GENERAL, units: new Map([[CIDE, GENERAL]]) });
    expect(resolveAreaResponsible(same, CIDE, GENERAL.employee_id)).toBeNull();
  });
});

describe('Responsable del Area: colaboradores dados de baja', () => {
  it('el responsable de la unidad dado de baja se salta y firma el general', () => {
    const config = area({ units: new Map([[CIDE, person(86, 'Victor de CIDE', false)]]) });
    expect(resolveAreaResponsible(config, CIDE, 10)).toEqual({ candidate: GENERAL, source: 'GENERAL' });
  });

  it('el general dado de baja se salta y firma el suplente', () => {
    const config = area({ general: person(62, 'Flor General', false) });
    expect(resolveAreaResponsible(config, CENTRO, 10)).toEqual({ candidate: ALTERNATE, source: 'ALTERNATE' });
  });

  it('con todos de baja queda vacio', () => {
    const config = area({ general: person(62, 'Flor General', false), alternate: person(64, 'Memo Suplente', false), units: new Map() });
    expect(resolveAreaResponsible(config, CENTRO, 10)).toBeNull();
  });

  it('un responsable sin usuario de sistema NO se salta (lo reporta el envio a firma)', () => {
    const withoutUser = { ...person(90, 'Sin Usuario'), has_user: false };
    const config: AreaSignatoryConfig<typeof withoutUser> = { general: { ...GENERAL, has_user: true }, alternate: null, units: new Map([[CIDE, withoutUser]]) };
    expect(resolveAreaResponsible(config, CIDE, 10)).toEqual({ candidate: withoutUser, source: 'UNIT' });
  });
});

describe('Responsable del Area: que queda en el borrador al sincronizar', () => {
  const current = (patch: Partial<DraftAreaResponsible> = {}): DraftAreaResponsible => ({ employee_id: 62, name: 'Flor General', source: 'GENERAL', ...patch });
  const unitResolved = { candidate: CIDE_OWN, source: 'UNIT' as const };

  it('Fase 6: toma siempre al resuelto', () => {
    expect(nextDraftAreaResponsible(current(), true, unitResolved)).toEqual({ employee_id: 86, name: 'Victor de CIDE', source: 'UNIT' });
  });

  it('Fase 6: si nadie es valido queda vacio (el envio a firma se bloquea)', () => {
    expect(nextDraftAreaResponsible(current(), true, null)).toEqual({ employee_id: null, name: '', source: null });
  });

  it('Fase 6: sin nadie resuelto conserva al elegido a mano para esa lista', () => {
    const manual = current({ employee_id: 99, name: 'Elegido a mano', source: 'MANUAL' });
    expect(nextDraftAreaResponsible(manual, true, null)).toBe(manual);
  });

  it('Fase 6: la configuracion manda sobre el elegido a mano', () => {
    const manual = current({ employee_id: 99, name: 'Elegido a mano', source: 'MANUAL' });
    expect(nextDraftAreaResponsible(manual, true, unitResolved).employee_id).toBe(86);
  });

  it('supervision de area: respeta al responsable elegido a mano en la lista', () => {
    const manual = current({ employee_id: 99, name: 'Elegido a mano', source: 'MANUAL' });
    expect(nextDraftAreaResponsible(manual, false, unitResolved)).toBe(manual);
  });

  it('supervision de area: sin eleccion manual toma al resuelto', () => {
    expect(nextDraftAreaResponsible(current({ employee_id: null, name: '', source: null }), false, unitResolved).employee_id).toBe(86);
  });

  it('supervision de area: si la configuracion no resuelve a nadie conserva lo que tenga', () => {
    const kept = current({ employee_id: null, name: 'Nombre capturado', source: null });
    expect(nextDraftAreaResponsible(kept, false, null)).toBe(kept);
  });
});
