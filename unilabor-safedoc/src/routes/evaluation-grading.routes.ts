import { Router } from 'express';
import {
  authorizeLateController,
  evaluationDashboardController,
  evaluationResponsesController,
  getGradingDetailController,
  gradeEvaluationController,
  listExpiredAssignmentsController,
  listGradingQueueController,
  listNotificationLogController,
  traceabilityReportController,
} from '../controllers/evaluation-grading.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { authorizeLateSchema, gradeEvaluationSchema } from '../schemas/training.schema';

/**
 * Calificacion manual de evaluaciones con preguntas abiertas (RH ADMIN/EDITOR).
 * Montadas en /api/rh/evaluations.
 */
const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'), authorizeModuleRole('RH', ['ADMIN', 'EDITOR']));

router.get('/grading', listGradingQueueController);
router.get('/notifications', listNotificationLogController);
router.get('/expired', listExpiredAssignmentsController);
router.get('/dashboard', evaluationDashboardController);
router.get('/report', traceabilityReportController);
router.get('/:id/grading', getGradingDetailController);
router.get('/:id/responses', evaluationResponsesController);
router.post('/:id/grade', validate(gradeEvaluationSchema), gradeEvaluationController);
router.post('/:id/authorize-late', validate(authorizeLateSchema), authorizeLateController);

export default router;
