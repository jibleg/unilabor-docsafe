export type ModuleCode = 'QUALITY' | 'RH' | 'HELPDESK' | 'ADMIN' | 'PROVIDERS';

export interface ModuleAccess {
  code: ModuleCode;
  name: string;
  description?: string | null;
  icon?: string | null;
  role: string;
  is_active: boolean;
  sort_order?: number;
}

export interface User {
  id: string;
  name?: string;
  full_name?: string;
  role: string;
  mustChangePassword: boolean;
  email?: string;
  avatar_path?: string;
  created_at?: string;
  updated_at?: string;
}

// --- Administracion RBAC (roles, permisos, asignaciones) ---
export interface RbacPermission {
  id: number;
  code: string;
  resource: string;
  action: string;
  description: string | null;
  module_code: string | null;
}

export interface RbacRoleSummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  module_code: string | null;
  is_system: boolean;
  is_active: boolean;
  permission_count: number;
  user_count: number;
}

export interface RbacRoleDetail extends RbacRoleSummary {
  permissions: string[];
}

export interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  must_change_password?: boolean;
  created_at?: string;
  updated_at?: string;
  modules?: ModuleAccess[];
}

export interface LinkableUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  modules: ModuleAccess[];
}

export interface Employee {
  id: number;
  employee_code: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  area?: string | null;
  position?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  linked_user?: LinkableUser | null;
}

export interface EmployeeSummary {
  total: number;
  active: number;
  linked_users: number;
  unlinked_users: number;
}

export interface HelpdeskCatalogItem {
  id: number;
  code?: string | null;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order?: number;
}

export interface HelpdeskAssetEmployee {
  id: number;
  employee_code: string;
  full_name: string;
  area?: string | null;
  position?: string | null;
}

export interface HelpdeskAsset {
  id: number;
  asset_code: string;
  name: string;
  description?: string | null;
  category_id?: number | null;
  unit_id?: number | null;
  area_id?: number | null;
  location_id?: number | null;
  brand_id?: number | null;
  brand_name?: string | null;
  model?: string | null;
  serial_number?: string | null;
  complementary_info?: string | null;
  purchase_modality_id?: number | null;
  purchase_condition_id?: number | null;
  assigned_employee_id?: number | null;
  responsible_employee_id?: number | null;
  criticality_id?: number | null;
  operational_status_id?: number | null;
  acquired_on?: string | null;
  warranty_expires_on?: string | null;
  inventory_legacy_code?: string | null;
  legacy_consecutive?: string | null;
  legacy_component_consecutive?: string | null;
  notes?: string | null;
  supplier_id?: number | null;
  received_on?: string | null;
  placed_in_service_on?: string | null;
  receipt_condition_id?: number | null;
  decommissioned_on?: string | null;
  disposal_reason_id?: number | null;
  asset_code_overridden?: boolean;
  // Revision de carga masiva (eje independiente del estado operativo).
  review_status?: 'PENDING' | 'REVIEWED';
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  category?: HelpdeskCatalogItem | null;
  unit?: HelpdeskCatalogItem | null;
  area?: HelpdeskCatalogItem | null;
  location?: HelpdeskCatalogItem | null;
  brand?: HelpdeskCatalogItem | null;
  purchase_modality?: HelpdeskCatalogItem | null;
  purchase_condition?: HelpdeskCatalogItem | null;
  criticality?: HelpdeskCatalogItem | null;
  operational_status?: HelpdeskCatalogItem | null;
  supplier?: HelpdeskCatalogItem | null;
  receipt_condition?: HelpdeskCatalogItem | null;
  disposal_reason?: HelpdeskCatalogItem | null;
  assigned_employee?: HelpdeskAssetEmployee | null;
  responsible_employee?: HelpdeskAssetEmployee | null;
  // Activos compuestos: parent_asset_id NULL = activo "todo" (o plano).
  parent_asset_id?: number | null;
  component_count?: number;
  parent?: { id: number; asset_code: string; name: string } | null;
  components?: HelpdeskAsset[];
}

export interface HelpdeskAssetSummary {
  assets: number;
  open_tickets: number;
  preventive_due: number;
  out_of_service: number;
  critical: number;
  assigned: number;
}

export interface HelpdeskTicketStats {
  total: number;
  open: number;
  critical: number;
  affects_results: number;
}

