import { Router } from 'express';
import {
  assignSupervisorController,
  cancelSignatureController,
  createSupervisionChecklistController,
  deleteSupervisionDraftController,
  generateSupervisionDraftsController,
  getPositionNaItemsController,
  getSupervisionChecklistController,
  getSupervisionChecklistPdfController,
  listSupervisionChecklistsController,
  listSupervisionFormItemsController,
  listSupervisionPendingController,
  retryCloseController,
  saveSupervisionResultsController,
  sendToSignatureController,
  setPositionNaItemsController,
  updateSupervisionChecklistController,
} from '../controllers/rh-supervision-checklist.controller';
import {
  getSignatoriesOverviewController,
  getUnitSignatoryImpactController,
  saveAreaSignatoriesController,
  saveUnitSignatoriesController,
} from '../controllers/rh-supervision-signatories.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  assignSupervisorSchema,
  createSupervisionChecklistSchema,
  generateDraftsSchema,
  saveSupervisionResultsSchema,
  sendToSignatureSchema,
  setPositionNaItemsSchema,
  updateSupervisionChecklistSchema,
} from '../schemas/rh-supervision-checklist.schema';
import { saveAreaSignatoriesSchema, saveUnitSignatoriesSchema } from '../schemas/rh-supervision-signatories.schema';

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
router.post('/pending/generate', validate(generateDraftsSchema), generateSupervisionDraftsController);
router.post('/pending/assign-supervisor', validate(assignSupervisorSchema), assignSupervisorController);
// Firmantes por area: responsable general (y suplente), responsables por unidad e impacto de un cambio.
router.get('/signatories', getSignatoriesOverviewController);
router.put('/signatories', validate(saveAreaSignatoriesSchema), saveAreaSignatoriesController);
router.get('/signatories/impact', getUnitSignatoryImpactController);
router.put('/signatories/units', validate(saveUnitSignatoriesSchema), saveUnitSignatoriesController);

router.get('/', listSupervisionChecklistsController);
router.post('/', validate(createSupervisionChecklistSchema), createSupervisionChecklistController);
router.get('/:id', getSupervisionChecklistController);
router.get('/:id/pdf', getSupervisionChecklistPdfController);
router.patch('/:id', validate(updateSupervisionChecklistSchema), updateSupervisionChecklistController);
router.put('/:id/results', validate(saveSupervisionResultsSchema), saveSupervisionResultsController);
router.post('/:id/send-to-signature', validate(sendToSignatureSchema), sendToSignatureController);
router.post('/:id/cancel-signature', cancelSignatureController);
router.post('/:id/close', retryCloseController);
router.delete('/:id', deleteSupervisionDraftController);

export default router;
