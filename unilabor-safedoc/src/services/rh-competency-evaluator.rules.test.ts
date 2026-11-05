import { describe, expect, it } from 'vitest';
import { findPhase6SupervisorConflict, isSamePerson, normalizePersonName, pickProposedEvaluator, type PersonIdentity } from './rh-competency-evaluator.rules';
import { listValidAreaResponsibles, type AreaResponsibleCandidate, type AreaSignatoryConfig } from './rh-supervision-area-responsible.rules';

const CIDE = 2;
const EVALUATED = 10;

const person = (employee_id: number, name: string, is_active = true): AreaResponsibleCandidate => ({ employee_id, name, is_active });
const identity = (employee_id: number | null, name: string): PersonIdentity => ({ employee_id, name });

const GENERAL = person(62, 'Flor General');
const ALTERNATE = person(64, 'Memo Suplente');
const CIDE_OWN = person(86, 'Víctor de CIDE');

const area = (patch: Partial<AreaSignatoryConfig> = {}): AreaSignatoryConfig => ({
  general: GENERAL,
  alternate: ALTERNATE,
  units: new Map([[CIDE, CIDE_OWN]]),
  ...patch,
});

const propose = (config: AreaSignatoryConfig | null, supervisors: PersonIdentity[], unitId: number | null = CIDE, evaluated = EVALUATED) =>
  pickProposedEvaluator(listValidAreaResponsibles(config, unitId, evaluated), supervisors);

describe('Evaluador de la Fase 7: comparacion de personas', () => {
  it('normaliza acentos, mayusculas y espacios', () => {
    expect(normalizePersonName('  Víctor   DE  Cide ')).toBe('victor de cide');
  });

  it('con colaborador en ambos lados manda el colaborador, no el nombre', () => {
    expect(isSamePerson(identity(86, 'Victor'), identity(86, 'Otro nombre'))).toBe(true);
    expect(isSamePerson(identity(86, 'Juan Perez'), identity(90, 'Juan Perez'))).toBe(false);
  });

  it('si falta el colaborador en algun lado compara el nombre normalizado', () => {
    expect(isSamePerson(identity(null, 'VICTOR DE CIDE'), identity(86, 'Víctor de CIDE'))).toBe(true);
    expect(isSamePerson(identity(86, 'Víctor de CIDE'), identity(null, 'victor  de cide'))).toBe(true);
    expect(isSamePerson(identity(null, 'Victor de Lomas'), identity(86, 'Víctor de CIDE'))).toBe(false);
  });

  it('un nombre vacio nunca coincide (evaluacion sin evaluador)', () => {
    expect(isSamePerson(identity(null, ''), identity(null, '  '))).toBe(false);
  });
});

describe('Evaluador de la Fase 7: no puede ser el supervisor de la Fase 6', () => {
  const supervisors = [identity(86, 'Víctor de CIDE')];

  it('rechaza al supervisor de la Fase 6 del puesto', () => {
    expect(findPhase6SupervisorConflict(identity(86, 'Víctor de CIDE'), supervisors)).toEqual(supervisors[0]);
  });

  it('acepta al coordinador del area y a cualquier otra persona', () => {
    expect(findPhase6SupervisorConflict(identity(62, 'Flor General'), supervisors)).toBeNull();
    expect(findPhase6SupervisorConflict(identity(null, 'Evaluador externo'), supervisors)).toBeNull();
  });

  it('evaluacion antigua sin colaborador: detecta al supervisor por nombre', () => {
    expect(findPhase6SupervisorConflict(identity(null, 'victor de cide'), supervisors)).not.toBeNull();
  });

  it('lista antigua con el supervisor solo en texto: detecta al evaluador por nombre', () => {
    expect(findPhase6SupervisorConflict(identity(86, 'Víctor de CIDE'), [identity(null, 'VICTOR DE CIDE')])).not.toBeNull();
  });

  it('considera a todos los supervisores que tuvo el puesto en la Fase 6', () => {
    const several = [identity(86, 'Víctor de CIDE'), identity(64, 'Memo Suplente')];
    expect(findPhase6SupervisorConflict(identity(64, 'Memo Suplente'), several)).toEqual(several[1]);
  });

  it('sin evaluador no hay conflicto', () => {
    expect(findPhase6SupervisorConflict(identity(null, ''), supervisors)).toBeNull();
  });

  it('sin supervisor registrado en la Fase 6 cualquier evaluador es valido', () => {
    expect(findPhase6SupervisorConflict(identity(86, 'Víctor de CIDE'), [])).toBeNull();
  });
});

describe('Evaluador propuesto al abrir la Fase 7: el coordinador del area', () => {
  it('propone al coordinador del area que resuelve la cadena (propio de la unidad)', () => {
    expect(propose(area(), [identity(99, 'Otro Supervisor')])).toEqual({ candidate: CIDE_OWN, source: 'UNIT' });
  });

  it('si el coordinador fue el supervisor de la Fase 6, toma el siguiente de la cadena', () => {
    expect(propose(area(), [identity(86, 'Víctor de CIDE')])).toEqual({ candidate: GENERAL, source: 'GENERAL' });
  });

  it('si la unidad y el general supervisaron, toma al suplente', () => {
    expect(propose(area(), [identity(86, 'Víctor de CIDE'), identity(62, 'Flor General')])).toEqual({ candidate: ALTERNATE, source: 'ALTERNATE' });
  });

  it('si toda la cadena superviso la Fase 6 no propone a nadie (se abre sin evaluador)', () => {
    const everyone = [identity(86, 'Víctor de CIDE'), identity(62, 'Flor General'), identity(64, 'Memo Suplente')];
    expect(propose(area(), everyone)).toBeNull();
  });

  it('nunca propone al propio evaluado ni a un colaborador dado de baja', () => {
    expect(propose(area(), [], CIDE, CIDE_OWN.employee_id)).toEqual({ candidate: GENERAL, source: 'GENERAL' });
    const inactive = area({ units: new Map([[CIDE, person(86, 'Víctor de CIDE', false)]]) });
    expect(propose(inactive, [])).toEqual({ candidate: GENERAL, source: 'GENERAL' });
  });

  it('excluye al supervisor registrado solo por nombre en una lista antigua', () => {
    expect(propose(area(), [identity(null, 'victor de cide')])).toEqual({ candidate: GENERAL, source: 'GENERAL' });
  });

  it('puesto sin area del proceso o sin responsables: no propone a nadie', () => {
    expect(propose(null, [])).toBeNull();
    expect(propose(area({ general: null, alternate: null, units: new Map() }), [])).toBeNull();
  });
});
