import { describe, expect, it } from 'vitest';
import {
  describeDocumentRoles,
  documentRolesOf,
  documentRolesToSign,
  documentSignerIssues,
  pendingDocumentRoles,
  type DocumentSignerCandidate,
  type DocumentSignerRole,
} from './rh-document-signature.rules';

const IDS: Record<DocumentSignerRole, number> = { EMPLOYEE: 30, EVALUATOR: 40, AREA: 20, RH: 50, DIRECTOR: 60 };

const signer = (role: DocumentSignerRole, patch: Partial<DocumentSignerCandidate> = {}): DocumentSignerCandidate => ({
  role,
  employee_id: IDS[role],
  name: `Persona ${role}`,
  is_active: true,
  has_user: true,
  ...patch,
});

const COMPETENCY_SIGNERS = (['EMPLOYEE', 'EVALUATOR', 'AREA', 'RH', 'DIRECTOR'] as DocumentSignerRole[]).map((role) => signer(role));
const LETTER_SIGNERS = (['EMPLOYEE', 'AREA', 'DIRECTOR'] as DocumentSignerRole[]).map((role) => signer(role));

describe('Fase 7: validacion de firmantes antes de enviar a firma', () => {
  it('REH-REG-003 con los cinco firmantes activos y con usuario se puede enviar', () => {
    expect(documentSignerIssues('COMPETENCY_EVALUATION', COMPETENCY_SIGNERS)).toEqual([]);
  });

  it('REH-REG-008 solo exige colaborador, coordinacion del area y Director General', () => {
    expect(documentSignerIssues('ASSIGNMENT_LETTER', LETTER_SIGNERS)).toEqual([]);
  });

  it('dice quien falta cuando no se eligio un firmante', () => {
    const signers = COMPETENCY_SIGNERS.map((item) => (item.role === 'RH' ? { ...item, employee_id: null, name: '' } : item));
    const issues = documentSignerIssues('COMPETENCY_EVALUATION', signers);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Coordinador de RH');
  });

  it('rechaza firmantes dados de baja o sin usuario (no podrian abrir su buzon)', () => {
    const signers = COMPETENCY_SIGNERS.map((item) =>
      item.role === 'DIRECTOR' ? { ...item, is_active: false } : item.role === 'AREA' ? { ...item, has_user: false } : item,
    );
    const issues = documentSignerIssues('COMPETENCY_EVALUATION', signers);
    expect(issues).toHaveLength(2);
    expect(issues.join(' ')).toContain('dado de baja');
    expect(issues.join(' ')).toContain('usuario de sistema');
  });

  it('el colaborador evaluado no puede ocupar otro rol de su propio registro', () => {
    const signers = LETTER_SIGNERS.map((item) => (item.role === 'AREA' ? { ...item, employee_id: IDS.EMPLOYEE } : item));
    expect(documentSignerIssues('ASSIGNMENT_LETTER', signers)[0]).toContain('propio colaborador');
  });
});

describe('Fase 7: roles por persona', () => {
  it('una persona puede ocupar varios roles y una sola firma los cubre', () => {
    // El coordinador del area tambien evalua (es el evaluador propuesto).
    const assignment = { ...IDS, EVALUATOR: IDS.AREA };
    expect(documentRolesOf('COMPETENCY_EVALUATION', assignment, IDS.AREA)).toEqual(['EVALUATOR', 'AREA']);
    expect(documentRolesToSign('COMPETENCY_EVALUATION', assignment, IDS.AREA, ['EVALUATOR'])).toEqual(['AREA']);
  });

  it('el Director firma en los dos registros con el mismo rol', () => {
    expect(documentRolesOf('COMPETENCY_EVALUATION', IDS, IDS.DIRECTOR)).toEqual(['DIRECTOR']);
    expect(documentRolesOf('ASSIGNMENT_LETTER', IDS, IDS.DIRECTOR)).toEqual(['DIRECTOR']);
  });

  it('RH no firma la carta de asignacion', () => {
    expect(documentRolesOf('ASSIGNMENT_LETTER', IDS, IDS.RH)).toEqual([]);
  });

  it('el registro se cierra cuando ya no quedan roles pendientes', () => {
    expect(pendingDocumentRoles('ASSIGNMENT_LETTER', ['EMPLOYEE', 'DIRECTOR'])).toEqual(['AREA']);
    expect(pendingDocumentRoles('ASSIGNMENT_LETTER', ['EMPLOYEE', 'AREA', 'DIRECTOR'])).toEqual([]);
  });

  it('describe los roles en texto', () => {
    expect(describeDocumentRoles(['EVALUATOR', 'AREA'])).toBe('Evaluador técnico y Coordinador del área');
    expect(describeDocumentRoles(['DIRECTOR'])).toBe('Director General');
  });
});
