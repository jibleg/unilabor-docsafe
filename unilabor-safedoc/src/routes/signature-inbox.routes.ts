import { Router } from 'express';
import {
  batchSignFromInboxController,
  countSignatureInboxController,
  getSignatureInboxDetailController,
  getSignatureInboxPdfController,
  listSignatureInboxController,
  signFromInboxController,
} from '../controllers/signature-inbox.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { signatureInboxBatchSignSchema, signatureInboxSignSchema } from '../schemas/rh-supervision-checklist.schema';

/**
 * Buzon de firmas (ANA-REG-060, REH-REG-003 y REH-REG-008): solo sesion; el
 * controller exige que el usuario sea firmante de cada registro. :kind es
 * SUPERVISION, COMPETENCY_EVALUATION o ASSIGNMENT_LETTER. Montado en
 * /api/my/signature-inbox.
 */
const router = Router();

router.use(verifyToken);

router.get('/', listSignatureInboxController);
// Antes de /:kind/:id.
router.get('/count', countSignatureInboxController);
router.post('/batch-sign', validate(signatureInboxBatchSignSchema), batchSignFromInboxController);
router.get('/:kind/:id', getSignatureInboxDetailController);
router.get('/:kind/:id/pdf', getSignatureInboxPdfController);
router.post('/:kind/:id/sign', validate(signatureInboxSignSchema), signFromInboxController);

export default router;
