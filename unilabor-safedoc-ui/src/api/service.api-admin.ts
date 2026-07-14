import api from './axios';
import { asRecord, getArrayFromPayload, unwrapPayload } from './service.shared';
import type { RbacPermission, RbacRoleDetail, RbacRoleSummary } from '../types/models';

// -----------------------------------------------------------------------------
// API de administracion RBAC (/api/admin, gate ADMIN.ROLES.MANAGE).
// -----------------------------------------------------------------------------

const toRoleSummary = (value: unknown): RbacRoleSummary | null => {
  const row = asRecord(value);
  if (!row || row.id === undefined) {
    return null;
  }
  return {
    id: Number(row.id),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : null,
    module_code: row.module_code ? String(row.module_code) : null,
    is_system: Boolean(row.is_system),
    is_active: Boolean(row.is_active),
    permission_count: Number(row.permission_count ?? 0),
    user_count: Number(row.user_count ?? 0),
  };
};

const toRoleDetail = (value: unknown): RbacRoleDetail => {
  const summary = toRoleSummary(value);
  const row = asRecord(value) ?? {};
  if (!summary) {
    throw new Error('Respuesta de rol invalida');
  }
  return {
    ...summary,
    permissions: Array.isArray(row.permissions)
      ? row.permissions.map((code) => String(code).toUpperCase())
      : [],
  };
};

export const listRbacRoles = async (): Promise<RbacRoleSummary[]> => {
  const response = await api.get('/admin/roles');
  return getArrayFromPayload(response.data, ['roles', 'items', 'results'])
    .map(toRoleSummary)
    .filter((role): role is RbacRoleSummary => role !== null);
};

export const getRbacRole = async (roleId: number): Promise<RbacRoleDetail> => {
  const response = await api.get(`/admin/roles/${roleId}`);
  return toRoleDetail(asRecord(unwrapPayload(response.data))?.role ?? unwrapPayload(response.data));
};

export const listRbacPermissions = async (): Promise<RbacPermission[]> => {
  const response = await api.get('/admin/permissions');
  return getArrayFromPayload(response.data, ['permissions', 'items', 'results'])
    .map((value) => {
      const row = asRecord(value);
      if (!row || row.id === undefined) {
        return null;
      }
      return {
        id: Number(row.id),
        code: String(row.code ?? ''),
        resource: String(row.resource ?? ''),
        action: String(row.action ?? ''),
        description: row.description ? String(row.description) : null,
        module_code: row.module_code ? String(row.module_code) : null,
      };
    })
    .filter((permission): permission is RbacPermission => permission !== null);
};

export const createRbacRole = async (payload: {
  code: string;
  name: string;
  description?: string;
  module_code?: string;
  permission_codes: string[];
}): Promise<RbacRoleDetail> => {
  const response = await api.post('/admin/roles', payload);
  return toRoleDetail(asRecord(unwrapPayload(response.data))?.role ?? unwrapPayload(response.data));
};

export const updateRbacRole = async (
  roleId: number,
  payload: { name?: string; description?: string | null; is_active?: boolean },
): Promise<RbacRoleDetail> => {
  const response = await api.patch(`/admin/roles/${roleId}`, payload);
  return toRoleDetail(asRecord(unwrapPayload(response.data))?.role ?? unwrapPayload(response.data));
};

export const setRbacRolePermissions = async (
  roleId: number,
  permissionCodes: string[],
): Promise<RbacRoleDetail> => {
  const response = await api.put(`/admin/roles/${roleId}/permissions`, {
    permission_codes: permissionCodes,
  });
  return toRoleDetail(asRecord(unwrapPayload(response.data))?.role ?? unwrapPayload(response.data));
};

export const deleteRbacRole = async (roleId: number): Promise<void> => {
  await api.delete(`/admin/roles/${roleId}`);
};

export const getRoleUserIds = async (roleId: number): Promise<string[]> => {
  const response = await api.get(`/admin/roles/${roleId}/users`);
  return getArrayFromPayload(response.data, ['user_ids', 'items', 'results']).map((id) => String(id));
};

export const setRoleUsers = async (roleId: number, userIds: string[]): Promise<string[]> => {
  const response = await api.put(`/admin/roles/${roleId}/users`, { user_ids: userIds });
  return getArrayFromPayload(response.data, ['user_ids', 'items', 'results']).map((id) => String(id));
};

export const getUserRoleIds = async (userId: string): Promise<number[]> => {
  const response = await api.get(`/admin/users/${encodeURIComponent(userId)}/roles`);
  return getArrayFromPayload(response.data, ['role_ids', 'items', 'results']).map((id) => Number(id));
};

export const setUserRoleIds = async (userId: string, roleIds: number[]): Promise<number[]> => {
  const response = await api.put(`/admin/users/${encodeURIComponent(userId)}/roles`, {
    role_ids: roleIds,
  });
  return getArrayFromPayload(response.data, ['role_ids', 'items', 'results']).map((id) => Number(id));
};
