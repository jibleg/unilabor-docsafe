import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  createAgentController, deleteAgentController, enrollController, listOrdersController, overviewController,
  rotateKeyController, syncAgentController, testAgentController, updateAgentController, updateTerminalController,
} from '../../controllers/attendance/devices.controller';
import {
  createAgentSchema, enrollSchema, syncAgentSchema, updateAgentSchema, updateTerminalSchema,
} from '../../schemas/attendance/devices.schema';

/** Panel de relojes: /api/attendance/devices/* (con verifyToken). */
const router = Router();
const manage = requirePermission('ATTENDANCE.DEVICES.MANAGE');

router.get('/devices/overview', requirePermission('ATTENDANCE.RECORDS.READ'), overviewController);
router.get('/devices/orders', manage, listOrdersController);
router.post('/devices/agents', manage, validate(createAgentSchema), createAgentController);
router.post('/devices/agents/:id/rotate-key', manage, rotateKeyController);
router.patch('/devices/agents/:id', manage, validate(updateAgentSchema), updateAgentController);
router.delete('/devices/agents/:id', manage, deleteAgentController);
router.post('/devices/agents/:id/test', manage, testAgentController);
router.post('/devices/agents/:id/sync', manage, validate(syncAgentSchema), syncAgentController);
router.patch('/devices/terminals/:id', manage, validate(updateTerminalSchema), updateTerminalController);
router.post('/devices/employees/:employeeId/enroll', manage, validate(enrollSchema), enrollController);

export default router;