export interface DocumentStats {
  active: number;
  inactive: number;
  superseded: number;
  total: number;
}

export interface HelpdeskDashboardMetrics {
  tickets: {
    total: number;
    open: number;
    critical: number;
    overdue: number;
    solved: number;
    affects_results: number;
    risk_pending_release: number;
    avg_solution_hours?: number | null;
    avg_downtime_hours?: number | null;
  };
  maintenance: {
    scheduled: number;
    in_progress: number;
    overdue: number;
    closed: number;
    compliance_percent: number;
  };
  availability: Array<{
    code: string;
    name: string;
    total: number;
  }>;
  recurrences: Array<{
    asset_id: number;
    asset_code: string;
    asset_name: string;
    ticket_count: number;
  }>;
  by_area: Array<{
    area: string;
    ticket_count: number;
    maintenance_count: number;
  }>;
  audit_items: Array<{
    kind: string;
    code: string;
    asset_code?: string | null;
    asset_name?: string | null;
    status: string;
    risk_level?: string | null;
    event_at: string;
    owner?: string | null;
  }>;
}

export interface HelpdeskCatalogs {
  categories: HelpdeskCatalogItem[];
  units: HelpdeskCatalogItem[];
  areas: HelpdeskCatalogItem[];
  locations: HelpdeskCatalogItem[];
  brands: HelpdeskCatalogItem[];
  purchase_modalities: HelpdeskCatalogItem[];
  purchase_conditions: HelpdeskCatalogItem[];
  criticalities: HelpdeskCatalogItem[];
  operational_statuses: HelpdeskCatalogItem[];
  suppliers: HelpdeskCatalogItem[];
  receipt_conditions: HelpdeskCatalogItem[];
  disposal_reasons: HelpdeskCatalogItem[];
  document_kinds: HelpdeskCatalogItem[];
  lifecycle_event_types: HelpdeskCatalogItem[];
}

// --- Estructura organizacional (Unidad <-> Area <-> Responsables) ---
export interface HelpdeskOrgUnit {
  id: number;
  code?: string | null;
  name: string;
}

export interface HelpdeskOrgArea {
  id: number;
  code?: string | null;
  name: string;
  unit_ids: number[];
  responsible_user_ids: string[];
}

export interface HelpdeskOrgUser {
  id: string;
  full_name: string;
  email: string;
}

export interface HelpdeskOrgStructure {
  units: HelpdeskOrgUnit[];
  areas: HelpdeskOrgArea[];
  users: HelpdeskOrgUser[];
}

// --- Acta de entrega-recepcion de activos (ISO 15189:2022) ---
export type HelpdeskHandoverStatus = 'DRAFT' | 'SIGNED' | 'VOID';

export interface HelpdeskHandoverItem {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  brand_name?: string | null;
  model?: string | null;
  serial_number?: string | null;
  receipt_condition_id?: number | null;
  receipt_condition_name?: string | null;
  observations?: string | null;
}

export interface HelpdeskHandover {
  id: number;
  folio: string;
  unit_id: number;
  unit_name?: string | null;
  area_id: number;
  area_name?: string | null;
  delivered_by_user_id?: string | null;
  delivered_by_name: string;
  received_by_user_id?: string | null;
  received_by_name: string;
  handover_at?: string | null;
  status: HelpdeskHandoverStatus;
  void_reason?: string | null;
  notes?: string | null;
  has_document: boolean;
  item_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  items?: HelpdeskHandoverItem[];
}

export interface HelpdeskHandoverItemPayload {
  asset_id: number;
  receipt_condition_id?: number | null;
  observations?: string | null;
}

export interface HelpdeskHandoverPayload {
  unit_id: number;
  area_id: number;
  received_by_user_id: string;
  received_by_name: string;
  delivered_by_name: string;
  notes?: string | null;
  items: HelpdeskHandoverItemPayload[];
}

export interface HelpdeskHandoverSignPayload {
  deliverer_signature: string;
  receiver_signature: string;
  delivered_by_name?: string | null;
  received_by_name?: string | null;
  notes?: string | null;
}

