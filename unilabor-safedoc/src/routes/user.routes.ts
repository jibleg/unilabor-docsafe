import { Router } from 'express';
import {
  createUser,
  deleteUserById,
  getAllUsers,
  getModuleCatalog,
  getMyCategories,
  getUserCategoriesById,
  replaceUserCategoriesById,
  resetUserPasswordById,
  updateUserById,
} from '../controllers/user.controller';
import {
  deleteMyAvatar,
  getMyAvatar,
  getMyProfile,
  updatePassword,
  uploadMyAvatar,
} from '../controllers/profile.controller';
import { verifyToken, authorizeModuleAccess, authorizeModuleRole } from '../middlewares/auth.middleware';
import { uploadAvatar } from '../middlewares/upload.middleware';

const router = Router();

/**
 * ADMINISTRACIÓN DE USUARIOS
 * Solo accesible por el rol ADMIN
 */
router.get('/modules/catalog', verifyToken, authorizeModuleAccess('QUALITY'), authorizeModuleRole('QUALITY', ['ADMIN']), getModuleCatalog);
router.post('/', verifyToken, authorizeModuleAccess('QUALITY'), authorizeModuleRole('QUALITY', ['ADMIN']), createUser);
router.get('/', verifyToken, authorizeModuleAccess('QUALITY'), authorizeModuleRole('QUALITY', ['ADMIN', 'EDITOR']), getAllUsers);

/**
 * PERFIL PERSONAL
 * Accesible por cualquier usuario autenticado (ADMIN, EDITOR, VIEWER)
 */
router.patch('/change-password', verifyToken, updatePassword);
router.get('/me', verifyToken, getMyProfile);
router.get('/me/categories', verifyToken, authorizeModuleAccess('QUALITY'), getMyCategories);
router.patch('/me/avatar', verifyToken, uploadAvatar.single('avatar'), uploadMyAvatar);
router.get('/me/avatar', verifyToken, getMyAvatar);
router.delete('/me/avatar', verifyToken, deleteMyAvatar);

/**
 * ADMINISTRACION DE USUARIOS (POR ID)
 * Solo accesible por el rol ADMIN
 */
router.patch('/:id', verifyToken, authorizeModuleAccess('QUALITY'), authorizeModuleRole('QUALITY', ['ADMIN']), updateUserById);
router.delete('/:id', verifyToken, authorizeModuleAccess('QUALITY'), authorizeModuleRole('QUALITY', ['ADMIN']), deleteUserById);
router.patch('/:id/reset-password', verifyToken, authorizeModuleAccess('QUALITY'), authorizeModuleRole('QUALITY', ['ADMIN']), resetUserPasswordById);

/**
 * ASIGNACION DE CATEGORIAS A USUARIOS
 * ADMIN y EDITOR pueden administrar asignaciones
 */
router.get('/:id/categories', verifyToken, authorizeModuleAccess('QUALITY'), authorizeModuleRole('QUALITY', ['ADMIN', 'EDITOR']), getUserCategoriesById);
router.put('/:id/categories', verifyToken, authorizeModuleAccess('QUALITY'), authorizeModuleRole('QUALITY', ['ADMIN', 'EDITOR']), replaceUserCategoriesById);

export default router;
