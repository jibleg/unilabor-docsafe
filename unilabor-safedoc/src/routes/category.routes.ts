import { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategories,
  updateCategory,
  updateCategoryStatus,
} from '../controllers/category.controller';
import { authorize, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

// Consulta de catálogo paginado (autenticados)
router.get('/', verifyToken, listCategories);
router.get('/:id', verifyToken, getCategoryById);

// CRUD de catálogo (ADMIN y EDITOR)
router.post('/', verifyToken, authorize(['ADMIN', 'EDITOR']), createCategory);
router.patch('/:id', verifyToken, authorize(['ADMIN', 'EDITOR']), updateCategory);
router.patch('/:id/status', verifyToken, authorize(['ADMIN', 'EDITOR']), updateCategoryStatus);
router.delete('/:id', verifyToken, authorize(['ADMIN', 'EDITOR']), deleteCategory);

export default router;

