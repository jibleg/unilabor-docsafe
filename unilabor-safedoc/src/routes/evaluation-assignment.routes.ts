import { Router } from 'express';
import {
  listMyEvaluationsController,
  myPendingEvaluationsCountController,
} from '../controllers/evaluation-assignment.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';

/**
 * Rutas del colaborador para sus evaluaciones de capacitacion (vista /me).
 * Montadas en /api/rh. Disponibles para cualquier rol con acceso a RH (incluye
 * VIEWER, que es el rol del colaborador en el portal).
 */
const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'), authorizeModuleRole('RH', ['ADMIN', 'EDITOR', 'VIEWER']));

router.get('/me/evaluations', listMyEvaluationsController);
router.get('/me/evaluations/pending-count', myPendingEvaluationsCountController);

export default router;
