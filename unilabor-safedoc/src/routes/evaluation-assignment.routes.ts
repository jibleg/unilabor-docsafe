import { Router } from 'express';
import {
  getMyEvaluationDetailController,
  listMyEvaluationsController,
  myPendingEvaluationsCountController,
  requestLateAuthorizationController,
  startMyEvaluationController,
  submitMyEvaluationController,
} from '../controllers/evaluation-assignment.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { submitEvaluationSchema } from '../schemas/training.schema';

/**
 * Rutas del colaborador para sus evaluaciones de capacitacion (vista /me).
 * Montadas en /api/rh. Disponibles para cualquier rol con acceso a RH (incluye
 * VIEWER, que es el rol del colaborador en el portal).
 */
const router = Router();

router.use(verifyToken, requirePermission('RH.SELF.EVALUATIONS'));

// Las rutas mas especificas van antes del parametro :id para no ser opacadas.
router.get('/me/evaluations/pending-count', myPendingEvaluationsCountController);
router.get('/me/evaluations', listMyEvaluationsController);
router.get('/me/evaluations/:id', getMyEvaluationDetailController);
router.post('/me/evaluations/:id/start', startMyEvaluationController);
router.post('/me/evaluations/:id/submit', validate(submitEvaluationSchema), submitMyEvaluationController);
router.post('/me/evaluations/:id/request-late', requestLateAuthorizationController);

export default router;
