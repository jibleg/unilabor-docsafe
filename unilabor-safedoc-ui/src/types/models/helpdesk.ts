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
  is_active?: boolean;
  /** Generado/referenciado por otro proceso: no editable ni eliminable desde el expediente. */
  is_system?: boolean;
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
  is_active?: boolean;
  /** Acta/constancia/documento de programa generado por el sistema: no editable ni eliminable. */
  is_protected?: boolean;
  created_at?: string;
}

export interface HelpdeskAssetDocumentMetadataPayload {
  title: string;
  document_kind_id?: number | null;
  lifecycle_event_id?: number | null;
  issued_on?: string | null;
  expires_on?: string | null;
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
  request_channel?: string;
  support_channel?: string | null;
  provider_id?: number | null;
  provider_name?: string | null;
  provider_contact?: string | null;
  onsite_responsible_employee_id?: number | null;
  call_at?: string | null;
  closed_at?: string | null;
  closed_by_user_id?: string | null;
  closure_notes?: string | null;
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
  cancellation_reason?: string | null;
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
  onsite_responsible_employee?: HelpdeskAssetEmployee | null;
  comments?: HelpdeskTicketComment[];
}

export interface HelpdeskTicketDocument {
  id: number;
  ticket_id: number;
  title: string;
  document_kind: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string | null;
  created_at?: string;
}

export interface HelpdeskTicketHistoryEntry {
  id: number;
  ticket_id: number;
  action: string;
  summary: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at?: string;
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
