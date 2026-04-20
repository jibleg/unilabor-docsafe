import { Router } from 'express';
import { getAuditLogsController } from '../controllers/audit.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/logs', verifyToken, getAuditLogsController);

export default router;
