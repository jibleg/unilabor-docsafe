import { Router } from 'express';
import {
  getMySupervisionController,
  getMySupervisionPdfController,
  listMySupervisionsController,
  saveMySupervisionResultsController,
  sendMySupervisionToSignatureController,
} from '../controllers/my-supervision.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { mySupervisionSendSchema, saveSupervisionResultsSchema } from '../schemas/rh-supervision-checklist.schema';

/**
 * "Mis supervisiones" (ANA-REG-060): solo sesion; el controller exige ser el
 * supervisor asignado de cada lista. Aqui se califica y se envia a firma; se
 * firma en el Buzon de firmas. Montado en /api/my/supervisions.
 */
const router = Router();

router.use(verifyToken);

router.get('/', listMySupervisionsController);
router.get('/:id', getMySupervisionController);
router.get('/:id/pdf', getMySupervisionPdfController);
router.put('/:id/results', validate(saveSupervisionResultsSchema), saveMySupervisionResultsController);
router.post('/:id/send-to-signature', validate(mySupervisionSendSchema), sendMySupervisionToSignatureController);

export default router;
