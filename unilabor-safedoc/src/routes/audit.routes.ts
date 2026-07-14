import { Router } from 'express';
import { getAuditLogsController } from '../controllers/audit.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/logs', verifyToken, requirePermission('ADMIN.AUDIT.READ'), getAuditLogsController);

export default router;
