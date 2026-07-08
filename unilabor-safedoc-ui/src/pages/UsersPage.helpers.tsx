import type { ManagedUser, ModuleAccess, ModuleCode } from '../types/models';
import { normalizeRole } from '../utils/roles';

// Re-export para compatibilidad: el confirm basado en toast vive en utils/confirm.
export { confirmAction } from '../utils/confirm';

export const PAGE_SIZE_OPTIONS = [5, 10, 20];

export const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Visualizador' },
] as const;

export type RoleValue = (typeof ROLE_OPTIONS)[number]['value'];

export interface UserFormState {
  full_name: string;
  email: string;
  role: RoleValue;
  categoryIds: number[];
  moduleCodes: ModuleCode[];
}

export const EMPTY_FORM: UserFormState = {
  full_name: '',
  email: '',
  role: 'VIEWER',
  categoryIds: [],
  moduleCodes: ['QUALITY'],
};

export const FALLBACK_MODULE_OPTIONS: ModuleAccess[] = [
  {
    code: 'QUALITY',
    name: 'Documentos de Calidad',
    description: 'Gestión documental institucional',
    icon: 'shield-check',
    role: 'ADMIN',
    is_active: true,
    sort_order: 10,
  },
  {
    code: 'RH',
    name: 'Recursos Humanos',
    description: 'Expediente digital del colaborador',
    icon: 'users',
    role: 'ADMIN',
    is_active: true,
    sort_order: 20,
  },
  {
    code: 'HELPDESK',
    name: 'Gestión de Activos y Soporte',
    description: 'Inventario ISO 15189, mantenimiento, calibración y mesa de ayuda',
    icon: 'life-buoy',
    role: 'ADMIN',
    is_active: true,
    sort_order: 30,
  },
];

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getRoleLabel = (role: string): string => {
  const normalizedRole = normalizeRole(role);
  const roleOption = ROLE_OPTIONS.find((option) => option.value === normalizedRole);
  return roleOption?.label ?? normalizedRole;
};

export const getRoleBadgeClassName = (role: string): string => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'ADMIN') {
    return 'border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] text-[var(--color-brand-700)]';
  }
  if (normalizedRole === 'EDITOR') {
    return 'border-[rgba(124,173,211,0.28)] bg-[rgba(191,212,230,0.34)] text-[var(--color-brand-700)]';
  }
  return 'border-[rgba(151,163,172,0.28)] bg-[rgba(151,163,172,0.16)] text-[var(--color-brand-700)]';
};

export const normalizeRoleValue = (role: string): RoleValue => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'ADMIN' || normalizedRole === 'EDITOR' || normalizedRole === 'VIEWER') {
    return normalizedRole;
  }
  return 'VIEWER';
};

export const sortUsers = (users: ManagedUser[]): ManagedUser[] =>
  [...users].sort((a, b) => a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' }));

