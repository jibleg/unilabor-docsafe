// src/types/index.ts
import { Request } from 'express';

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type ModuleCode = 'QUALITY' | 'RH';

export interface ModuleAccess {
  code: ModuleCode;
  name: string;
  description?: string | null;
  icon?: string | null;
  role: UserRole;
  is_active: boolean;
  sort_order?: number;
}

export interface LinkableUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  modules: ModuleAccess[];
}

export interface EmployeeRecord {
  id: number;
  employee_code: string;
  user_id: string | null;
  full_name: string;
  email: string;
  area: string | null;
  position: string | null;
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

export interface DocumentSectionRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system_defined: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentTypeRecord {
  id: number;
  section_id: number;
  code: string | null;
  name: string;
  description: string | null;
  is_required: boolean;
  is_sensitive: boolean;
  has_expiry: boolean;
  is_system_defined: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  section?: DocumentSectionRecord | null;
}

export interface EmployeeDocumentRecord {
  id: number;
  employee_id: number;
  document_type_id: number;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_user_id: string;
  issue_date: string | null;
  expiry_date: string | null;
  status: 'active' | 'inactive' | 'superseded';
  version: number;
  is_current: boolean;
  replaces_document_id: number | null;
  created_at?: string;
  updated_at?: string;
  document_type?: DocumentTypeRecord | null;
  uploaded_by_name?: string | null;
}

export interface EmployeeExpedientSummary {
  total_types: number;
  required_types: number;
  uploaded_types: number;
  missing_types: number;
  completion_percent: number;
  expiring_count: number;
  expired_count: number;
}

export interface EmployeeExpedientTypeItem {
  document_type: DocumentTypeRecord;
  current_document: EmployeeDocumentRecord | null;
  status: 'missing' | 'uploaded' | 'valid' | 'expiring' | 'expired';
}

export interface EmployeeExpedientSection {
  section: DocumentSectionRecord;
  items: EmployeeExpedientTypeItem[];
}

export interface JWTPayload {
  id: string;
  role: UserRole;
  mustChangePassword: boolean;
}

// Esta es la interfaz que te está pidiendo el controlador
export interface AuthRequest extends Request {
  user?: JWTPayload;
}
