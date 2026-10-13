import { Router } from 'express';
import {
  bulkEnableController,
  employeesSummaryController,
  getEmployeeController,
  getFacePhotoController,
  listBranchesController,
  listEmployeesController,
  sendFacePhotoController,
  updateEmployeeController,
  uploadFacePhotoController,
} from '../../controllers/attendance/employees.controller';
import { requirePermission } from '../../middlewares/auth.middleware';
import { uploadFacePhoto } from '../../middlewares/attendance-upload.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { bulkEnableSchema, updateEmployeeProfileSchema } from '../../schemas/attendance/employees.schema';

/** Sucursales y colaboradores del control de asistencia. Montadas bajo /api/attendance. */
const router = Router();

const READ = requirePermission('ATTENDANCE.RECORDS.READ');
const WRITE = requirePermission('ATTENDANCE.SCHEDULES.WRITE');

router.get('/branches', READ, listBranchesController);
router.get('/employees', READ, listEmployeesController);
// summary ANTES de :id para que no lo capture el parametro
router.get('/employees/summary', READ, employeesSummaryController);
router.post('/employees/bulk-enable', WRITE, validate(bulkEnableSchema), bulkEnableController);
router.get('/employees/:id', READ, getEmployeeController);
router.patch('/employees/:id', WRITE, validate(updateEmployeeProfileSchema), updateEmployeeController);
// Fotografia de rostro: se recorta en el navegador y se envia como JPEG; al reloj viaja por el agente.
router.get('/employees/:id/face-photo', READ, getFacePhotoController);
router.post('/employees/:id/face-photo', WRITE, uploadFacePhoto, uploadFacePhotoController);
router.post('/employees/:id/face-photo/send', WRITE, sendFacePhotoController);

export default router;
