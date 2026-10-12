import { Router } from 'express';
import {
  exportCommitment, exportDays, exportOvertime, reportCommitmentPdf,
} from '../../controllers/attendance/exports.controller';
import { requirePermission } from '../../middlewares/auth.middleware';

/**
 * Exportaciones Excel y reporte PDF. Montadas bajo /api/attendance (con verifyToken).
 * Todas requieren ATTENDANCE.RECORDS.READ.
 */
const router = Router();

router.get('/export/commitment.xlsx', requirePermission('ATTENDANCE.RECORDS.READ'), exportCommitment);
router.get('/export/days.xlsx', requirePermission('ATTENDANCE.RECORDS.READ'), exportDays);
router.get('/export/overtime.xlsx', requirePermission('ATTENDANCE.RECORDS.READ'), exportOvertime);
router.get('/report/commitment.pdf', requirePermission('ATTENDANCE.RECORDS.READ'), reportCommitmentPdf);

export default router;
