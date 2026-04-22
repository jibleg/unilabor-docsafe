export type ModuleCode = 'QUALITY' | 'RH' | 'HELPDESK';

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
  assigned_employee?: HelpdeskAssetEmployee | null;
  responsible_employee?: HelpdeskAssetEmployee | null;
}

export interface HelpdeskAssetSummary {
  assets: number;
  open_tickets: number;
  preventive_due: number;
  out_of_service: number;
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
