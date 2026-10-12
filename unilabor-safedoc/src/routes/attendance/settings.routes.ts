import { Router } from 'express';
import { createHolidayController, deleteHolidayController, listHolidaysController, updateHolidayController } from '../../controllers/attendance/holidays.controller';
import {
  createIncidentTypeController,
  listIncidentTypesController,
  updateIncidentTypeController,
} from '../../controllers/attendance/incident-types.controller';
import {
  listSettingChangesController,
  listSettingsController,
  saveSettingController,
} from '../../controllers/attendance/settings.controller';
import {
  deleteVacationPolicyController,
  listVacationPolicyController,
  resetVacationPolicyController,
  saveVacationPolicyController,
} from '../../controllers/attendance/vacation-policy.controller';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createHolidaySchema, updateHolidaySchema } from '../../schemas/attendance/holidays.schema';
import {
  createIncidentTypeSchema,
  updateIncidentTypeSchema,
} from '../../schemas/attendance/incident-types.schema';
import { saveSettingSchema } from '../../schemas/attendance/settings.schema';

/**
 * Parametros, festivos, tipos de incidencia y tabla de vacaciones.
 * Montadas bajo /api/attendance (con verifyToken).
 */
const router = Router();

const READ = requirePermission('ATTENDANCE.RECORDS.READ');
const MANAGE = requirePermission('ATTENDANCE.SETTINGS.MANAGE');

router.get('/settings', READ, listSettingsController);
router.get('/settings/changes', READ, listSettingChangesController);
router.put('/settings/:key', MANAGE, validate(saveSettingSchema), saveSettingController);

router.get('/holidays', READ, listHolidaysController);
router.post('/holidays', MANAGE, validate(createHolidaySchema), createHolidayController);
router.patch('/holidays/:id', MANAGE, validate(updateHolidaySchema), updateHolidayController);
router.delete('/holidays/:id', MANAGE, deleteHolidayController);

router.get('/incident-types', READ, listIncidentTypesController);
router.post('/incident-types', MANAGE, validate(createIncidentTypeSchema), createIncidentTypeController);
router.patch('/incident-types/:id', MANAGE, validate(updateIncidentTypeSchema), updateIncidentTypeController);

router.get('/vacation-policy', READ, listVacationPolicyController);
router.post('/vacation-policy/reset', MANAGE, resetVacationPolicyController);
router.put('/vacation-policy/:fromYear', MANAGE, saveVacationPolicyController);
router.delete('/vacation-policy/:fromYear', MANAGE, deleteVacationPolicyController);

export default router;