// --- Movimientos del activo (cambio de unidad/area/categoria/responsable) ---
export interface HelpdeskAssetMovement {
  id: number;
  folio: string;
  asset_id: number;
  asset_name: string;
  movement_at?: string | null;
  reason?: string | null;
  from_unit_id?: number | null;
  from_unit_name?: string | null;
  to_unit_id?: number | null;
  to_unit_name?: string | null;
  from_area_id?: number | null;
  from_area_name?: string | null;
  to_area_id?: number | null;
  to_area_name?: string | null;
  from_category_id?: number | null;
  from_category_name?: string | null;
  to_category_id?: number | null;
  to_category_name?: string | null;
  from_asset_code?: string | null;
  to_asset_code?: string | null;
  code_changed: boolean;
  performed_by_user_id?: string | null;
  performed_by_name: string;
  responsible_user_id?: string | null;
  responsible_name: string;
  lifecycle_event_id?: number | null;
  created_at?: string | null;
}

export interface HelpdeskAssetMovementPayload {
  asset_id: number;
  to_unit_id?: number | null;
  to_area_id?: number | null;
  to_category_id?: number | null;
  reason: string;
  performed_by_name: string;
  performed_by_signature: string;
  responsible_user_id?: string | null;
  responsible_name: string;
  responsible_signature: string;
  include_components?: boolean;
}

export interface HelpdeskLifecycleEvent {
  id: number;
  asset_id: number;
  event_type_id: number;
  event_code: string;
  event_date: string | null;
  title: string;
  description?: string | null;
  maintenance_order_id?: number | null;
  ticket_id?: number | null;
  supplier_id?: number | null;
  performed_by_employee_id?: number | null;
  performed_by_provider?: string | null;
  cost?: number | null;
  currency?: string | null;
  calibration_certificate_no?: string | null;
  calibration_due_on?: string | null;
  disposal_reason_id?: number | null;
  from_location_id?: number | null;
  to_location_id?: number | null;
  notes?: string | null;
  generated_act_document_id?: number | null;
  event_type?: HelpdeskCatalogItem | null;
  supplier?: HelpdeskCatalogItem | null;
  disposal_reason?: HelpdeskCatalogItem | null;
  from_location?: HelpdeskCatalogItem | null;
  to_location?: HelpdeskCatalogItem | null;
  performed_by_employee?: { id: number; employee_code: string; full_name: string } | null;
}

export interface HelpdeskAssetDocument {
  id: number;
  asset_id: number;
  title: string;
  document_kind_id?: number | null;
  document_kind_code?: string | null;
  document_kind_name?: string | null;
  lifecycle_event_id?: number | null;
  file_size: number;
  mime_type: string;
  reference_key?: string | null;
  version: number;
  is_current: boolean;
  issued_on?: string | null;
  expires_on?: string | null;
  created_at?: string;
}

export interface HelpdeskAssetExpedient {
  asset: HelpdeskAsset;
  events: HelpdeskLifecycleEvent[];
  documents: HelpdeskAssetDocument[];
}

export interface HelpdeskLifecycleEventPayload {
  event_type_id: number;
  event_date: string;
  title: string;
  description?: string | null;
  maintenance_order_id?: number | null;
  ticket_id?: number | null;
  supplier_id?: number | null;
  performed_by_employee_id?: number | null;
  performed_by_provider?: string | null;
  cost?: number | null;
  currency?: string | null;
  calibration_certificate_no?: string | null;
  calibration_due_on?: string | null;
  disposal_reason_id?: number | null;
  from_location_id?: number | null;
  to_location_id?: number | null;
  notes?: string | null;
}

export interface HelpdeskTicketPriority extends HelpdeskCatalogItem {
  response_hours?: number | null;
}

export interface HelpdeskTicketStatus extends HelpdeskCatalogItem {
  is_closed: boolean;
}

export interface HelpdeskTicketCatalogs {
  request_types: HelpdeskCatalogItem[];
  ticket_statuses: HelpdeskTicketStatus[];
  ticket_priorities: HelpdeskTicketPriority[];
}

export interface HelpdeskTicketAsset {
  id: number;
  asset_code: string;
  name: string;
  operational_status_name?: string | null;
}

export interface HelpdeskTicketComment {
  id: number;
  ticket_id: number;
  comment: string;
  is_internal: boolean;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_at?: string;
}

