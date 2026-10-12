import type { Response } from 'express';
import type { z } from 'zod';
import {
  saveSettingSchema,
  settingChangesQuerySchema,
  settingKeyParamsSchema,
} from '../../schemas/attendance/settings.schema';
import {
  listAttendanceSettingChanges,
  listAttendanceSettings,
  saveAttendanceSetting,
} from '../../services/attendance/attendance-settings.service';
import type { AuthRequest } from '../../types';
import { handleAttendanceError } from './attendance-http';
import { parseInput } from './catalog-input';

export const listSettingsController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ settings: await listAttendanceSettings() });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron obtener los parametros.');
  }
};

export const saveSettingController = async (req: AuthRequest, res: Response) => {
  try {
    const { key } = parseInput(settingKeyParamsSchema, req.params);
    const body = req.body as z.infer<typeof saveSettingSchema>;
    const settings = await saveAttendanceSetting({
      key,
      value: body.value,
      reason: body.reason,
      userId: req.user!.id,
    });
    return res.json({ settings });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo guardar el parametro.');
  }
};

export const listSettingChangesController = async (req: AuthRequest, res: Response) => {
  try {
    const { limit } = parseInput(settingChangesQuerySchema, req.query);
    return res.json({ changes: await listAttendanceSettingChanges(limit ?? 100) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo obtener la bitacora de parametros.');
  }
};
