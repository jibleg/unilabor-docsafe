import { Router } from 'express';
import {
  assignAcknowledgementsController,
  cancelAcknowledgementController,
  getAcknowledgementController,
  listAcknowledgementsController,
  listMyAcknowledgementsController,
  registerReadingProgressController,
  signAcknowledgementController,
} from '../controllers/rh-acknowledgement.controller';
import {
  createInstitutionalDocumentController,
  deactivateInstitutionalDocumentController,
  listInstitutionalDocumentsController,
  viewInstitutionalDocumentController,
} from '../controllers/rh-institutional-document.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { upload as uploadMiddleware } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  assignAcknowledgementSchema,
  createInstitutionalDocumentSchema,
  readingProgressSchema,
  signAcknowledgementSchema,
} from '../schemas/rh-acknowledgement.schema';

const router = Router();

router.use(verifyToken);

// --- RH: documentos institucionales -----------------------------------------
// El router se monta en /api/rh (ver index.ts), por eso las rutas no repiten
// el prefijo del modulo.
router.get(
  '/institutional-documents',
  requirePermission('RH.ACKNOWLEDGEMENTS.MANAGE'),
  listInstitutionalDocumentsController,
);

router.post(
  '/institutional-documents',
  requirePermission('RH.ACKNOWLEDGEMENTS.MANAGE'),
  uploadMiddleware.single('file'),
  validate(createInstitutionalDocumentSchema),
  createInstitutionalDocumentController,
);

router.delete(
  '/institutional-documents/:id',
  requirePermission('RH.ACKNOWLEDGEMENTS.MANAGE'),
  deactivateInstitutionalDocumentController,
);

// El lector necesita abrir el PDF; su acuse se valida al registrar progreso.
router.get(
  '/institutional-documents/:documentId/view',
  requirePermission('RH.SELF.ACKNOWLEDGEMENTS'),
  viewInstitutionalDocumentController,
);

// --- RH: solicitar y dar seguimiento ---------------------------------------
router.post(
  '/institutional-documents/:documentId/acknowledgements',
  requirePermission('RH.ACKNOWLEDGEMENTS.MANAGE'),
  validate(assignAcknowledgementSchema),
  assignAcknowledgementsController,
);

router.get(
  '/acknowledgements',
  requirePermission('RH.ACKNOWLEDGEMENTS.MANAGE'),
  listAcknowledgementsController,
);

router.delete(
  '/acknowledgements/:id',
  requirePermission('RH.ACKNOWLEDGEMENTS.MANAGE'),
  cancelAcknowledgementController,
);

// --- Autoservicio del colaborador ------------------------------------------
router.get(
  '/me/acknowledgements',
  requirePermission('RH.SELF.ACKNOWLEDGEMENTS'),
  listMyAcknowledgementsController,
);

router.get(
  '/me/acknowledgements/:id',
  requirePermission('RH.SELF.ACKNOWLEDGEMENTS'),
  getAcknowledgementController,
);

router.post(
  '/me/acknowledgements/:id/progress',
  requirePermission('RH.SELF.ACKNOWLEDGEMENTS'),
  validate(readingProgressSchema),
  registerReadingProgressController,
);

router.post(
  '/me/acknowledgements/:id/sign',
  requirePermission('RH.SELF.ACKNOWLEDGEMENTS'),
  validate(signAcknowledgementSchema),
  signAcknowledgementController,
);

export default router;
