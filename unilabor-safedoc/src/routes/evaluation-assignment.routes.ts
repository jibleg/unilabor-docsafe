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

// El permiso va POR RUTA, no en un `router.use` sin prefijo: varios routers
// comparten el montaje /api/rh y un guard general aqui alcanzaria tambien a los
// que se monten despues.
router.use(verifyToken);

const selfEvaluations = requirePermission('RH.SELF.EVALUATIONS');

// Las rutas mas especificas van antes del parametro :id para no ser opacadas.
router.get('/me/evaluations/pending-count', selfEvaluations, myPendingEvaluationsCountController);
router.get('/me/evaluations', selfEvaluations, listMyEvaluationsController);
router.get('/me/evaluations/:id', selfEvaluations, getMyEvaluationDetailController);
router.post('/me/evaluations/:id/start', selfEvaluations, startMyEvaluationController);
router.post(
  '/me/evaluations/:id/submit',
  selfEvaluations,
  validate(submitEvaluationSchema),
  submitMyEvaluationController,
);
router.post('/me/evaluations/:id/request-late', selfEvaluations, requestLateAuthorizationController);

export default router;
