// Lista de verificacion de Supervision ANA-REG-060 (Fase 6 de Induccion y
// supervision de area). Espejo de los tipos del backend
// (rh-supervision-checklist.service.ts / rh-supervision-position.service.ts).

export type SupervisionResult = 'SI' | 'NO' | 'NA';
export type SupervisionConclusion = 'CONFORME' | 'CONFORME_CON_OBSERVACIONES' | 'REQUIERE_SEGUIMIENTO';
/** DRAFT -> (supervisor firma) SUPERVISOR_SIGNED -> (responsable del area avala) CLOSED. */
export type SupervisionChecklistStatus = 'DRAFT' | 'SUPERVISOR_SIGNED' | 'CLOSED';
export type SupervisionType = 'PROGRAMADA' | 'NO_PROGRAMADA';

export interface SupervisionFormItem {
  id: number;
  form_code: string;
  form_revision: number;
  section_code: string;
  section_title: string;
  section_order: number;
  item_no: number;
  item_text: string;
}

export interface SupervisionChecklistItem {
  item_id: number;
  section_code: string;
  section_title: string;
  section_order: number;
  item_no: number;
  item_text: string;
  result: SupervisionResult | null;
  observations: string | null;
  position_na: boolean;
}

export interface SupervisionChecklistSection {
  section_code: string;
  section_title: string;
  section_order: number;
  items: SupervisionChecklistItem[];
}

export interface SupervisionSummary {
  evaluated: number;
  compliant: number;
  non_compliant: number;
  not_applicable: number;
  pending: number;
  compliance_pct: number | null;
  conclusion: SupervisionConclusion | null;
  passed: boolean | null;
}

export interface SupervisionChecklistListRow {
  id: number;
  folio: string;
  status: SupervisionChecklistStatus;
  form_code: string;
  form_revision: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  position_id: number;
  position_code: string;
  position_name: string;
  enrollment_id: number | null;
  supervision_date: string;
  supervision_type: SupervisionType;
  area_name: string | null;
  employee_area: string | null;
  /** Area del proceso que rige el puesto evaluado (agrupa la firma por area). */
  process_area_code: string | null;
  process_area_name: string | null;
  branch_name: string | null;
  supervisor_name: string;
  area_responsible_name: string;
  /** Supervisor asignado a la inscripcion (colaborador x puesto). */
  supervisor_employee_id: number | null;
  /** Responsable configurado para el area del proceso del puesto. */
  area_responsible_employee_id: number | null;
  supervisor_signed_at: string | null;
  compliance_pct: number | null;
  conclusion: SupervisionConclusion | null;
  passed: boolean | null;
  is_final: boolean;
  items_pending: number;
  closed_at: string | null;
  document_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SupervisionChecklist extends SupervisionChecklistListRow {
  sgc_follow_up_required: boolean;
  sgc_reference: string | null;
  supervisor_comments: string | null;
  supervisor_user_id: string | null;
  employee_signed: boolean;
  summary: SupervisionSummary;
  sections: SupervisionChecklistSection[];
}

export interface SupervisionChecklistPage {
  rows: SupervisionChecklistListRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface SupervisionPendingRow {
  enrollment_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  /** Area del proceso que rige el puesto. */
  area: string | null;
  /** Seccion / departamento de la ficha del colaborador. */
  section: string | null;
  /** Supervisor / Auditor asignado a esta inscripcion. */
  supervisor_employee_id: number | null;
  supervisor_name: string | null;
  branch_name: string | null;
  position_id: number;
  position_code: string;
  position_name: string;
  activated_at: string | null;
  evaluation_status: string | null;
  evaluation_percentage: number | null;
  draft_checklist_id: number | null;
  closed_count: number;
  last_closed_pct: number | null;
  days_in_phase: number | null;
}

export interface SupervisionPracticalOutcome {
  captured: boolean;
  status: 'passed' | 'failed' | null;
  score: number | null;
  message: string;
}

export interface PositionSupervisionConfig {
  position_id: number;
  na_item_ids: number[];
}

export interface SupervisionAreaSignatory {
  /** Codigo del area del proceso (PRE, ANA, POS, ADM). */
  area_key: string;
  area_name: string;
  /** Colaborador que avala como Responsable del Area. */
  area_responsible_employee_id: number | null;
  area_responsible_name: string;
  positions: number;
  employees: number;
  phase6_pending: number;
  configured: boolean;
}

export interface SupervisionGenerateDraftsResult {
  created: number;
  already_had_list: number;
  failed: number;
  areas_without_signatories: string[];
  positions_without_area: string[];
  details: Array<{ enrollment_id: number; employee_name: string; position_code: string; checklist_id: number | null; message: string }>;
}
