import type { Response } from 'express';
import type { AuthRequest } from '../../types';
import { daysQuerySchema, type RecalculateBody } from '../../schemas/attendance/days.schema';
import { listDays, recalculateDaysManually } from '../../services/attendance/days.service';
import { parseInput } from './days-punches-http';
import { handleAttendanceError } from './attendance-http';

/** GET /attendance/days */
export const listDaysController = async (req: AuthRequest, res: Response) => {
  const query = parseInput(res, daysQuerySchema, req.query);
  if (!query) return res;
  try {
    return res.json(await listDays(query));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron consultar los dias.');
  }
};

/** POST /attendance/days/recalculate */
export const recalculateDaysController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  try {
    return res.json(await recalculateDaysManually(req.body as RecalculateBody, req.user.id));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo recalcular el rango.');
  }
};
