import { Router } from 'express';
import {
  getGradingDetailController,
  gradeEvaluationController,
  listGradingQueueController,
  listNotificationLogController,
} from '../controllers/evaluation-grading.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { gradeEvaluationSchema } from '../schemas/training.schema';

/**
 * Calificacion manual de evaluaciones con preguntas abiertas (RH ADMIN/EDITOR).
 * Montadas en /api/rh/evaluations.
 */
const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'), authorizeModuleRole('RH', ['ADMIN', 'EDITOR']));

router.get('/grading', listGradingQueueController);
router.get('/notifications', listNotificationLogController);
router.get('/:id/grading', getGradingDetailController);
router.post('/:id/grade', validate(gradeEvaluationSchema), gradeEvaluationController);

export default router;