export interface HelpdeskTicket {
  id: number;
  ticket_code: string;
  asset_id?: number | null;
  request_type_id?: number | null;
  status_id?: number | null;
  priority_id?: number | null;
  requester_user_id?: string | null;
  requester_employee_id?: number | null;
  assigned_employee_id?: number | null;
  title: string;
  description: string;
  operational_impact?: string | null;
  affects_results: boolean;
  reported_at?: string;
  due_at?: string | null;
  solved_at?: string | null;
  solution_summary?: string | null;
  return_to_operation_at?: string | null;
  validated_by_user_id?: string | null;
  validated_at?: string | null;
  downtime_minutes?: number | null;
  equipment_status_after_solution_id?: number | null;
  risk_level?: string;
  impact_evaluation?: string | null;
  recent_analysis_usage?: string | null;
  alternate_equipment_used?: boolean;
  alternate_equipment_notes?: string | null;
  corrective_action_required?: boolean;
  corrective_action_notes?: string | null;
  impact_evaluated_by_user_id?: string | null;
  impact_evaluated_at?: string | null;
  technical_release_required?: boolean;
  technical_release_summary?: string | null;
  technical_released_by_user_id?: string | null;
  technical_released_at?: string | null;
  quality_document_id?: string | null;
  operational_lock?: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  asset?: HelpdeskTicketAsset | null;
  request_type?: HelpdeskCatalogItem | null;
  status?: HelpdeskTicketStatus | null;
  priority?: HelpdeskTicketPriority | null;
  equipment_status_after_solution?: HelpdeskCatalogItem | null;
  requester_employee?: HelpdeskAssetEmployee | null;
  assigned_employee?: HelpdeskAssetEmployee | null;
  comments?: HelpdeskTicketComment[];
}

export interface HelpdeskMaintenanceFrequency extends HelpdeskCatalogItem {
  interval_months: number;
}

export interface HelpdeskMaintenanceCatalogs {
  frequencies: HelpdeskMaintenanceFrequency[];
}

export type HelpdeskCatalogAdminKey =
  | 'categories'
  | 'units'
  | 'areas'
  | 'locations'
  | 'brands'
  | 'suppliers'
  | 'purchase_modalities'
  | 'purchase_conditions'
  | 'criticalities'
  | 'operational_statuses'
  | 'request_types'
  | 'ticket_statuses'
  | 'ticket_priorities'
  | 'frequencies';

export interface HelpdeskCatalogAdminItem extends HelpdeskCatalogItem {
  is_closed?: boolean;
  response_hours?: number | null;
  interval_months?: number | null;
}

export interface HelpdeskCatalogAdminResponse {
  assets: {
    categories: HelpdeskCatalogAdminItem[];
    units: HelpdeskCatalogAdminItem[];
    areas: HelpdeskCatalogAdminItem[];
    locations: HelpdeskCatalogAdminItem[];
    brands: HelpdeskCatalogAdminItem[];
    suppliers: HelpdeskCatalogAdminItem[];
    purchase_modalities: HelpdeskCatalogAdminItem[];
    purchase_conditions: HelpdeskCatalogAdminItem[];
    criticalities: HelpdeskCatalogAdminItem[];
    operational_statuses: HelpdeskCatalogAdminItem[];
  };
  tickets: {
    request_types: HelpdeskCatalogAdminItem[];
    ticket_statuses: HelpdeskCatalogAdminItem[];
    ticket_priorities: HelpdeskCatalogAdminItem[];
  };
  maintenance: {
    frequencies: HelpdeskCatalogAdminItem[];
  };
}

export interface HelpdeskMaintenancePlanTask {
  id: number;
  task_text: string;
  is_required: boolean;
  sort_order: number;
}

export interface HelpdeskMaintenanceOrder {
  id: number;
  order_code: string;
  plan_id?: number;
  asset_id?: number;
  scheduled_for: string;
  window_starts_on?: string | null;
  window_ends_on?: string | null;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  performed_activities?: string | null;
  findings?: string | null;
  provider_name?: string | null;
  result?: string | null;
  evidence_notes?: string | null;
  rescheduled_from?: string | null;
  rescheduled_at?: string | null;
  reschedule_reason?: string | null;
  plan?: {
    id: number;
    plan_code: string;
    title: string;
    frequency_id?: number | null;
    interval_months?: number | null;
    tolerance_before_days: number;
    tolerance_after_days: number;
  } | null;
  asset?: HelpdeskTicketAsset | null;
  checklist?: HelpdeskMaintenanceOrderChecklistItem[];
}

export interface HelpdeskMaintenanceOrderChecklistItem {
  id: number;
  plan_task_id?: number | null;
  task_text: string;
  result: string;
  notes?: string | null;
  sort_order: number;
}

