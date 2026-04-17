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
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'), authorizeModuleRole('RH', ['ADMIN', 'EDITOR']));

router.get('/sections', listDocumentSectionsController);
router.post('/sections', createDocumentSectionController);
router.patch('/sections/:id', updateDocumentSectionController);
router.delete('/sections/:id', deleteDocumentSectionController);

router.get('/types', listDocumentTypesController);
router.post('/types', createDocumentTypeController);
router.patch('/types/:id', updateDocumentTypeController);
router.delete('/types/:id', deleteDocumentTypeController);

export default router;
