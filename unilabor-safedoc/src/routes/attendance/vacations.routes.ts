import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as controller from '../../controllers/attendance/vacations.controller';
import { adjustVacationSchema, previewVacationSchema } from '../../schemas/attendance/vacations.schema';

/** Vacaciones: saldos, periodos, ajustes y vista previa de solicitudes. Montado bajo /api/attendance. */
const router = Router();

const read = requirePermission('ATTENDANCE.RECORDS.READ');
const authorize = requirePermission('ATTENDANCE.INCIDENTS.AUTHORIZE');

router.get('/vacations/balances', read, controller.balances);
router.get('/vacations/employees/:employeeId', read, controller.employeeVacations);
router.post('/vacations/employees/:employeeId/open-periods', authorize, controller.openPeriods);
router.post('/vacations/adjust', authorize, validate(adjustVacationSchema), controller.adjust);
router.post('/vacations/preview', read, validate(previewVacationSchema), controller.preview);

export default router;
