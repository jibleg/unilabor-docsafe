import { Router } from 'express';
import { listDaysController, recalculateDaysController } from '../../controllers/attendance/days.controller';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { recalculateBodySchema } from '../../schemas/attendance/days.schema';

/** Resultados diarios de asistencia. Montado bajo /api/attendance (con verifyToken). */
const router = Router();

router.get('/days', requirePermission('ATTENDANCE.RECORDS.READ'), listDaysController);
router.post(
  '/days/recalculate',
  requirePermission('ATTENDANCE.INCIDENTS.AUTHORIZE'),
  validate(recalculateBodySchema),
  recalculateDaysController,
);

export default router;
