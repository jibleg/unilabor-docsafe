import type { Response } from 'express';
import type { ZodType } from 'zod';
import type { AuthRequest } from '../../types';
import {
  listShiftsQuerySchema,
  shiftIdParamsSchema,
  type CreateShiftInput,
  type UpdateShiftInput,
} from '../../schemas/attendance/shifts.schema';
import { createShift, deleteShift, listShifts, updateShift } from '../../services/attendance/shifts.service';
import { handleAttendanceError } from './attendance-http';

/** Valida query/params con Zod; responde 400 con el formato uniforme y devuelve null si falla. */
export const parseInput = <T>(schema: ZodType<T>, data: unknown, res: Response): T | null => {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  res.status(400).json({
    message: 'Datos de entrada invalidos',
    errors: result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : '(consulta)',
      message: issue.message,
    })),
  });
  return null;
};

export const listShiftsController = async (req: AuthRequest, res: Response) => {
  const query = parseInput(listShiftsQuerySchema, req.query, res);
  if (!query) return res;
  try {
    return res.json({ shifts: await listShifts(query.include_inactive ?? false) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron cargar los turnos.');
  }
};

export const createShiftController = async (req: AuthRequest, res: Response) => {
  try {
    const shift = await createShift(req.body as CreateShiftInput, req.user?.id ?? '', req.ip ?? null);
    return res.status(201).json({ shift });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo crear el turno.');
  }
};

export const updateShiftController = async (req: AuthRequest, res: Response) => {
  const params = parseInput(shiftIdParamsSchema, req.params, res);
  if (!params) return res;
  try {
    const shift = await updateShift(params.id, req.body as UpdateShiftInput, req.user?.id ?? '', req.ip ?? null);
    return res.json({ shift });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo actualizar el turno.');
  }
};

export const deleteShiftController = async (req: AuthRequest, res: Response) => {
  const params = parseInput(shiftIdParamsSchema, req.params, res);
  if (!params) return res;
  try {
    await deleteShift(params.id, req.user?.id ?? '', req.ip ?? null);
    return res.status(204).send();
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo eliminar el turno.');
  }
};
