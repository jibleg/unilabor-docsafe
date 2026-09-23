/** Tipos del Programa de Mantenimiento (Help Desk). Espejo de las respuestas del backend. */

export type MaintenanceServiceKind = 'PREVENTIVE' | 'VERIFICATION' | 'ELECTRICAL_SAFETY' | 'OTHER' | 'POST_REPAIR_VERIFICATION';
export type CalendarEventKind = MaintenanceServiceKind | 'CALIBRATION' | 'CORRECTIVE';
export type MaintenanceIntervalUnit = 'DAY' | 'WEEK' | 'MONTH';
export type MaintenanceAnchorMode = 'FIXED' | 'FLOATING';
export type MaintenanceExecutorKind = 'INTERNAL_OPERATOR' | 'INTERNAL_TECH' | 'EXTERNAL_PROVIDER';
export type MaintenanceProgramSourceKind = 'MANUFACTURER_MANUAL' | 'PROVIDER_PROGRAM' | 'SERVICE_CONTRACT' | 'INTERNAL';
export type WindowState = 'EARLY' | 'ON_TIME' | 'OVERDUE';
export type CalendarViewMode = 'month' | 'week' | 'agenda' | 'year';

export interface CalendarEventAsset {
  id: number;
  asset_code: string;
  name: string;
  category_name: string | null;
  unit_id: number | null;
  unit_name: string | null;
  area_id: number | null;
  area_name: string | null;
  criticality_code: string | null;
  criticality_name: string | null;
  responsible_employee_id: number | null;
  responsible_employee_name: string | null;
  assigned_employee_name: string | null;
  operational_status_name: string | null;
}

export interface CalendarEvent {
  id: string;
  source: 'maintenance' | 'calibration' | 'ticket';
  source_id: number;
  kind: CalendarEventKind;
  kind_label: string;
  code: string;
  title: string;
  date: string;
  window_starts_on: string | null;
  window_ends_on: string | null;
  status: string;
  window_state: WindowState | null;
  is_projected: boolean;
  asset: CalendarEventAsset;
  plan_code: string | null;
  plan_title: string | null;
  executor_kind: string | null;
  supplier_name: string | null;
  completed_at: string | null;
  result: string | null;
  ticket_id: number | null;
}

export interface CalendarSummary {
  total: number;
  overdue: number;
  due_soon: number;
  in_progress: number;
  pending_validation: number;
  closed_in_range: number;
  projected: number;
  compliance_pct: number | null;
}

export interface CalendarResponse {
  from: string;
  to: string;
  events: CalendarEvent[];
  summary: CalendarSummary;
}

export interface CalendarFilters {
  unit_id?: string;
  area_id?: string;
  responsible_employee_id?: string;
  responsible_user_id?: string;
  category_id?: string;
  criticality_id?: string;
  asset_id?: string;
  kind?: CalendarEventKind[];
  status?: string[];
  search?: string;
  mine?: boolean;
}

export interface ProgramKpis {
  from: string;
  to: string;
  compliance: { due: number; on_time: number; late: number; open_overdue: number; pct: number | null };
  overdue_by_criticality: Array<{ criticality: string; count: number }>;
  by_kind: Array<{ kind: string; scheduled: number; closed: number; overdue: number }>;
  downtime: { orders_avg_minutes: number | null; tickets_avg_minutes: number | null; tickets_total_minutes: number };
  pending_validation: number;
  external_services: { scheduled: number; closed: number; without_evidence: number };
  repeated_correctives: Array<{ asset_id: number; asset_code: string; name: string; tickets_6m: number; last_reported_at: string | null }>;
}

export interface CoverageGapAsset {
  id: number;
  asset_code: string;
  name: string;
  category_name: string | null;
  unit_name: string | null;
  area_name: string | null;
  criticality_name: string | null;
  responsible_employee_name: string | null;
}

export interface CoverageSummary {
  should_have: number;
  covered: number;
  gaps: number;
  coverage_pct: number | null;
  gap_assets: CoverageGapAsset[];
}

export interface MaintenanceOrderChecklistItem {
  id: number;
  plan_task_id: number | null;
  task_text: string;
  result: string;
  notes: string | null;
  sort_order: number;
}

