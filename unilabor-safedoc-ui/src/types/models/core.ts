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
  branch_id?: number | null;
  branch_name?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  linked_user?: LinkableUser | null;
}

export interface EmployeeBranch {
  id: number;
  name: string;
}

export interface EmployeeSummary {
  total: number;
  active: number;
  linked_users: number;
  unlinked_users: number;
}
