import { Router } from 'express';
import {
  createManualPunchController,
  getPunchPhotoController,
  linkPunchEmployeeController,
  listPunchesController,
  reviewPunchController,
} from '../../controllers/attendance/punches.controller';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  linkEmployeeBodySchema,
  manualPunchBodySchema,
  reviewPunchBodySchema,
} from '../../schemas/attendance/punches.schema';

/** Checadas. Montado bajo /api/attendance (con verifyToken). Rutas fijas antes de las parametrizadas. */
const router = Router();

router.get('/punches', requirePermission('ATTENDANCE.RECORDS.READ'), listPunchesController);
router.get('/punches/:id/photo', requirePermission('ATTENDANCE.RECORDS.READ'), getPunchPhotoController);
router.post(
  '/punches/manual',
  requirePermission('ATTENDANCE.INCIDENTS.AUTHORIZE'),
  validate(manualPunchBodySchema),
  createManualPunchController,
);
router.post(
  '/punches/:id/review',
  requirePermission('ATTENDANCE.INCIDENTS.AUTHORIZE'),
  validate(reviewPunchBodySchema),
  reviewPunchController,
);
router.post(
  '/punches/:id/link-employee',
  requirePermission('ATTENDANCE.INCIDENTS.AUTHORIZE'),
  validate(linkEmployeeBodySchema),
  linkPunchEmployeeController,
);

export default router;
