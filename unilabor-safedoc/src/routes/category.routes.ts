import { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategories,
  updateCategory,
  updateCategoryStatus,
} from '../controllers/category.controller';
import { authorize, authorizeModuleAccess, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
} from '../schemas/category.schema';

const router = Router();

// Consulta de catálogo paginado (autenticados)
router.get('/', verifyToken, authorizeModuleAccess('QUALITY'), listCategories);
router.get('/:id', verifyToken, authorizeModuleAccess('QUALITY'), getCategoryById);

// CRUD de catálogo (ADMIN y EDITOR)
router.post('/', verifyToken, authorizeModuleAccess('QUALITY'), authorize(['ADMIN', 'EDITOR']), validate(createCategorySchema), createCategory);
router.patch('/:id', verifyToken, authorizeModuleAccess('QUALITY'), authorize(['ADMIN', 'EDITOR']), validate(updateCategorySchema), updateCategory);
router.patch('/:id/status', verifyToken, authorizeModuleAccess('QUALITY'), authorize(['ADMIN', 'EDITOR']), validate(updateCategoryStatusSchema), updateCategoryStatus);
router.delete('/:id', verifyToken, authorizeModuleAccess('QUALITY'), authorize(['ADMIN', 'EDITOR']), deleteCategory);

export default router;
