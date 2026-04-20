import { Router } from 'express';
import { listEmployeeAlertsController, listRhAlertsController } from '../controllers/employee-alert.controller';
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'), authorizeModuleRole('RH', ['ADMIN', 'EDITOR']));

router.get('/alerts', listRhAlertsController);
router.get('/employees/:id/alerts', listEmployeeAlertsController);

export default router;
