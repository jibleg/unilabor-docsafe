import { Router } from 'express';
import {
  createDocumentSectionController,
  createDocumentTypeController,
  deleteDocumentSectionController,
  deleteDocumentTypeController,
  listDocumentSectionsController,
  listDocumentTypesController,
  updateDocumentSectionController,
  updateDocumentTypeController,
} from '../controllers/document-structure.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createDocumentSectionSchema,
  createDocumentTypeSchema,
  updateDocumentSectionSchema,
  updateDocumentTypeSchema,
} from '../schemas/document-structure.schema';

const router = Router();

router.use(verifyToken, requirePermission('RH.DOC_STRUCTURE.MANAGE'));

router.get('/sections', listDocumentSectionsController);
router.post('/sections', validate(createDocumentSectionSchema), createDocumentSectionController);
router.patch('/sections/:id', validate(updateDocumentSectionSchema), updateDocumentSectionController);
router.delete('/sections/:id', deleteDocumentSectionController);

router.get('/types', listDocumentTypesController);
router.post('/types', validate(createDocumentTypeSchema), createDocumentTypeController);
router.patch('/types/:id', validate(updateDocumentTypeSchema), updateDocumentTypeController);
router.delete('/types/:id', deleteDocumentTypeController);

export default router;