export interface MaintenanceOrderDetail {
  id: number;
  order_code: string;
  plan_id: number | null;
  asset_id: number;
  scheduled_for: string;
  window_starts_on: string | null;
  window_ends_on: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
  performed_activities: string | null;
  findings: string | null;
  provider_name: string | null;
  result: string | null;
  evidence_notes: string | null;
  rescheduled_from: string | null;
  rescheduled_at: string | null;
  reschedule_reason: string | null;
  is_projected: boolean;
  program_version: number | null;
  service_kind: MaintenanceServiceKind;
  executor_kind: MaintenanceExecutorKind;
  checklist_required: boolean;
  evidence_required: boolean;
  requires_responsible_signature: boolean;
  window_state: WindowState | null;
  ticket_id: number | null;
  ticket_code: string | null;
  derived_ticket_id: number | null;
  derived_ticket_code: string | null;
  executed_by_employee_id: number | null;
  executed_by_employee_name: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  downtime_minutes: number | null;
  has_technician_signature: boolean;
  has_responsible_signature: boolean;
  validated_at: string | null;
  validated_by_user_id: string | null;
  lifecycle_event_id: number | null;
  constancia_document_id: number | null;
  plan: {
    id: number;
    plan_code: string;
    title: string;
    schedule_mode: 'FREQUENCY' | 'CALENDAR';
    frequency_id: number | null;
    interval_months: number | null;
    tolerance_before_days: number;
    tolerance_after_days: number;
    anchor_mode: MaintenanceAnchorMode;
  } | null;
  asset: CalendarEventAsset | null;
  checklist: MaintenanceOrderChecklistItem[];
}

export interface MaintenanceOrderEvidence {
  id: number;
  asset_id: number;
  title: string;
  document_kind_code: string | null;
  document_kind_name: string | null;
  file_size: number;
  mime_type: string;
  created_at?: string;
}

export interface OrderExecutionPayload {
  completed_at: string;
  performed_activities: string;
  result: string;
  findings?: string | null;
  provider_name?: string | null;
  supplier_id?: number | null;
  executed_by_employee_id?: number | null;
  downtime_minutes?: number | null;
  evidence_notes?: string | null;
  checklist?: Array<{ plan_task_id?: number | null; task_text: string; result: string; notes?: string | null }>;
  technician_signature?: string | null;
  responsible_signature?: string | null;
  open_corrective_ticket?: boolean;
  corrective_title?: string | null;
  corrective_description?: string | null;
}

export interface TemplateTask {
  id?: number | null;
  task_text: string;
  is_required: boolean;
  sort_order?: number;
}

export interface TemplateRoutine {
  id?: number | null;
  template_id?: number;
  service_kind: MaintenanceServiceKind;
  title: string;
  description: string | null;
  frequency_id: number | null;
  frequency_name?: string | null;
  interval_months?: number | null;
  custom_interval_value: number | null;
  custom_interval_unit: MaintenanceIntervalUnit | null;
  interval_label?: string;
  executor_kind: MaintenanceExecutorKind;
  window_before_days: number;
  window_after_days: number;
  checklist_required: boolean;
  evidence_required: boolean;
  sort_order?: number;
  tasks: TemplateTask[];
}

export interface MaintenanceTemplate {
  id: number;
  category_id: number | null;
  category_code: string | null;
  category_name: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  routines: TemplateRoutine[];
  assets_using: number;
  created_at?: string;
  updated_at?: string;
}

export interface MaintenanceTemplatePayload {
  category_id?: number | null;
  name: string;
  description?: string | null;
  routines: Array<Omit<TemplateRoutine, 'template_id' | 'frequency_name' | 'interval_months' | 'interval_label' | 'sort_order'>>;
}

