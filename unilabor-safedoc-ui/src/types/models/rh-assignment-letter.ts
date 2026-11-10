/** Carta de asignacion de puesto REH-REG-008 (Fase 7, una por puesto). */
export type AssignmentLetterStatus = 'DRAFT' | 'CLOSED';

export interface AssignmentAuthorizationItem {
  id: number;
  item_no: number;
  item_text: string;
  /** Autorizaciones 1-8 del formato: aplican a todos y siempre van en Si. */
  applies_to_all: boolean;
  /** Etiqueta orientativa en pantalla (p. ej. CSI en 75-80). */
  scope_label: string | null;
  /** Seccion tematica para agrupar en pantalla. */
  group_order: number | null;
  group_label: string | null;
}

export interface AssignmentLetterItem extends AssignmentAuthorizationItem {
  authorized: boolean;
}

export interface AssignmentLetter {
  id: number;
  folio: string;
  form_code: string;
  form_revision: number;
  status: AssignmentLetterStatus;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  position_id: number;
  position_code: string;
  position_name: string;
  competency_evaluation_id: number | null;
  letter_date: string;
  area_name: string | null;
  position_description_name: string | null;
  other_authorizations: string | null;
  area_signatory_employee_id: number | null;
  area_signatory_name: string;
  director_signatory_employee_id: number | null;
  director_signatory_name: string;
  /** En firma: borrador bloqueado que espera las firmas del Buzón (sigue en DRAFT). */
  in_signature: boolean;
  signature_requested_at: string | null;
  signature_requested_by_name: string | null;
  document_id: number | null;
  closed_at: string | null;
  created_at: string;
  items: AssignmentLetterItem[];
}

/** Registros de la Fase 7 que se firman en el Buzón. */
export type SignedDocumentKind = 'COMPETENCY_EVALUATION' | 'ASSIGNMENT_LETTER';
export type DocumentSignerRole = 'EMPLOYEE' | 'EVALUATOR' | 'AREA' | 'RH' | 'DIRECTOR';

/** Un firmante del REH-REG-003 o del REH-REG-008 y su firma vigente. */
export interface DocumentSignerStatus {
  role: DocumentSignerRole;
  employee_id: number | null;
  name: string;
  is_active: boolean;
  has_user: boolean;
  signed_at: string | null;
}

export interface AssignmentLetterListRow extends Omit<AssignmentLetter, 'items'> {
  authorized_count: number;
}
