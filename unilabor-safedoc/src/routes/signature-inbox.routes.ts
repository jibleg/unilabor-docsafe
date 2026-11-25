import { Router } from 'express';
import {
  batchSignFromInboxController,
  countSignatureInboxController,
  getSignatureInboxDetailController,
  getSignatureInboxPdfController,
  listAllPendingController,
  listPendingSignersController,
  listSignatureInboxController,
  signFromInboxController,
} from '../controllers/signature-inbox.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { SIGN_ON_BEHALF_PERMISSION } from '../services/signature-inbox-on-behalf.service';
import { signatureInboxBatchSignSchema, signatureInboxSignSchema } from '../schemas/rh-supervision-checklist.schema';

/**
 * Buzon de firmas (ANA-REG-060, REH-REG-003 y REH-REG-008): solo sesion; el
 * controller exige que el usuario sea firmante de cada registro. :kind es
 * SUPERVISION, COMPETENCY_EVALUATION o ASSIGNMENT_LETTER. Con ?on_behalf_of y
 * el permiso de firma por imagen, operan sobre el buzon de otro firmante.
 * Montado en /api/my/signature-inbox.
 */
const router = Router();

router.use(verifyToken);

router.get('/', listSignatureInboxController);
// Antes de /:kind/:id.
router.get('/count', countSignatureInboxController);
router.get('/signers', requirePermission(SIGN_ON_BEHALF_PERMISSION), listPendingSignersController);
router.get('/all-pending', requirePermission(SIGN_ON_BEHALF_PERMISSION), listAllPendingController);
router.post('/batch-sign', validate(signatureInboxBatchSignSchema), batchSignFromInboxController);
router.get('/:kind/:id', getSignatureInboxDetailController);
router.get('/:kind/:id/pdf', getSignatureInboxPdfController);
router.post('/:kind/:id/sign', validate(signatureInboxSignSchema), signFromInboxController);

export default router;
