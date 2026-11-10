import type { DocumentSignerRole, DocumentSignerStatus } from '../../../types/models';

/** Etiquetas de los firmantes del REH-REG-003 y del REH-REG-008 (mismas que el backend). */
export const DOCUMENT_SIGNER_ROLE_LABELS: Record<DocumentSignerRole, string> = {
  EMPLOYEE: 'Colaborador',
  EVALUATOR: 'Evaluador técnico',
  AREA: 'Coordinador del área',
  RH: 'Coordinador de RH',
  DIRECTOR: 'Director General',
};

/** Por qué un firmante aún no puede firmar en su Buzón (null = listo). Misma regla que valida el backend al enviar. */
export const documentSignerIssue = (signer: DocumentSignerStatus): string | null => {
  if (!signer.employee_id) return 'Sin asignar';
  if (!signer.is_active) return 'Dado de baja';
  if (!signer.has_user) return 'Sin usuario vinculado';
  return null;
};

export const signedCount = (signers: DocumentSignerStatus[]): number => signers.filter((signer) => signer.signed_at).length;
