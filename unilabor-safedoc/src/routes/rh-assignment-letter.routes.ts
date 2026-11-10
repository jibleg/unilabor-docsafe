import { Router } from 'express';
import {
  deleteAssignmentLetterController,
  generatePendingLettersController,
  getAssignmentLetterController,
  getPositionAuthorizationsController,
  listAssignmentLettersController,
  listAuthorizationItemsController,
  setPositionAuthorizationsController,
  updateAssignmentLetterController,
} from '../controllers/rh-assignment-letter.controller';
import {
  cancelLetterSignatureController,
  getLetterPdfController,
  getLetterSignersController,
  sendLetterToSignatureController,
} from '../controllers/rh-phase7-signature.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { setPositionAuthorizationsSchema, updateAssignmentLetterSchema } from '../schemas/rh-assignment-letter.schema';

/**
 * Carta de asignacion de puesto REH-REG-008 (Fase 7). Montado en
 * /api/rh/assignment-letters. RH (competencia o induccion) la gestiona.
 */
const router = Router();

router.use(verifyToken, requirePermission(['RH.COMPETENCY.MANAGE', 'RH.INDUCTION.MANAGE']));

router.get('/items', listAuthorizationItemsController);
router.get('/positions/:positionId/authorizations', getPositionAuthorizationsController);
router.put('/positions/:positionId/authorizations', validate(setPositionAuthorizationsSchema), setPositionAuthorizationsController);
router.post('/generate', generatePendingLettersController);

router.get('/', listAssignmentLettersController);
router.get('/:id', getAssignmentLetterController);
router.get('/:id/pdf', getLetterPdfController);
router.patch('/:id', validate(updateAssignmentLetterSchema), updateAssignmentLetterController);
// Buzon de firmas: enviar (bloquea y pide las 3 firmas), cancelar el envio y firmantes.
router.post('/:id/send-to-signature', sendLetterToSignatureController);
router.delete('/:id/signature-request', cancelLetterSignatureController);
router.get('/:id/signers', getLetterSignersController);
router.delete('/:id', deleteAssignmentLetterController);

export default router;
