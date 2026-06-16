import { toast } from 'react-toastify';
import type { ManagedUser, ModuleAccess, ModuleCode } from '../types/models';
import { normalizeRole } from '../utils/roles';

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
    name: 'Mesa de Ayuda',
    description: 'Gestión de activos, tickets y mantenimiento',
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

export const confirmAction = (title: string, description: string, confirmLabel: string): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;

    const settle = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    toast.warning(
      ({ closeToast }) => (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-brand-700)]">{title}</p>
          <p className="text-xs text-[var(--unilabor-neutral)]">{description}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-[rgba(0,65,106,0.12)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(191,212,230,0.28)]"
              onClick={() => {
                settle(false);
                closeToast();
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg border border-[rgba(0,65,106,0.14)] bg-[rgba(191,212,230,0.36)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-700)] transition hover:bg-[rgba(124,173,211,0.3)]"
              onClick={() => {
                settle(true);
                closeToast();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      {
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        onClose: () => settle(false),
      },
    );
  });
