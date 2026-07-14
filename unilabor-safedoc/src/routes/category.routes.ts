import { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategories,
  updateCategory,
  updateCategoryStatus,
} from '../controllers/category.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
} from '../schemas/category.schema';

const router = Router();

// Consulta de catálogo paginado (autenticados)
router.get('/', verifyToken, requirePermission('QUALITY.CATEGORIES.READ'), listCategories);
router.get('/:id', verifyToken, requirePermission('QUALITY.CATEGORIES.READ'), getCategoryById);

// CRUD de catálogo (requiere escritura de categorías)
router.post('/', verifyToken, requirePermission('QUALITY.CATEGORIES.WRITE'), validate(createCategorySchema), createCategory);
router.patch('/:id', verifyToken, requirePermission('QUALITY.CATEGORIES.WRITE'), validate(updateCategorySchema), updateCategory);
router.patch('/:id/status', verifyToken, requirePermission('QUALITY.CATEGORIES.WRITE'), validate(updateCategoryStatusSchema), updateCategoryStatus);
router.delete('/:id', verifyToken, requirePermission('QUALITY.CATEGORIES.WRITE'), deleteCategory);

export default router;
