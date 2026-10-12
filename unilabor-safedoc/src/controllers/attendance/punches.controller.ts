import type { Response } from 'express';
import type { AuthRequest } from '../../types';
import {
  punchesQuerySchema,
  punchIdParamsSchema,
  type LinkEmployeeBody,
  type ManualPunchBody,
  type ReviewPunchBody,
} from '../../schemas/attendance/punches.schema';
import {
  createManualPunch,
  getPunchPhotoFile,
  linkPunchEmployee,
  listPunches,
  reviewPunch,
} from '../../services/attendance/punches.service';
import { handleAttendanceError } from './attendance-http';
import { parseInput } from './days-punches-http';

/** GET /attendance/punches */
export const listPunchesController = async (req: AuthRequest, res: Response) => {
  const query = parseInput(res, punchesQuerySchema, req.query);
  if (!query) return res;
  try {
    return res.json(await listPunches(query));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron consultar las checadas.');
  }
};

/** POST /attendance/punches/manual */
export const createManualPunchController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  try {
    return res.status(201).json(await createManualPunch(req.body as ManualPunchBody, req.user.id));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo registrar la checada manual.');
  }
};

/** POST /attendance/punches/:id/review */
export const reviewPunchController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  const params = parseInput(res, punchIdParamsSchema, req.params);
  if (!params) return res;
  try {
    return res.json(await reviewPunch(params.id, req.body as ReviewPunchBody, req.user.id));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo revisar la checada.');
  }
};

/** POST /attendance/punches/:id/link-employee */
export const linkPunchEmployeeController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  const params = parseInput(res, punchIdParamsSchema, req.params);
  if (!params) return res;
  try {
    return res.json(await linkPunchEmployee(params.id, req.body as LinkEmployeeBody, req.user.id));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo vincular la checada.');
  }
};

/** GET /attendance/punches/:id/photo (foto de la checada, solo lectura autenticada) */
export const getPunchPhotoController = async (req: AuthRequest, res: Response) => {
  const params = parseInput(res, punchIdParamsSchema, req.params);
  if (!params) return res;
  try {
    const { filePath, mime } = await getPunchPhotoFile(params.id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    return res.sendFile(filePath);
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo cargar la foto de la checada.');
  }
};
