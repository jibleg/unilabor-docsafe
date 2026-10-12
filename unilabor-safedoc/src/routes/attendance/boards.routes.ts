import { Router } from 'express';
import { getCommitment, getLive } from '../../controllers/attendance/boards.controller';
import { requirePermission } from '../../middlewares/auth.middleware';

/**
 * Tableros de asistencias. Montadas bajo /api/attendance (con verifyToken).
 * Todas requieren ATTENDANCE.RECORDS.READ.
 */
const router = Router();

router.get('/board/live', requirePermission('ATTENDANCE.RECORDS.READ'), getLive);
router.get('/board/commitment', requirePermission('ATTENDANCE.RECORDS.READ'), getCommitment);

export default router;
