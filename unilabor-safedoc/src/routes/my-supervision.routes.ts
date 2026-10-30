import { Router } from 'express';
import {
  endorseMySupervisionController,
  getMySupervisionController,
  getMySupervisionPdfController,
  listMySupervisionsController,
  saveMySupervisionResultsController,
  signMySupervisionController,
} from '../controllers/my-supervision.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { mySupervisionEndorseSchema, mySupervisionSignSchema, saveSupervisionResultsSchema } from '../schemas/rh-supervision-checklist.schema';

/**
 * "Mis supervisiones" (ANA-REG-060): solo sesion; el controller exige ser el
 * supervisor asignado o el responsable del area de cada lista.
 * Montado en /api/my/supervisions.
 */
const router = Router();

router.use(verifyToken);

router.get('/', listMySupervisionsController);
router.get('/:id', getMySupervisionController);
router.get('/:id/pdf', getMySupervisionPdfController);
router.put('/:id/results', validate(saveSupervisionResultsSchema), saveMySupervisionResultsController);
router.post('/:id/sign', validate(mySupervisionSignSchema), signMySupervisionController);
router.post('/:id/endorse', validate(mySupervisionEndorseSchema), endorseMySupervisionController);

export default router;
