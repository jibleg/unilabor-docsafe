import { Router } from 'express';
import {
  copyScheduleController,
  createAssignmentsController,
  deleteAssignmentController,
  getEmployeeScheduleController,
  getScheduleController,
  listScheduleLogController,
  updateAssignmentController,
} from '../../controllers/attendance/schedule.controller';
import {
  createShiftController,
  deleteShiftController,
  listShiftsController,
  updateShiftController,
} from '../../controllers/attendance/shifts.controller';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  copyScheduleSchema,
  createAssignmentsSchema,
  updateAssignmentSchema,
} from '../../schemas/attendance/schedule.schema';
import { createShiftSchema, updateShiftSchema } from '../../schemas/attendance/shifts.schema';

/**
 * Rutas de asistencias: turnos y programacion. Montadas bajo /api/attendance (con verifyToken).
 * Las rutas fijas (/schedule/log, /schedule/copy, /schedule/employee/:id) conviven con GET /schedule.
 */
const router = Router();

const canRead = requirePermission('ATTENDANCE.RECORDS.READ');
const canWrite = requirePermission('ATTENDANCE.SCHEDULES.WRITE');

// Turnos
router.get('/shifts', canRead, listShiftsController);
router.post('/shifts', canWrite, validate(createShiftSchema), createShiftController);
router.patch('/shifts/:id', canWrite, validate(updateShiftSchema), updateShiftController);
router.delete('/shifts/:id', canWrite, deleteShiftController);

// Calendario y consultas
router.get('/schedule', canRead, getScheduleController);
router.get('/schedule/log', canRead, listScheduleLogController);
router.get('/schedule/employee/:employeeId', canRead, getEmployeeScheduleController);
router.post('/schedule/copy', canWrite, validate(copyScheduleSchema), copyScheduleController);

// Asignaciones
router.post('/assignments', canWrite, validate(createAssignmentsSchema), createAssignmentsController);
router.patch('/assignments/:id', canWrite, validate(updateAssignmentSchema), updateAssignmentController);
router.delete('/assignments/:id', canWrite, deleteAssignmentController);

export default router;
