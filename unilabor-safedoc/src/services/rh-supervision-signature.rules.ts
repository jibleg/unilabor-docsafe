// -----------------------------------------------------------------------------
// Reglas puras de la firma a distancia del ANA-REG-060 (Buzon de firmas) — sin
// BD, testeables.
//
// Firman tres roles, en cualquier orden porque la lista queda bloqueada al
// enviarse a firma: Supervisor / Auditor, Responsable del Area y Colaborador
// evaluado. Con las tres firmas vigentes la lista se cierra sola.
// -----------------------------------------------------------------------------

export type SupervisionSignerRole = 'SUPERVISOR' | 'AREA_RESPONSIBLE' | 'EMPLOYEE';

export const SUPERVISION_SIGNER_ROLES: SupervisionSignerRole[] = ['SUPERVISOR', 'AREA_RESPONSIBLE', 'EMPLOYEE'];

export const SUPERVISION_SIGNER_ROLE_LABELS: Record<SupervisionSignerRole, string> = {
  SUPERVISOR: 'Supervisor / Auditor',
  AREA_RESPONSIBLE: 'Responsable del Área',
  EMPLOYEE: 'Colaborador evaluado',
};

/** Un firmante de la lista con lo necesario para saber si puede firmar en su buzon. */
export interface SupervisionSignerCandidate {
  role: SupervisionSignerRole;
  employee_id: number | null;
  name: string;
  is_active: boolean;
  /** Tiene usuario de sistema vinculado y activo (sin el no puede abrir su buzon). */
  has_user: boolean;
}

/** Colaboradores que ocupan cada rol en una lista. */
export interface SupervisionSignerIds {
  employee_id: number;
  supervisor_employee_id: number | null;
  area_responsible_employee_id: number | null;
}

const HOW_TO_ASSIGN: Record<SupervisionSignerRole, string> = {
  SUPERVISOR: 'asígnalo en Pendientes Fase 6 (o elígelo en la lista si es una supervisión de área)',
  AREA_RESPONSIBLE: 'configúralo en Firmantes por área (o elígelo en la lista si es una supervisión de área)',
  EMPLOYEE: 'revisa el expediente del colaborador',
};

/**
 * Motivos por los que la lista NO puede enviarse a firma (vacio = se puede).
 * Cada motivo dice quien falta y que hacer, para que ninguna lista quede atorada.
 */
export const signerIssues = (signers: SupervisionSignerCandidate[]): string[] => {
  const issues: string[] = [];
  for (const role of SUPERVISION_SIGNER_ROLES) {
    const label = SUPERVISION_SIGNER_ROLE_LABELS[role];
    const signer = signers.find((candidate) => candidate.role === role);
    if (!signer || !signer.employee_id) {
      issues.push(`Falta el ${label}: ${HOW_TO_ASSIGN[role]}.`);
      continue;
    }
    const who = `${signer.name.trim() || 'El colaborador'} (${label})`;
    if (!signer.is_active) {
      issues.push(`${who} está dado de baja: asigna a otra persona.`);
    } else if (!signer.has_user) {
      issues.push(`${who} no tiene usuario de sistema vinculado: vincúlalo en su expediente para que pueda firmar en su Buzón de firmas.`);
    }
  }
  return issues;
};

/** Roles que todavia no tienen firma vigente. */
export const pendingSignerRoles = (signedRoles: SupervisionSignerRole[]): SupervisionSignerRole[] =>
  SUPERVISION_SIGNER_ROLES.filter((role) => !signedRoles.includes(role));

/** La lista se cierra sola solo si esta en firma y ya firmaron los tres roles. */
export const canAutoClose = (status: string, signedRoles: SupervisionSignerRole[]): boolean =>
  status === 'PENDING_SIGNATURES' && pendingSignerRoles(signedRoles).length === 0;

/** Roles que ocupa un colaborador en la lista (una persona puede ser supervisor y responsable del area). */
export const rolesOfEmployee = (ids: SupervisionSignerIds, employeeId: number): SupervisionSignerRole[] => {
  const roles: SupervisionSignerRole[] = [];
  if (ids.supervisor_employee_id === employeeId) roles.push('SUPERVISOR');
  if (ids.area_responsible_employee_id === employeeId) roles.push('AREA_RESPONSIBLE');
  if (ids.employee_id === employeeId) roles.push('EMPLOYEE');
  return roles;
};

/** Roles del colaborador que aun le falta firmar (vacio = no tiene nada pendiente en la lista). */
export const rolesToSign = (ids: SupervisionSignerIds, employeeId: number, signedRoles: SupervisionSignerRole[]): SupervisionSignerRole[] =>
  rolesOfEmployee(ids, employeeId).filter((role) => !signedRoles.includes(role));

/** "Supervisor / Auditor, Responsable del Área y Colaborador evaluado" para mensajes. */
export const describeRoles = (roles: SupervisionSignerRole[]): string => {
  const labels = roles.map((role) => SUPERVISION_SIGNER_ROLE_LABELS[role]);
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
};
