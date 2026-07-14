import { Router } from 'express';
import { listEmployeeAlertsController, listRhAlertsController } from '../controllers/employee-alert.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken, requirePermission('RH.ALERTS.READ'));

router.get('/alerts', listRhAlertsController);
router.get('/employees/:id/alerts', listEmployeeAlertsController);

export default router;
