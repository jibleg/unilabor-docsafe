import type {
  DocumentStatus,
  EmployeeAlertState,
  ModuleAccess,
  ModuleCode,
  User,
} from '../types/models';


export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  availableModules: ModuleAccess[];
}

export interface CreateUserPayload {
  email: string;
  full_name: string;
  role: string;
  category_ids?: number[];
  module_codes?: ModuleCode[];
}

export interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  role?: string;
  module_codes?: ModuleCode[];
}

export interface EmployeePayload {
  employee_code?: string;
  user_id?: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  area?: string;
  position?: string;
}

export interface HelpdeskAssetPayload {
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
}

export interface HelpdeskTicketPayload {
  asset_id?: number | null;
  request_type_id?: number | null;
  status_id?: number | null;
  priority_id?: number | null;
  requester_employee_id?: number | null;
  assigned_employee_id?: number | null;
  title: string;
  description: string;
  operational_impact?: string | null;
  affects_results?: boolean;
  due_at?: string | null;
}

export interface HelpdeskTicketSolutionPayload {
  solved_at: string;
  solution_summary: string;
  equipment_status_after_solution_id?: number | null;
}

export interface HelpdeskTicketReturnPayload {
  return_to_operation_at: string;
  equipment_status_after_solution_id?: number | null;
}

export interface HelpdeskTicketIsoRiskPayload {
  risk_level: string;
  impact_evaluation: string;
  recent_analysis_usage?: string | null;
  alternate_equipment_used?: boolean;
  alternate_equipment_notes?: string | null;
  corrective_action_required?: boolean;
  corrective_action_notes?: string | null;
  technical_release_required?: boolean;
  quality_document_id?: string | null;
  operational_lock?: boolean;
}

export interface HelpdeskTicketTechnicalReleasePayload {
  technical_release_summary: string;
  equipment_status_after_solution_id?: number | null;
}

export interface HelpdeskMaintenancePlanPayload {
  asset_id: number;
  frequency_id?: number | null;
  responsible_employee_id?: number | null;
  quality_document_id?: string | null;
  title: string;
  description?: string | null;
  provider_name?: string | null;
  starts_on: string;
  next_due_on: string;
  tolerance_before_days?: number;
  tolerance_after_days?: number;
  checklist_required?: boolean;
  evidence_required?: boolean;
  tasks?: string[];
}

export interface HelpdeskMaintenanceOrderChecklistPayload {
  plan_task_id?: number | null;
  task_text: string;
  result: string;
  notes?: string | null;
}

export interface HelpdeskMaintenanceOrderClosePayload {
  completed_at: string;
  performed_activities: string;
  result: string;
  findings?: string | null;
  provider_name?: string | null;
  evidence_notes?: string | null;
  checklist?: HelpdeskMaintenanceOrderChecklistPayload[];
}

export interface HelpdeskMaintenanceOrderReschedulePayload {
  scheduled_for: string;
  reschedule_reason: string;
}

export interface HelpdeskCatalogAdminPayload {
  code?: string | null;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  is_closed?: boolean | null;
  response_hours?: number | null;
  interval_months?: number | null;
}

export interface DocumentSectionPayload {
  code?: string;
  name: string;
  description?: string;
  is_active?: boolean;
  sort_order?: number;
}

export interface DocumentTypePayload {
  section_id: number;
  code?: string;
  name: string;
  description?: string;
  is_required?: boolean;
  is_sensitive?: boolean;
  has_expiry?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface EmployeeDocumentPayload {
  document_type_id: number;
  title: string;
  description?: string;
  issue_date?: string;
  expiry_date?: string;
  file: File;
}

export interface EmployeeDocumentAccessPayload {
  section_ids: number[];
  document_type_ids: number[];
}

export interface EmployeeAlertsFilters {
  employee_id?: number;
  area?: string;
  state?: EmployeeAlertState;
}

export interface UpdateDocumentPayload {
  title: string;
  category_id: string | number;
  description?: string;
  publish_date?: string;
  expiry_date?: string;
  file?: File | null;
  status?: Exclude<DocumentStatus, 'superseded'>;
}

export interface ListDocumentsOptions {
  includeInactive?: boolean;
  category_id?: number | null;
  title?: string;
  description?: string;
  publish_date?: string;
  expiry_date?: string;
}

export const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const getString = (
  source: Record<string, unknown>,
  keys: string[],
  fallback = '',
): string => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
};

export const getNumber = (
  source: Record<string, unknown>,
  keys: string[],
  fallback = 0,
): number => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
};

export const getBoolean = (
  source: Record<string, unknown>,
  keys: string[],
  fallback = false,
): boolean => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
  }
  return fallback;
};

export const getIdValue = (
  source: Record<string, unknown>,
  keys: string[],
): string | number | null => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

export const unwrapPayload = (payload: unknown): unknown => {
  const record = asRecord(payload);
  if (!record) {
    return payload;
  }
  if ('data' in record && record.data !== undefined && record.data !== null) {
    return record.data;
  }
  return payload;
};

export const getArrayFromPayload = (payload: unknown, keys: string[]): unknown[] => {
  const unwrapped = unwrapPayload(payload);
  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  const record = asRecord(unwrapped);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
};

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PageResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PageQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

export const extractPagination = (payload: unknown, fallbackCount: number): PaginationMeta => {
  const meta = asRecord(asRecord(payload)?.pagination);
  const total = (() => {
    const parsed = Number(meta?.total);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallbackCount;
  })();

  return {
    page: toPositiveInt(meta?.page, 1),
    limit: toPositiveInt(meta?.limit, fallbackCount || 1),
    total,
    totalPages: toPositiveInt(meta?.totalPages, 1),
  };
};

export const buildPageParams = (query: PageQuery): Record<string, string | number> => {
  const params: Record<string, string | number> = {};
  if (query.page) {
    params.page = query.page;
  }
  if (query.limit) {
    params.limit = query.limit;
  }
  const trimmedSearch = query.search?.trim();
  if (trimmedSearch) {
    params.search = trimmedSearch;
  }
  return params;
};
