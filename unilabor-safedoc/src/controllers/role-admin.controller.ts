import { Request, Response } from 'express';
import {
  RoleAdminError,
  createRole,
  deleteRole,
  getRoleDetail,
  getUserRoleIds,
  listPermissions,
  listRoles,
  setRolePermissions,
  setUserRoles,
  updateRole,
} from '../services/role-admin.service';

// Traduce errores del servicio (con status) a la respuesta HTTP; el resto -> 500.
const handleError = (res: Response, error: unknown, context: string) => {
  if (error instanceof RoleAdminError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(`${context}:`, error);
  return res.status(500).json({ message: 'Error interno del servidor' });
};

const parseId = (value: unknown): number | null => {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const paramString = (value: unknown): string =>
  Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');

export const listRolesController = async (_req: Request, res: Response) => {
  try {
    res.json({ roles: await listRoles() });
  } catch (error) {
    handleError(res, error, 'Error listando roles');
  }
};

export const listPermissionsController = async (_req: Request, res: Response) => {
  try {
    res.json({ permissions: await listPermissions() });
  } catch (error) {
    handleError(res, error, 'Error listando permisos');
  }
};

export const getRoleController = async (req: Request, res: Response) => {
  const roleId = parseId(req.params.id);
  if (roleId === null) {
    return res.status(400).json({ message: 'Id de rol invalido' });
  }
  try {
    res.json({ role: await getRoleDetail(roleId) });
  } catch (error) {
    handleError(res, error, 'Error obteniendo rol');
  }
};

export const createRoleController = async (req: Request, res: Response) => {
  try {
    const role = await createRole({
      code: req.body.code,
      name: req.body.name,
      description: req.body.description ?? null,
      moduleCode: req.body.module_code ?? null,
      permissionCodes: req.body.permission_codes ?? [],
    });
    res.status(201).json({ role });
  } catch (error) {
    handleError(res, error, 'Error creando rol');
  }
};

export const updateRoleController = async (req: Request, res: Response) => {
  const roleId = parseId(req.params.id);
  if (roleId === null) {
    return res.status(400).json({ message: 'Id de rol invalido' });
  }
  try {
    const role = await updateRole(roleId, {
      name: req.body.name,
      description: req.body.description,
      isActive: req.body.is_active,
    });
    res.json({ role });
  } catch (error) {
    handleError(res, error, 'Error actualizando rol');
  }
};

export const setRolePermissionsController = async (req: Request, res: Response) => {
  const roleId = parseId(req.params.id);
  if (roleId === null) {
    return res.status(400).json({ message: 'Id de rol invalido' });
  }
  try {
    const role = await setRolePermissions(roleId, req.body.permission_codes ?? []);
    res.json({ role });
  } catch (error) {
    handleError(res, error, 'Error actualizando permisos del rol');
  }
};

export const deleteRoleController = async (req: Request, res: Response) => {
  const roleId = parseId(req.params.id);
  if (roleId === null) {
    return res.status(400).json({ message: 'Id de rol invalido' });
  }
  try {
    await deleteRole(roleId);
    res.json({ message: 'Rol eliminado' });
  } catch (error) {
    handleError(res, error, 'Error eliminando rol');
  }
};

export const getUserRolesController = async (req: Request, res: Response) => {
  const userId = paramString(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: 'Id de usuario invalido' });
  }
  try {
    res.json({ role_ids: await getUserRoleIds(userId) });
  } catch (error) {
    handleError(res, error, 'Error obteniendo roles del usuario');
  }
};

export const setUserRolesController = async (req: Request, res: Response) => {
  const userId = paramString(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: 'Id de usuario invalido' });
  }
  try {
    const roleIds = await setUserRoles(userId, req.body.role_ids ?? []);
    res.json({ role_ids: roleIds });
  } catch (error) {
    handleError(res, error, 'Error asignando roles al usuario');
  }
};
