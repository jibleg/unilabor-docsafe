import { Router } from 'express';
import {
  createUser,
  deleteUserById,
  getAllUsers,
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
import { verifyToken, requirePermission } from '../middlewares/auth.middleware';
import { uploadAvatar } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  changePasswordSchema,
  createUserSchema,
  replaceUserCategoriesSchema,
  resetUserPasswordSchema,
  updateUserSchema,
} from '../schemas/user.schema';

const router = Router();

/**
 * ADMINISTRACIÓN DE USUARIOS
 * Solo accesible por el rol ADMIN
 */
router.post('/', verifyToken, requirePermission('ADMIN.USERS.MANAGE'), validate(createUserSchema), createUser);
router.get('/', verifyToken, requirePermission('ADMIN.USERS.READ'), getAllUsers);

/**
 * PERFIL PERSONAL
 * Accesible por cualquier usuario autenticado (ADMIN, EDITOR, VIEWER)
 */
router.patch('/change-password', verifyToken, validate(changePasswordSchema), updatePassword);
router.get('/me', verifyToken, getMyProfile);
router.get('/me/categories', verifyToken, requirePermission('QUALITY.CATEGORIES.READ'), getMyCategories);
router.patch('/me/avatar', verifyToken, uploadAvatar.single('avatar'), uploadMyAvatar);
router.get('/me/avatar', verifyToken, getMyAvatar);
router.delete('/me/avatar', verifyToken, deleteMyAvatar);

/**
 * ADMINISTRACION DE USUARIOS (POR ID)
 * Solo accesible por el rol ADMIN
 */
router.patch('/:id', verifyToken, requirePermission('ADMIN.USERS.MANAGE'), validate(updateUserSchema), updateUserById);
router.delete('/:id', verifyToken, requirePermission('ADMIN.USERS.MANAGE'), deleteUserById);
router.patch('/:id/reset-password', verifyToken, requirePermission('ADMIN.USERS.MANAGE'), validate(resetUserPasswordSchema), resetUserPasswordById);

/**
 * ASIGNACION DE CATEGORIAS A USUARIOS
 * Parte de la administración de usuarios
 */
router.get('/:id/categories', verifyToken, requirePermission('ADMIN.USERS.READ'), getUserCategoriesById);
router.put('/:id/categories', verifyToken, requirePermission('ADMIN.USERS.MANAGE'), validate(replaceUserCategoriesSchema), replaceUserCategoriesById);

export default router;
