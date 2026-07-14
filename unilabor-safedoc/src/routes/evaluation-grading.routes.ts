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
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { authorizeLateSchema, gradeEvaluationSchema } from '../schemas/training.schema';

/**
 * Calificacion manual de evaluaciones con preguntas abiertas (RH ADMIN/EDITOR).
 * Montadas en /api/rh/evaluations.
 */
const router = Router();

router.use(verifyToken);

router.get('/grading', requirePermission('RH.EVAL_GRADING.READ'), listGradingQueueController);
router.get('/notifications', requirePermission('RH.EVAL_GRADING.READ'), listNotificationLogController);
router.get('/expired', requirePermission('RH.EVAL_GRADING.READ'), listExpiredAssignmentsController);
router.get('/dashboard', requirePermission('RH.EVAL_GRADING.READ'), evaluationDashboardController);
router.get('/report', requirePermission('RH.EVAL_GRADING.READ'), traceabilityReportController);
router.get('/:id/grading', requirePermission('RH.EVAL_GRADING.READ'), getGradingDetailController);
router.get('/:id/responses', requirePermission('RH.EVAL_GRADING.READ'), evaluationResponsesController);
router.post('/:id/grade', requirePermission('RH.EVAL_GRADING.WRITE'), validate(gradeEvaluationSchema), gradeEvaluationController);
router.post('/:id/authorize-late', requirePermission('RH.EVAL_GRADING.WRITE'), validate(authorizeLateSchema), authorizeLateController);

export default router;
