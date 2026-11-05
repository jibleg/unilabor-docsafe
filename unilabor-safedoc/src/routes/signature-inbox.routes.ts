import { Router } from 'express';
import {
  countSignatureInboxController,
  getSignatureInboxDetailController,
  getSignatureInboxPdfController,
  listSignatureInboxController,
  signFromInboxController,
} from '../controllers/signature-inbox.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { signatureInboxSignSchema } from '../schemas/rh-supervision-checklist.schema';

/**
 * Buzon de firmas (ANA-REG-060): solo sesion; el controller exige que el
 * usuario sea firmante de cada lista (supervisor, responsable del area o el
 * colaborador evaluado). Montado en /api/my/signature-inbox.
 */
const router = Router();

router.use(verifyToken);

router.get('/', listSignatureInboxController);
// Antes de /:id.
router.get('/count', countSignatureInboxController);
router.get('/:id', getSignatureInboxDetailController);
router.get('/:id/pdf', getSignatureInboxPdfController);
router.post('/:id/sign', validate(signatureInboxSignSchema), signFromInboxController);

export default router;
