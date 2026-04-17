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
  full_name: string;
  email: string;
  document: string | null;
  action: string;
  ip_address: string;
}

export interface Category {
  id: number;
  name: string;
}
