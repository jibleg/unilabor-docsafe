import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller';
import { verifyToken, authorize } from '../middlewares/auth.middleware';

const router = Router();

// Usamos "as any" solo en el handler final para romper la validación circular de tipos
router.get('/logs', 
  verifyToken, 
  authorize(['ADMIN']), 
  getAuditLogs as any
);

export default router;