import { Router } from 'express';
import {
  createEmployeeController,
  deleteEmployeeController,
  getEmployeeByIdController,
  getEmployeeSummaryController,
  listEmployeesController,
  listLinkableUsersController,
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
router.post('/', authorizeModuleRole('RH', ['ADMIN', 'EDITOR']), createEmployeeController);
router.patch('/:id', authorizeModuleRole('RH', ['ADMIN', 'EDITOR']), updateEmployeeController);
router.delete('/:id', authorizeModuleRole('RH', ['ADMIN', 'EDITOR']), deleteEmployeeController);

export default router;
