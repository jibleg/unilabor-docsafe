import { Router } from 'express';
import {
  createEmployeeController,
  deleteEmployeeController,
  getEmployeeByIdController,
  getEmployeeDocumentAccessController,
  getEmployeeSummaryController,
  listEmployeesController,
  listLinkableUsersController,
  updateEmployeeDocumentAccessController,
  updateEmployeeController,
} from '../controllers/employee.controller';
import { requirePermission, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createEmployeeSchema,
  updateEmployeeDocumentAccessSchema,
  updateEmployeeSchema,
} from '../schemas/employee.schema';

const router = Router();

router.use(verifyToken);

router.get(
  '/summary',
  requirePermission('RH.EMPLOYEES.READ'),
  getEmployeeSummaryController,
);
router.get(
  '/linkable-users',
  requirePermission('RH.EMPLOYEES.READ'),
  listLinkableUsersController,
);
router.get('/', requirePermission('RH.EMPLOYEES.READ'), listEmployeesController);
router.get('/:id', requirePermission('RH.EMPLOYEES.READ'), getEmployeeByIdController);
router.get(
  '/:id/document-access',
  requirePermission('RH.EMPLOYEES.READ'),
  getEmployeeDocumentAccessController,
);
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
