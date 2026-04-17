import { Router } from 'express';
import {
  getEmployeeExpedientController,
  listEmployeeDocumentsController,
  uploadEmployeeDocumentController,
  viewEmployeeDocumentController,
} from '../controllers/employee-document.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';
import { upload as uploadMiddleware } from '../middlewares/upload.middleware';

const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'));

router.get(
  '/employees/:id/expedient',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  getEmployeeExpedientController,
);

router.get(
  '/employees/:id/documents',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  listEmployeeDocumentsController,
);

router.post(
  '/employees/:id/documents',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  uploadMiddleware.single('file'),
  uploadEmployeeDocumentController,
);

router.get(
  '/documents/:documentId/view',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  viewEmployeeDocumentController,
);

export default router;
