// Lista de verificacion de Supervision ANA-REG-060 (Fase 6 de Induccion y
// supervision de area). Espejo de los tipos del backend
// (rh-supervision-checklist.service.ts / rh-supervision-position.service.ts /
// rh-supervision-signature.service.ts).

export type SupervisionResult = 'SI' | 'NO' | 'NA';
export type SupervisionConclusion = 'CONFORME' | 'CONFORME_CON_OBSERVACIONES' | 'REQUIERE_SEGUIMIENTO';
/** DRAFT -> (se envia a firma) PENDING_SIGNATURES -> (firman los tres roles: cierre automatico) CLOSED. */
export type SupervisionChecklistStatus = 'DRAFT' | 'PENDING_SIGNATURES' | 'CLOSED';
export type SupervisionSignerRole = 'SUPERVISOR' | 'AREA_RESPONSIBLE' | 'EMPLOYEE';
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
  /** Envio a firma vigente (null en borrador). */
  signature_requested_at: string | null;
  signature_requested_by_name: string | null;
  /** Firmas vigentes recabadas (de 3). */
  signatures_done: number;
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

/** Firmante de la lista: quien ocupa el rol, si puede firmar en su buzon y si ya firmo. */
export interface SupervisionSigner {
  role: SupervisionSignerRole;
  employee_id: number | null;
  name: string;
  is_active: boolean;
  /** Tiene usuario de sistema vinculado y activo. */
  has_user: boolean;
  signed_at: string | null;
}

export interface SupervisionChecklist extends SupervisionChecklistListRow {
  signers: SupervisionSigner[];
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
  /** Lista en curso de la inscripcion: borrador o en firma. */
  draft_checklist_id: number | null;
  draft_status: 'DRAFT' | 'PENDING_SIGNATURES' | null;
  draft_signatures_done: number;
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

/** Colaborador configurado como responsable, con su estado vigente. */
export interface SignatoryPerson {
  employee_id: number;
  name: string;
  is_active: boolean;
  /** Tiene usuario de sistema vinculado y activo (sin el no puede firmar en su Buzon). */
  has_user: boolean;
  /** Unidad de su propia ficha (puede no ser la unidad que avala). */
  unit_id: number | null;
  unit_name: string | null;
}

/** Nivel de la cadena del que sale el Responsable del Area. */
export type AreaResponsibleSource = 'UNIT' | 'GENERAL' | 'ALTERNATE';

/** Responsable general de un area del proceso (respaldo de las unidades sin responsable propio). */
export interface SupervisionAreaSignatory {
  /** Codigo del area del proceso (PRE, ANA, POS, ADM). */
  area_key: string;
  area_name: string;
  area_responsible_employee_id: number | null;
  area_responsible_name: string;
  /** Suplente general: firma cuando el evaluado es el propio responsable general. */
  alternate_employee_id: number | null;
  alternate_name: string;
  responsible: SignatoryPerson | null;
  alternate: SignatoryPerson | null;
  positions: number;
  employees: number;
  phase6_pending: number;
  configured: boolean;
  /** Fase 6 (activa o en cola) del area donde el evaluado es el propio responsable general. */
  responsible_self_evaluations: number;
}

/** Una celda (unidad, area) de "Responsables por unidad". */
export interface SupervisionUnitAreaSignatory {
  area_key: string;
  area_name: string;
  employees: number;
  phase6_pending: number;
  drafts: number;
  in_signature: number;
  /** Responsable propio de la unidad (null = hereda del general). */
  own: SignatoryPerson | null;
  /** Quien firma hoy por esta unidad y area, y de que nivel sale. */
  effective: SignatoryPerson | null;
  effective_source: AreaResponsibleSource | null;
  /** Fase 6 (activa o en cola) de la celda donde el evaluado es el responsable efectivo. */
  effective_self_evaluations: number;
}

export interface SupervisionUnitSignatories {
  unit_id: number;
  unit_code: string;
  unit_name: string;
  employees: number;
  phase6_pending: number;
  areas: SupervisionUnitAreaSignatory[];
}

export interface SupervisionSignatoriesOverview {
  rows: SupervisionAreaSignatory[];
  units: SupervisionUnitSignatories[];
  /** Colaboradores activos sin sucursal en su ficha: usan siempre el responsable general. */
  employees_without_unit: number;
}

/** Efecto de dejar a un colaborador como responsable propio de una o varias unidades. */
export interface UnitSignatoryImpact {
  drafts_to_update: number;
  in_signature_unchanged: number;
  /** Fase 6 de esas unidades donde el evaluado es el propio candidato (ahi firma el general o su suplente). */
  candidate_self_evaluations: number;
}

export interface SupervisionGenerateDraftsResult {
  created: number;
  already_had_list: number;
  failed: number;
  areas_without_signatories: string[];
  positions_without_area: string[];
  details: Array<{ enrollment_id: number; employee_name: string; position_code: string; checklist_id: number | null; message: string }>;
}

/** Una lista en el Buzon de firmas del colaborador de la sesion. */
export interface SignatureInboxEntry {
  checklist_id: number;
  folio: string;
  status: SupervisionChecklistStatus;
  employee_name: string;
  employee_code: string;
  position_code: string;
  position_name: string;
  process_area_name: string | null;
  /** Unidad del colaborador evaluado. */
  branch_name: string | null;
  supervision_date: string;
  enrollment_id: number | null;
  is_final: boolean;
  /** Roles que ocupo en la lista y cuales me falta firmar. */
  my_roles: SupervisionSignerRole[];
  pending_roles: SupervisionSignerRole[];
  requested_at: string | null;
  requested_by_name: string | null;
  signatures_done: number;
  my_signed_at: string | null;
  closed_at: string | null;
}

export interface SignatureInbox {
  pending: SignatureInboxEntry[];
  signed: SignatureInboxEntry[];
}

export interface SignatureInboxDetail {
  checklist: SupervisionChecklist;
  my_roles: SupervisionSignerRole[];
  pending_roles: SupervisionSignerRole[];
}

export interface SignatureInboxSignResult {
  message: string;
  checklist: SupervisionChecklist;
  signed_roles: SupervisionSignerRole[];
  pending_roles: SupervisionSignerRole[];
  closed: boolean;
  practical: SupervisionPracticalOutcome | null;
  /** La firma quedo registrada pero la lista no pudo cerrarse sola. */
  close_error: string | null;
}
