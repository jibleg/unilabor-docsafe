import type { Response } from 'express';
import {
  holidayIdParamsSchema,
  holidaysQuerySchema,
  type CreateHolidayInput,
  type UpdateHolidayInput,
} from '../../schemas/attendance/holidays.schema';
import { createHoliday, deleteHoliday, listHolidays, updateHoliday } from '../../services/attendance/holidays.service';
import type { AuthRequest } from '../../types';
import { handleAttendanceError } from './attendance-http';
import { parseInput } from './catalog-input';

export const listHolidaysController = async (req: AuthRequest, res: Response) => {
  try {
    const { year } = parseInput(holidaysQuerySchema, req.query);
    return res.json({ holidays: await listHolidays(year) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron obtener los festivos.');
  }
};

export const createHolidayController = async (req: AuthRequest, res: Response) => {
  try {
    const holiday = await createHoliday(req.body as CreateHolidayInput, req.user!.id);
    return res.status(201).json({ holiday });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo crear el festivo.');
  }
};

export const updateHolidayController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = parseInput(holidayIdParamsSchema, req.params);
    const holiday = await updateHoliday(id, req.body as UpdateHolidayInput, req.user!.id);
    return res.json({ holiday });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo actualizar el festivo.');
  }
};

export const deleteHolidayController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = parseInput(holidayIdParamsSchema, req.params);
    await deleteHoliday(id, req.user!.id);
    return res.json({ ok: true });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo eliminar el festivo.');
  }
};
