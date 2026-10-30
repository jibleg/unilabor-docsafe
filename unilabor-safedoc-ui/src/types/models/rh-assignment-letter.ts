/** Carta de asignacion de puesto REH-REG-008 (Fase 7, una por puesto). */
export type AssignmentLetterStatus = 'DRAFT' | 'CLOSED';

export interface AssignmentAuthorizationItem {
  id: number;
  item_no: number;
  item_text: string;
  /** Autorizaciones 1-8 del formato: aplican a todos y siempre van en Si. */
  applies_to_all: boolean;
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
  director_signatory_name: string;
  document_id: number | null;
  closed_at: string | null;
  created_at: string;
  items: AssignmentLetterItem[];
}

export interface AssignmentLetterListRow extends Omit<AssignmentLetter, 'items'> {
  authorized_count: number;
}
