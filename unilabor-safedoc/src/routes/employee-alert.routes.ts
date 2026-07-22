import { Router } from 'express';
import { listEmployeeAlertsController, listRhAlertsController } from '../controllers/employee-alert.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

// El permiso va POR RUTA, nunca en un `router.use` sin prefijo: este router se
// monta en /api/rh junto con otros, asi que un guard general aqui se aplicaria
// tambien a las rutas de los routers montados despues (acuses, evaluaciones) y
// las bloquearia con 403 para quien no sea de alertas.
router.use(verifyToken);

router.get('/alerts', requirePermission('RH.ALERTS.READ'), listRhAlertsController);
router.get(
  '/employees/:id/alerts',
  requirePermission('RH.ALERTS.READ'),
  listEmployeeAlertsController,
);

export default router;
