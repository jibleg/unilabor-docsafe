import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller';
import { verifyToken, authorize, authorizeModuleAccess } from '../middlewares/auth.middleware';

const router = Router();

// Usamos "as any" solo en el handler final para romper la validación circular de tipos
router.get('/logs', 
  verifyToken, 
  authorizeModuleAccess('QUALITY'),
  authorize(['ADMIN']), 
  getAuditLogs as any
);

export default router;
