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
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { upload as uploadMiddleware } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadEmployeeDocumentSchema } from '../schemas/employee.schema';

const router = Router();

router.use(verifyToken);

router.get(
  '/employees/:id/expedient',
  requirePermission('RH.EMPLOYEE_DOCS.READ'),
  getEmployeeExpedientController,
);

router.get('/me/expedient', requirePermission('RH.SELF.EXPEDIENT'), getMyExpedientController);

router.get(
  '/employees/:id/documents',
  requirePermission('RH.EMPLOYEE_DOCS.READ'),
  listEmployeeDocumentsController,
);

router.get(
  '/employees/:id/document-types/:documentTypeId/history',
  requirePermission('RH.EMPLOYEE_DOCS.READ'),
  getEmployeeDocumentHistoryController,
);

router.get('/me/documents', requirePermission('RH.SELF.EXPEDIENT'), listMyDocumentsController);

router.post(
  '/employees/:id/documents',
  requirePermission('RH.EMPLOYEE_DOCS.WRITE'),
  uploadMiddleware.single('file'),
  validate(uploadEmployeeDocumentSchema),
  uploadEmployeeDocumentController,
);

router.post(
  '/me/documents',
  requirePermission('RH.SELF.EXPEDIENT'),
  uploadMiddleware.single('file'),
  validate(uploadEmployeeDocumentSchema),
  uploadMyDocumentController,
);

router.get(
  '/documents/:documentId/view',
  requirePermission('RH.SELF.EXPEDIENT'),
  viewEmployeeDocumentController,
);

export default router;
