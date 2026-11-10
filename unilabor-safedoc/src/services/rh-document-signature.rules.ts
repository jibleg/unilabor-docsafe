// -----------------------------------------------------------------------------
// Reglas puras de la firma a distancia de los registros de la Fase 7 (Buzon de
// firmas) — sin BD, testeables.
//
//   * REH-REG-003 Evaluacion de competencia: Colaborador evaluado, Evaluador
//     tecnico, Coordinador del area, Coordinador de RH y Director General.
//   * REH-REG-008 Carta de asignacion de puesto: Colaborador, Coordinacion del
//     area y Director General.
//
// Firman en cualquier orden porque el registro queda bloqueado al enviarse a
// firma. Una persona puede ocupar varios roles (p. ej. el coordinador del area
// que tambien evalua): una sola firma cubre todos. El colaborador evaluado
// nunca ocupa otro rol de su propio registro.
// -----------------------------------------------------------------------------

export type SignedDocumentKind = 'COMPETENCY_EVALUATION' | 'ASSIGNMENT_LETTER';

export type DocumentSignerRole = 'EMPLOYEE' | 'EVALUATOR' | 'AREA' | 'RH' | 'DIRECTOR';

export const SIGNED_DOCUMENT_KINDS: SignedDocumentKind[] = ['COMPETENCY_EVALUATION', 'ASSIGNMENT_LETTER'];

export const DOCUMENT_FORM_CODES: Record<SignedDocumentKind, string> = {
  COMPETENCY_EVALUATION: 'REH-REG-003',
  ASSIGNMENT_LETTER: 'REH-REG-008',
};

export const DOCUMENT_TITLES: Record<SignedDocumentKind, string> = {
  COMPETENCY_EVALUATION: 'Evaluación de competencia',
  ASSIGNMENT_LETTER: 'Carta de asignación de puesto',
};

/** Roles de cada registro, en el orden en que aparecen en el documento. */
export const DOCUMENT_SIGNER_ROLES: Record<SignedDocumentKind, DocumentSignerRole[]> = {
  COMPETENCY_EVALUATION: ['EMPLOYEE', 'EVALUATOR', 'AREA', 'RH', 'DIRECTOR'],
  ASSIGNMENT_LETTER: ['EMPLOYEE', 'AREA', 'DIRECTOR'],
};

export const DOCUMENT_SIGNER_ROLE_LABELS: Record<DocumentSignerRole, string> = {
  EMPLOYEE: 'Colaborador',
  EVALUATOR: 'Evaluador técnico',
  AREA: 'Coordinador del área',
  RH: 'Coordinador de RH',
  DIRECTOR: 'Director General',
};

/** Colaborador que ocupa cada rol (null = sin asignar). */
export type DocumentSignerAssignment = Partial<Record<DocumentSignerRole, number | null>>;

/** Un firmante con lo necesario para saber si podra firmar en su buzon. */
export interface DocumentSignerCandidate {
  role: DocumentSignerRole;
  employee_id: number | null;
  name: string;
  is_active: boolean;
  /** Tiene usuario de sistema vinculado y activo (sin el no puede abrir su buzon). */
  has_user: boolean;
}

const HOW_TO_ASSIGN: Record<DocumentSignerRole, string> = {
  EMPLOYEE: 'revisa el expediente del colaborador',
  EVALUATOR: 'elígelo de la lista de colaboradores en la cabecera de la evaluación',
  AREA: 'elígelo al enviar a firma',
  RH: 'elígelo al enviar a firma',
  DIRECTOR: 'elígelo al enviar a firma',
};

/**
 * Motivos por los que el registro NO puede enviarse a firma (vacio = se puede).
 * Cada motivo dice quien falta y que hacer, para que ningun registro quede
 * atorado en un buzon que nadie puede abrir.
 */
export const documentSignerIssues = (kind: SignedDocumentKind, signers: DocumentSignerCandidate[]): string[] => {
  const issues: string[] = [];
  const employeeId = signers.find((signer) => signer.role === 'EMPLOYEE')?.employee_id ?? null;
  for (const role of DOCUMENT_SIGNER_ROLES[kind]) {
    const label = DOCUMENT_SIGNER_ROLE_LABELS[role];
    const signer = signers.find((candidate) => candidate.role === role);
    if (!signer || !signer.employee_id) {
      issues.push(`Falta el ${label}: ${HOW_TO_ASSIGN[role]}.`);
      continue;
    }
    const who = `${signer.name.trim() || 'El colaborador'} (${label})`;
    if (role !== 'EMPLOYEE' && signer.employee_id === employeeId) {
      issues.push(`${who} es el propio colaborador: no puede firmar otro rol de su registro.`);
    } else if (!signer.is_active) {
      issues.push(`${who} está dado de baja: asigna a otra persona.`);
    } else if (!signer.has_user) {
      issues.push(`${who} no tiene usuario de sistema vinculado: vincúlalo en su expediente para que pueda firmar en su Buzón de firmas.`);
    }
  }
  return issues;
};

/** Roles del registro que todavia no tienen firma vigente. */
export const pendingDocumentRoles = (kind: SignedDocumentKind, signedRoles: DocumentSignerRole[]): DocumentSignerRole[] =>
  DOCUMENT_SIGNER_ROLES[kind].filter((role) => !signedRoles.includes(role));

/** Roles que ocupa un colaborador en el registro. */
export const documentRolesOf = (kind: SignedDocumentKind, assignment: DocumentSignerAssignment, employeeId: number): DocumentSignerRole[] =>
  DOCUMENT_SIGNER_ROLES[kind].filter((role) => assignment[role] === employeeId);

/** Roles del colaborador que aun le falta firmar (vacio = nada pendiente en este registro). */
export const documentRolesToSign = (
  kind: SignedDocumentKind,
  assignment: DocumentSignerAssignment,
  employeeId: number,
  signedRoles: DocumentSignerRole[],
): DocumentSignerRole[] => documentRolesOf(kind, assignment, employeeId).filter((role) => !signedRoles.includes(role));

/** "Evaluador técnico y Coordinador del área" para mensajes. */
export const describeDocumentRoles = (roles: DocumentSignerRole[]): string => {
  const labels = roles.map((role) => DOCUMENT_SIGNER_ROLE_LABELS[role]);
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
};
