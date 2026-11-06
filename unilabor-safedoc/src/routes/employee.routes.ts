import { Router } from 'express';
import {
  createEmployeeAreaController,
  createEmployeeController,
  deleteEmployeeController,
  getEmployeeByIdController,
  getEmployeeDocumentAccessController,
  getEmployeeSummaryController,
  listBranchesController,
  listEmployeeAreasController,
  listEmployeesController,
  listLinkableUsersController,
  updateEmployeeDocumentAccessController,
  updateEmployeeController,
} from '../controllers/employee.controller';
import {
  createEmployeeXlabLinkController,
  deleteEmployeeXlabLinkController,
  getEmployeeXlabLinkController,
  listAvailableXlabUsersController,
  updateEmployeeXlabLinkController,
} from '../controllers/xlab-user-link.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createEmployeeAreaSchema,
  createEmployeeSchema,
  updateEmployeeDocumentAccessSchema,
  updateEmployeeSchema,
} from '../schemas/employee.schema';
import { xlabUserLinkSchema } from '../schemas/xlab-user-link.schema';

const router = Router();

router.use(verifyToken);

router.get(
  '/summary',
  requirePermission('RH.EMPLOYEES.READ'),
  getEmployeeSummaryController,
);
// Directorio de USUARIOS del sistema (no expedientes de empleado) usado para
// elegir destinatarios de notificaciones en otros modulos (Proveedores).
router.get(
  '/linkable-users',
  requirePermission(['RH.EMPLOYEES.READ', 'PROVIDERS.CONFIG.MANAGE']),
  listLinkableUsersController,
);
// Catalogo de sucursales para el campo "Sucursal" del colaborador (reusa
// helpdesk_asset_units sin acoplar RH a permisos de Helpdesk).
router.get('/branches', requirePermission('RH.EMPLOYEES.READ'), listBranchesController);
// Catalogo de areas del colaborador: el expediente solo acepta areas de aqui
// (evita variantes como Validacion / VALIDACIÓN). Alta con el permiso de edicion.
router.get('/areas', requirePermission('RH.EMPLOYEES.READ'), listEmployeeAreasController);
router.post('/areas', requirePermission('RH.EMPLOYEES.WRITE'), validate(createEmployeeAreaSchema), createEmployeeAreaController);
// Usuarios de XLab activos que siguen libres, para vincularlos (antes de /:id).
// Mismo criterio que vincular el usuario de DocSafe: edicion del colaborador.
router.get('/xlab-users', requirePermission('RH.EMPLOYEES.WRITE'), listAvailableXlabUsersController);
// La LISTA de empleados es directorio de referencia que el modulo de Activos
// (HELPDESK) necesita para asignar responsables en activos, movimientos,
// mantenimiento y calibracion. Se permite tambien a quien puede ver activos
// (HELPDESK.ASSETS.READ): los nombres de responsables ya son visibles en los
// activos, asi que no expone datos nuevos. El detalle sensible (expediente,
// documentos, evaluaciones) sigue restringido a RH en sus propios endpoints.
router.get('/', requirePermission(['RH.EMPLOYEES.READ', 'HELPDESK.ASSETS.READ']), listEmployeesController);
router.get('/:id', requirePermission('RH.EMPLOYEES.READ'), getEmployeeByIdController);
router.get(
  '/:id/document-access',
  requirePermission('RH.EMPLOYEES.READ'),
  getEmployeeDocumentAccessController,
);
router.get('/:id/xlab-link', requirePermission('RH.EMPLOYEES.READ'), getEmployeeXlabLinkController);
router.post('/:id/xlab-link', requirePermission('RH.EMPLOYEES.WRITE'), validate(xlabUserLinkSchema), createEmployeeXlabLinkController);
router.put('/:id/xlab-link', requirePermission('RH.EMPLOYEES.WRITE'), validate(xlabUserLinkSchema), updateEmployeeXlabLinkController);
router.delete('/:id/xlab-link', requirePermission('RH.EMPLOYEES.WRITE'), deleteEmployeeXlabLinkController);
router.post('/', requirePermission('RH.EMPLOYEES.WRITE'), validate(createEmployeeSchema), createEmployeeController);
router.patch('/:id', requirePermission('RH.EMPLOYEES.WRITE'), validate(updateEmployeeSchema), updateEmployeeController);
router.put(
  '/:id/document-access',
  requirePermission('RH.EMPLOYEES.WRITE'),
  validate(updateEmployeeDocumentAccessSchema),
  updateEmployeeDocumentAccessController,
);
router.delete('/:id', requirePermission('RH.EMPLOYEES.WRITE'), deleteEmployeeController);

export default router;
