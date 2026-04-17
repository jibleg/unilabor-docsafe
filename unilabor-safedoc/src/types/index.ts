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

export interface JWTPayload {
  id: string;
  role: UserRole;
  mustChangePassword: boolean;
}

// Esta es la interfaz que te está pidiendo el controlador
export interface AuthRequest extends Request {
  user?: JWTPayload;
}