export interface HelpdeskMaintenancePlan {
  id: number;
  plan_code: string;
  asset_id: number;
  frequency_id?: number | null;
  responsible_employee_id?: number | null;
  quality_document_id?: string | null;
  title: string;
  description?: string | null;
  provider_name?: string | null;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days: number;
  tolerance_after_days: number;
  checklist_required: boolean;
  evidence_required: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  asset?: HelpdeskTicketAsset | null;
  frequency?: HelpdeskMaintenanceFrequency | null;
  responsible_employee?: HelpdeskAssetEmployee | null;
  quality_document?: {
    id: string;
    title: string;
    filename?: string | null;
  } | null;
  tasks: HelpdeskMaintenancePlanTask[];
  orders: HelpdeskMaintenanceOrder[];
}

// --- Calibracion (ISO 15189:2022, control metrologico 6.5) ---
export type HelpdeskScheduleMode = 'FREQUENCY' | 'CALENDAR';

export interface HelpdeskCalibrationCatalogs {
  frequencies: HelpdeskMaintenanceFrequency[];
}

export interface HelpdeskCalibrationOrder {
  id: number;
  order_code: string;
  plan_id?: number;
  asset_id?: number;
  scheduled_for: string;
  window_starts_on?: string | null;
  window_ends_on?: string | null;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  provider_name?: string | null;
  result?: string | null;
  certificate_no?: string | null;
  calibration_due_on?: string | null;
  findings?: string | null;
  evidence_notes?: string | null;
  lifecycle_event_id?: number | null;
  rescheduled_from?: string | null;
  rescheduled_at?: string | null;
  reschedule_reason?: string | null;
  plan?: {
    id: number;
    plan_code: string;
    title: string;
    schedule_mode: HelpdeskScheduleMode;
    frequency_id?: number | null;
    interval_months?: number | null;
    tolerance_before_days: number;
    tolerance_after_days: number;
  } | null;
  asset?: HelpdeskTicketAsset | null;
}

export interface HelpdeskCalibrationPlan {
  id: number;
  plan_code: string;
  asset_id: number;
  frequency_id?: number | null;
  schedule_mode: HelpdeskScheduleMode;
  responsible_employee_id?: number | null;
  quality_document_id?: string | null;
  title: string;
  description?: string | null;
  provider_name?: string | null;
  standard_ref?: string | null;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days: number;
  tolerance_after_days: number;
  certificate_required: boolean;
  evidence_required: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  asset?: HelpdeskTicketAsset | null;
  frequency?: HelpdeskMaintenanceFrequency | null;
  responsible_employee?: HelpdeskAssetEmployee | null;
  quality_document?: {
    id: string;
    title: string;
    filename?: string | null;
  } | null;
  orders: HelpdeskCalibrationOrder[];
}

