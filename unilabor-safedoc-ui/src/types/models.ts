export type ModuleCode = 'QUALITY' | 'RH';

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
