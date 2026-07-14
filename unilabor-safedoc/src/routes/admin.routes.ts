import { Router } from 'express';
import {
  createRoleController,
  deleteRoleController,
  getRoleController,
  getUserRolesController,
  listPermissionsController,
  listRolesController,
  setRolePermissionsController,
  setUserRolesController,
  updateRoleController,
} from '../controllers/role-admin.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createRoleSchema,
  setRolePermissionsSchema,
  setUserRolesSchema,
  updateRoleSchema,
} from '../schemas/role-admin.schema';

const router = Router();

// Toda la administracion de roles/permisos requiere ADMIN.ROLES.MANAGE.
router.use(verifyToken, requirePermission('ADMIN.ROLES.MANAGE'));

// Catalogo de permisos (para armar la matriz de la UI)
router.get('/permissions', listPermissionsController);

// Roles
router.get('/roles', listRolesController);
router.post('/roles', validate(createRoleSchema), createRoleController);
router.get('/roles/:id', getRoleController);
router.patch('/roles/:id', validate(updateRoleSchema), updateRoleController);
router.put('/roles/:id/permissions', validate(setRolePermissionsSchema), setRolePermissionsController);
router.delete('/roles/:id', deleteRoleController);

// Asignacion de roles a usuarios (M:N)
router.get('/users/:id/roles', getUserRolesController);
router.put('/users/:id/roles', validate(setUserRolesSchema), setUserRolesController);

export default router;
