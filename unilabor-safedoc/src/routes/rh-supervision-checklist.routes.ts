import { Router } from 'express';
import {
  closeSupervisionChecklistController,
  createSupervisionChecklistController,
  deleteSupervisionDraftController,
  getPositionNaItemsController,
  getSupervisionChecklistController,
  getSupervisionChecklistPdfController,
  listSupervisionChecklistsController,
  listSupervisionFormItemsController,
  listSupervisionPendingController,
  saveSupervisionResultsController,
  setPositionNaItemsController,
  updateSupervisionChecklistController,
} from '../controllers/rh-supervision-checklist.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  closeSupervisionChecklistSchema,
  createSupervisionChecklistSchema,
  saveSupervisionResultsSchema,
  setPositionNaItemsSchema,
  updateSupervisionChecklistSchema,
} from '../schemas/rh-supervision-checklist.schema';

/**
 * Rutas de la Lista de verificacion de Supervision ANA-REG-060 (Fase 6 de
 * Induccion y supervision de area). Montadas en /api/rh/supervision-checklists.
 */
const router = Router();

router.use(verifyToken, requirePermission('RH.SUPERVISION.MANAGE'));

// Catalogo, configuracion por puesto y bandeja: ANTES de /:id.
router.get('/items', listSupervisionFormItemsController);
router.get('/positions/:positionId/na-items', getPositionNaItemsController);
router.put('/positions/:positionId/na-items', validate(setPositionNaItemsSchema), setPositionNaItemsController);
router.get('/pending', listSupervisionPendingController);

router.get('/', listSupervisionChecklistsController);
router.post('/', validate(createSupervisionChecklistSchema), createSupervisionChecklistController);
router.get('/:id', getSupervisionChecklistController);
router.get('/:id/pdf', getSupervisionChecklistPdfController);
router.patch('/:id', validate(updateSupervisionChecklistSchema), updateSupervisionChecklistController);
router.put('/:id/results', validate(saveSupervisionResultsSchema), saveSupervisionResultsController);
router.post('/:id/close', validate(closeSupervisionChecklistSchema), closeSupervisionChecklistController);
router.delete('/:id', deleteSupervisionDraftController);

export default router;
