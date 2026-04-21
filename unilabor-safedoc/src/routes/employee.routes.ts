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
import { authorizeModuleAccess, authorizeModuleRole, verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken, authorizeModuleAccess('RH'));

router.get(
  '/summary',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  getEmployeeSummaryController,
);
router.get(
  '/linkable-users',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  listLinkableUsersController,
);
router.get('/', authorizeModuleRole('RH', ['ADMIN', 'EDITOR']), listEmployeesController);
router.get('/:id', authorizeModuleRole('RH', ['ADMIN', 'EDITOR']), getEmployeeByIdController);
router.get(
  '/:id/document-access',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  getEmployeeDocumentAccessController,
);
router.post('/', authorizeModuleRole('RH', ['ADMIN', 'EDITOR']), createEmployeeController);
router.patch('/:id', authorizeModuleRole('RH', ['ADMIN', 'EDITOR']), updateEmployeeController);
router.put(
  '/:id/document-access',
  authorizeModuleRole('RH', ['ADMIN', 'EDITOR']),
  updateEmployeeDocumentAccessController,
);
router.delete('/:id', authorizeModuleRole('RH', ['ADMIN', 'EDITOR']), deleteEmployeeController);

export default router;
