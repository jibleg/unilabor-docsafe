import { Router } from 'express';
import {
  getEmployeeExpedientController,
  getEmployeeDocumentHistoryController,
  getMyExpedientController,
  listEmployeeDocumentsController,
  listMyDocumentsController,
  uploadEmployeeDocumentController,
  uploadMyDocumentController,
  viewEmployeeDocumentController,
} from '../controllers/employee-document.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';
import { upload as uploadMiddleware } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadEmployeeDocumentSchema } from '../schemas/employee.schema';

const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'));

router.get(
  '/employees/:id/expedient',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  getEmployeeExpedientController,
);

router.get('/me/expedient', authorizeModuleRole('RH', ['ADMIN', 'EDITOR', 'VIEWER']), getMyExpedientController);

router.get(
  '/employees/:id/documents',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  listEmployeeDocumentsController,
);

router.get(
  '/employees/:id/document-types/:documentTypeId/history',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  getEmployeeDocumentHistoryController,
);

router.get('/me/documents', authorizeModuleRole('RH', ['ADMIN', 'EDITOR', 'VIEWER']), listMyDocumentsController);

router.post(
  '/employees/:id/documents',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  uploadMiddleware.single('file'),
  validate(uploadEmployeeDocumentSchema),
  uploadEmployeeDocumentController,
);

router.post(
  '/me/documents',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR', 'VIEWER']),
  uploadMiddleware.single('file'),
  validate(uploadEmployeeDocumentSchema),
  uploadMyDocumentController,
);

router.get(
  '/documents/:documentId/view',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR', 'VIEWER']),
  viewEmployeeDocumentController,
);

export default router;
