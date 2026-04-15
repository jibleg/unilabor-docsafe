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
import { verifyToken, authorize } from '../middlewares/auth.middleware';
import { uploadAvatar } from '../middlewares/upload.middleware';

const router = Router();

/**
 * ADMINISTRACIÓN DE USUARIOS
 * Solo accesible por el rol ADMIN
 */
router.post('/', verifyToken, authorize(['ADMIN']), createUser);
router.get('/', verifyToken, authorize(['ADMIN', 'EDITOR']), getAllUsers);

/**
 * PERFIL PERSONAL
 * Accesible por cualquier usuario autenticado (ADMIN, EDITOR, VIEWER)
 */
router.patch('/change-password', verifyToken, updatePassword);
router.get('/me', verifyToken, getMyProfile);
router.get('/me/categories', verifyToken, getMyCategories);
router.patch('/me/avatar', verifyToken, uploadAvatar.single('avatar'), uploadMyAvatar);
router.get('/me/avatar', verifyToken, getMyAvatar);
router.delete('/me/avatar', verifyToken, deleteMyAvatar);

/**
 * ADMINISTRACION DE USUARIOS (POR ID)
 * Solo accesible por el rol ADMIN
 */
router.patch('/:id', verifyToken, authorize(['ADMIN']), updateUserById);
router.delete('/:id', verifyToken, authorize(['ADMIN']), deleteUserById);
router.patch('/:id/reset-password', verifyToken, authorize(['ADMIN']), resetUserPasswordById);

/**
 * ASIGNACION DE CATEGORIAS A USUARIOS
 * ADMIN y EDITOR pueden administrar asignaciones
 */
router.get('/:id/categories', verifyToken, authorize(['ADMIN', 'EDITOR']), getUserCategoriesById);
router.put('/:id/categories', verifyToken, authorize(['ADMIN', 'EDITOR']), replaceUserCategoriesById);

export default router;