export interface ProgramVersion {
  id: number;
  version: number;
  status: 'ACTIVE' | 'SUPERSEDED';
  template_id: number | null;
  template_name: string | null;
  source_kind: MaintenanceProgramSourceKind;
  source_document_id: string | null;
  source_document_title: string | null;
  source_asset_document_id: number | null;
  source_asset_document_title: string | null;
  source_reference: string | null;
  source_notes: string | null;
  effective_from: string;
  effective_to: string | null;
  change_reason: string | null;
  deviates_from_template: boolean;
  deviation_reason: string | null;
  projection_months: number;
  created_by_name: string | null;
  created_at?: string;
}

export interface RoutineOrderSummary {
  id: number;
  order_code: string;
  scheduled_for: string;
  window_starts_on: string | null;
  window_ends_on: string | null;
  status: string;
  is_projected: boolean;
  completed_at: string | null;
  result: string | null;
}

export interface ProgramRoutine {
  id: number;
  plan_code: string;
  program_id: number | null;
  template_routine_id: number | null;
  service_kind: MaintenanceServiceKind;
  title: string;
  description: string | null;
  schedule_mode: 'FREQUENCY' | 'CALENDAR';
  frequency_id: number | null;
  frequency_name: string | null;
  interval_months: number | null;
  custom_interval_value: number | null;
  custom_interval_unit: MaintenanceIntervalUnit | null;
  interval_label: string;
  anchor_mode: MaintenanceAnchorMode;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days: number;
  tolerance_after_days: number;
  recurrence_end_on: string | null;
  recurrence_max_occurrences: number | null;
  paused_at: string | null;
  pause_reason: string | null;
  executor_kind: MaintenanceExecutorKind;
  supplier_id: number | null;
  supplier_name: string | null;
  responsible_employee_id: number | null;
  responsible_employee_name: string | null;
  quality_document_id: string | null;
  quality_document_title: string | null;
  checklist_required: boolean;
  evidence_required: boolean;
  requires_responsible_signature: boolean;
  deviates_from_template: boolean;
  deviation_reason: string | null;
  is_active: boolean;
  tasks: Array<{ id: number; task_text: string; is_required: boolean; sort_order: number }>;
  next_order: RoutineOrderSummary | null;
  overdue_count: number;
  closed_count: number;
  projected_count: number;
  upcoming: RoutineOrderSummary[];
  history: RoutineOrderSummary[];
}

export interface RoutineInput {
  plan_id?: number | null;
  template_routine_id?: number | null;
  service_kind: MaintenanceServiceKind;
  title: string;
  description?: string | null;
  schedule_mode?: 'FREQUENCY' | 'CALENDAR';
  frequency_id?: number | null;
  custom_interval_value?: number | null;
  custom_interval_unit?: MaintenanceIntervalUnit | null;
  anchor_mode?: MaintenanceAnchorMode;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days?: number;
  tolerance_after_days?: number;
  recurrence_end_on?: string | null;
  recurrence_max_occurrences?: number | null;
  executor_kind: MaintenanceExecutorKind;
  supplier_id?: number | null;
  responsible_employee_id?: number | null;
  quality_document_id?: string | null;
  checklist_required?: boolean;
  evidence_required?: boolean;
  deviates_from_template?: boolean;
  deviation_reason?: string | null;
  tasks: Array<{ id?: number | null; task_text: string; is_required?: boolean }>;
}

export interface ProgramPayload {
  template_id?: number | null;
  source_kind: MaintenanceProgramSourceKind;
  source_document_id?: string | null;
  source_asset_document_id?: number | null;
  source_reference?: string | null;
  source_notes?: string | null;
  effective_from?: string | null;
  change_reason?: string | null;
  deviates_from_template?: boolean;
  deviation_reason?: string | null;
  projection_months?: number;
  routines: RoutineInput[];
}

export interface AssetProgramOverview {
  asset: {
    id: number;
    asset_code: string;
    name: string;
    category_id: number | null;
    category_name: string | null;
    criticality_code: string | null;
    criticality_name: string | null;
    unit_name: string | null;
    area_name: string | null;
    responsible_employee_name: string | null;
    assigned_employee_name: string | null;
    operational_status_name: string | null;
    brand_name: string | null;
    model: string | null;
    serial_number: string | null;
  };
  program: ProgramVersion | null;
  routines: ProgramRoutine[];
  versions: ProgramVersion[];
}