export interface DocumentSection {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  is_system_defined: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentType {
  id: number;
  section_id: number;
  code?: string | null;
  name: string;
  description?: string | null;
  is_required: boolean;
  is_sensitive: boolean;
  has_expiry: boolean;
  is_system_defined: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  section?: DocumentSection | null;
}

export interface EmployeeDocument {
  id: number;
  employee_id: number;
  document_type_id: number;
  title: string;
  description?: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_user_id: string;
  issue_date?: string | null;
  expiry_date?: string | null;
  status: DocumentStatus;
  version: number;
  is_current: boolean;
  replaces_document_id?: number | null;
  reference_key?: string | null;
  created_at?: string;
  updated_at?: string;
  uploaded_by_name?: string | null;
  is_sensitive?: boolean;
  has_expiry?: boolean;
  expiry_status?: 'uploaded' | 'valid' | 'expiring' | 'expired';
}

export type ExpedientItemStatus = 'missing' | 'uploaded' | 'valid' | 'expiring' | 'expired';

export interface EmployeeExpedientSummary {
  total_types: number;
  required_types: number;
  uploaded_types: number;
  missing_types: number;
  completion_percent: number;
  expiring_count: number;
  expired_count: number;
}

export interface EmployeeExpedientItem {
  document_type: DocumentType;
  current_document?: EmployeeDocument | null;
  status: ExpedientItemStatus;
}

export interface EmployeeExpedientSection {
  section: DocumentSection;
  items: EmployeeExpedientItem[];
}

export interface EmployeeExpedient {
  employee: Employee;
  summary: EmployeeExpedientSummary;
  sections: EmployeeExpedientSection[];
}

export interface EmployeeDocumentAccessTypeItem {
  document_type: DocumentType;
  is_enabled: boolean;
}

export interface EmployeeDocumentAccessSection {
  section: DocumentSection;
  is_enabled: boolean;
  document_types: EmployeeDocumentAccessTypeItem[];
}

export interface EmployeeDocumentAccessMatrix {
  employee_id: number;
  sections: EmployeeDocumentAccessSection[];
  enabled_section_ids: number[];
  enabled_document_type_ids: number[];
}

export interface EmployeeDocumentAccessResponse {
  employee: Employee;
  access: EmployeeDocumentAccessMatrix;
}

export type EmployeeAlertState = 'missing' | 'expiring' | 'expired';

export interface EmployeeAlert {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  employee_email: string;
  area?: string | null;
  position?: string | null;
  state: EmployeeAlertState;
  section_id: number;
  section_name: string;
  document_type_id: number;
  document_type_name: string;
  document_id?: number;
  expiry_date?: string | null;
  days_remaining?: number | null;
}

export interface EmployeeAlertsSummary {
  missing: number;
  expiring: number;
  expired: number;
  total: number;
}

export type DocumentStatus = 'active' | 'inactive' | 'superseded';

export interface Document {
  id: string | number;
  title: string;
  filename: string;
  uploaded_by: string;
  created_at: string;
  description?: string;
  category_name?: string;
  category_id?: number | null;
  publish_date?: string;
  expiry_date?: string;
  updated_at?: string;
  path?: string;
  status: DocumentStatus;
  replaced_by_document_id?: string | number | null;
  replaces_document_id?: string | number | null;
}

export interface AuditLog {
  accessed_at: string;
  module_code?: ModuleCode;
  full_name: string;
  email: string;
  document: string | null;
  action: string;
  ip_address: string | null;
  employee_id?: number | null;
  employee_code?: string | null;
  employee_name?: string | null;
  document_id?: number | null;
  document_type_id?: number | null;
  document_type_name?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
}

export interface Category {
  id: number;
  name: string;
}

// --- Modulo de Evaluaciones de capacitacion y constancias (ISO 15189) ---

export type EvaluationQuestionType = 'single' | 'multiple' | 'boolean' | 'open';
export type EvaluationSelectionMode = 'all' | 'random';
export type EvaluationTemplateStatus = 'draft' | 'published';
// 'quiz': cuestionario que contesta el colaborador. 'practical': capacitacion
// presencial cuya calificacion captura RH directamente (sin cuestionario).
export type EvaluationType = 'quiz' | 'practical';

export interface TrainingCourse {
  id: number;
  code: string;
  title: string;
  description: string | null;
  certificate_validity_months: number;
  is_active: boolean;
  template_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface EvaluationQuestionOption {
  id?: number;
  text: string;
  is_correct: boolean;
  sort_order?: number;
}

export interface EvaluationQuestion {
  id?: number;
  template_id?: number;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  sort_order?: number;
  options: EvaluationQuestionOption[];
}

export interface EvaluationTemplate {
  id: number;
  training_course_id: number;
  title: string;
  instructions: string | null;
  evaluation_type: EvaluationType;
  passing_score: number;
  window_hours: number;
  selection_mode: EvaluationSelectionMode;
  random_count: number | null;
  status: EvaluationTemplateStatus;
  is_active: boolean;
  requires_manual_grading: boolean;
  question_count?: number;
  questions?: EvaluationQuestion[];
  created_at?: string;
  updated_at?: string;
}

export type EvaluationAssignmentStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'grading'
  | 'passed'
  | 'failed'
  | 'expired'
  | 'authorized_late';

export interface EvaluationTakingOption {
  id: number;
  text: string;
  sort_order: number;
}

export interface EvaluationTakingQuestion {
  id: number;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  sort_order: number;
  options: EvaluationTakingOption[];
}

export interface EvaluationTakingView {
  assignment: {
    id: number;
    status: EvaluationAssignmentStatus;
    deadline_at: string;
    started_at: string | null;
    template_title: string;
    course_title: string;
    instructions: string | null;
    passing_score: number;
    window_hours: number;
  };
  questions: EvaluationTakingQuestion[];
}

export interface EvaluationSubmitResult {
  assignment_id: number;
  status: EvaluationAssignmentStatus;
  score: number;
  max_score: number;
  percentage: number | null;
  passing_score: number;
  passed: boolean;
  requires_manual_grading: boolean;
  certificate_document_id?: number | null;
}

export interface CourseEvaluationSummary {
  course_id: number;
  course_title: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  in_progress: number;
  grading: number;
  expired: number;
  authorized_late: number;
  compliance_pct: number;
}

export interface EvaluationDashboard {
  totals: {
    total: number;
    passed: number;
    failed: number;
    in_progress: number;
    pending: number;
    grading: number;
    expired: number;
    compliance_pct: number;
  };
  courses: CourseEvaluationSummary[];
}

export interface TraceabilityRow {
  assignment_id: number;
  employee_name: string;
  employee_code: string;
  course_title: string;
  template_title: string;
  status: EvaluationAssignmentStatus;
  percentage: number | null;
  passing_score: number;
  submitted_at: string | null;
  graded_at: string | null;
  certificate_issue_date: string | null;
  certificate_expiry_date: string | null;
}

export interface NotificationLogEntry {
  id: number;
  channel: 'email' | 'sms';
  recipient: string;
  subject: string | null;
  body: string | null;
  template: string;
  assignment_id: number | null;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  sent_at: string;
  employee_name: string | null;
  course_title: string | null;
}

export interface CertificateSignature {
  id?: number;
  signatory_name: string;
  role: string | null;
  signature_image_path: string | null;
  sort_order?: number;
}

export interface CertificateTemplate {
  id: number | null;
  training_course_id: number;
  title_text: string;
  body_text: string;
  logo_path: string | null;
  orientation: 'landscape' | 'portrait';
  signatures: CertificateSignature[];
}

export interface OpenAnswerToGrade {
  question_id: number;
  text: string;
  points: number;
  text_answer: string | null;
  points_awarded: number;
}

export interface EvaluationGradingDetail {
  assignment: {
    id: number;
    status: EvaluationAssignmentStatus;
    employee_name: string;
    employee_code: string;
    course_title: string;
    template_title: string;
    passing_score: number;
    objective_score: number;
    max_score: number;
  };
  open_answers: OpenAnswerToGrade[];
}

export interface EvaluationResponseOption {
  id: number;
  text: string;
  is_correct: boolean;
  selected: boolean;
}

export interface EvaluationQuestionResponse {
  question_id: number;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  points_awarded: number;
  is_correct: boolean;
  answered: boolean;
  text_answer: string | null;
  options: EvaluationResponseOption[];
}

export interface EvaluationResponsesDetail {
  assignment: {
    id: number;
    employee_name: string;
    employee_code: string;
    course_title: string;
    template_title: string;
    status: EvaluationAssignmentStatus;
    score: number | null;
    max_score: number | null;
    percentage: number | null;
    passing_score: number;
    submitted_at: string | null;
    graded_at: string | null;
  };
  questions: EvaluationQuestionResponse[];
}

export interface EvaluationAssignment {
  id: number;
  template_id: number;
  employee_id: number;
  status: EvaluationAssignmentStatus;
  available_at: string;
  deadline_at: string;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  attempt_no: number;
  template_title?: string;
  course_id?: number;
  course_title?: string;
  passing_score?: number;
  window_hours?: number;
  question_count?: number;
  employee_name?: string;
  employee_code?: string;
  certificate_document_id?: number | null;
  late_requested_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// --- RH: acuse de lectura y firma autografa (RH-ACK) -------------------------

export type AcknowledgementStatus =
  | 'pending'
  | 'in_progress'
  | 'read'
  | 'signed'
  | 'expired'
  | 'cancelled';

export interface InstitutionalDocument {
  id: number;
  title: string;
  description: string | null;
  file_size: number;
  mime_type: string;
  sha256: string;
  pages_total: number;
  target_document_type_id: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  target_document_type_name?: string;
  uploaded_by_name?: string | null;
  acknowledgement_count?: number;
  signed_count?: number;
}

export interface DocumentAcknowledgement {
  id: number;
  institutional_document_id: number;
  employee_id: number;
  status: AcknowledgementStatus;
  available_at: string | null;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  /** Solo paginas que ya cumplieron la permanencia minima. */
  pages_seen: number[];
  pages_seen_count: number;
  active_seconds: number;
  min_seconds_per_page: number;
  current_page: number | null;
  current_page_seconds: number;
  signed_document_id: number | null;
  source_sha256: string | null;
  signed_sha256: string | null;
  created_at: string | null;
  document_title?: string;
  employee_name?: string;
  employee_code?: string | null;
}

// --- Sala de Lectura (Calidad) ----------------------------------------------
// El documento fuente es SIEMPRE un documento vigente del SGC; la publicacion
// sella su huella y numero de paginas al abrirse.

export type ReadingPublicationStatus = 'open' | 'closed';

export interface ReadingPublication {
  id: number;
  document_id: string;
  document_title: string;
  title_snapshot: string;
  source_sha256: string;
  pages_total: number;
  min_seconds_per_page: number;
  default_deadline_hours: number;
  instructions: string | null;
  status: ReadingPublicationStatus;
  published_by_user_id: string | null;
  published_by_name: string | null;
  published_at: string | null;
  closed_at: string | null;
  readers_total: number;
  readers_signed: number;
  readers_read: number;
  readers_in_progress: number;
  readers_expired: number;
}

export interface ReadingAssignment {
  id: number;
  publication_id: number;
  user_id: string;
  user_name: string;
  user_email: string;
  employee_id: number | null;
  employee_area: string | null;
  status: AcknowledgementStatus;
  assigned_at: string | null;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  pages_seen_count: number;
  min_seconds_per_page: number;
  active_seconds: number;
}

export interface AssignableArea {
  area: string;
  total: number;
}

/** Una lectura del SGC asignada a mí, tal como la ve el lector. */
export interface MyReading {
  id: number;
  publication_id: number;
  document_id: string;
  document_title: string;
  instructions: string | null;
  status: AcknowledgementStatus;
  deadline_at: string | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  pages_total: number;
  pages_seen: number[];
  pages_seen_count: number;
  min_seconds_per_page: number;
  active_seconds: number;
  current_page: number | null;
  has_signed_copy: boolean;
}

/** Publicación cuyo documento del SGC ya tiene una versión nueva vigente. */
export interface RepublishCandidate {
  publication_id: number;
  previous_document_id: string;
  previous_title: string;
  new_document_id: string;
  new_title: string;
  signed_readers: number;
  assigned_readers: number;
  closed_at: string | null;
}

// --- Modulo Proveedores: gestion documental de contratos/convenios ---------

// Mismo catalogo que ya alimenta el combo "Proveedor" de Activos
// (helpdesk_suppliers); Proveedores tiene su propia alta/edicion.
export interface ProviderSummary {
  id: number;
  name: string;
  description: string | null;
  rfc: string | null;
  contact: string | null;
  website: string | null;
  address_street: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  notes: string | null;
  is_active: boolean;
  classification_id: number | null;
}

export interface ProviderContact {
  id: number;
  provider_id: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface ProviderDocumentCategory {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export type ProviderDocumentStatus = 'active' | 'inactive' | 'superseded';

export interface ProviderDocument {
  id: number;
  provider_id: number;
  provider_name: string | null;
  category_id: number;
  category_name: string | null;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
  status: ProviderDocumentStatus;
  replaces_document_id: number | null;
  replaced_by_document_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderNotificationRecipient {
  id: number;
  user_id: string;
  full_name: string | null;
  email: string | null;
}

// --- Clasificacion: catalogo compartido entre Proveedores y Clientes -------
export type ClassificationType = 'PROVIDER' | 'CLIENT';

export interface Classification {
  id: number;
  type: ClassificationType;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// --- Modulo Clientes: mirror de Proveedores (mismo patron de vigencia) -----
export interface ClientSummary {
  id: number;
  name: string;
  description: string | null;
  rfc: string | null;
  contact: string | null;
  website: string | null;
  address_street: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  notes: string | null;
  is_active: boolean;
  classification_id: number | null;
}

export interface ClientContact {
  id: number;
  client_id: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface ClientDocumentCategory {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export type ClientDocumentStatus = 'active' | 'inactive' | 'superseded';

export interface ClientDocument {
  id: number;
  client_id: number;
  client_name: string | null;
  category_id: number;
  category_name: string | null;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
  status: ClientDocumentStatus;
  replaces_document_id: number | null;
  replaced_by_document_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClientNotificationRecipient {
  id: number;
  user_id: string;
  full_name: string | null;
  email: string | null;
}
