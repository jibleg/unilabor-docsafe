import fs from 'fs';
import type { Response } from 'express';
import {
  employeeIdParamsSchema,
  employeesQuerySchema,
  employeesSummaryQuerySchema,
  type BulkEnableInput,
  type UpdateEmployeeProfileInput,
} from '../../schemas/attendance/employees.schema';
import {
  bulkEnableEmployees,
  getAttendanceEmployee,
  getEmployeesSummary,
  listAttendanceEmployees,
  listBranches,
  updateAttendanceEmployee,
} from '../../services/attendance/employee-profiles.service';
import {
  getEmployeeFacePhotoFile,
  queueFacePhotoOrder,
  saveEmployeeFacePhoto,
} from '../../services/attendance/face-photos.service';
import type { AuthRequest } from '../../types';
import { handleAttendanceError } from './attendance-http';
import { parseInput } from './catalog-input';

export const listBranchesController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ branches: await listBranches() });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron obtener las sucursales.');
  }
};

export const listEmployeesController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json(await listAttendanceEmployees(parseInput(employeesQuerySchema, req.query)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron obtener los colaboradores.');
  }
};

export const employeesSummaryController = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id } = parseInput(employeesSummaryQuerySchema, req.query);
    return res.json({ summary: await getEmployeesSummary(branch_id) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo obtener el resumen.');
  }
};

export const getEmployeeController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = parseInput(employeeIdParamsSchema, req.params);
    return res.json({ employee: await getAttendanceEmployee(id) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo obtener el colaborador.');
  }
};

export const updateEmployeeController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = parseInput(employeeIdParamsSchema, req.params);
    const employee = await updateAttendanceEmployee(id, req.body as UpdateEmployeeProfileInput, req.user!.id);
    return res.json({ employee });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo actualizar el colaborador.');
  }
};

export const bulkEnableController = async (req: AuthRequest, res: Response) => {
  try {
    return res.json(await bulkEnableEmployees(req.body as BulkEnableInput, req.user!.id));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo habilitar el lote.');
  }
};

export const uploadFacePhotoController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = parseInput(employeeIdParamsSchema, req.params);
    const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ message: 'Adjunta la fotografía en el campo "photo".' });
    const { queued } = await saveEmployeeFacePhoto(id, file.buffer, req.user!.id);
    return res.status(201).json({ employee: await getAttendanceEmployee(id), queued });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo guardar la fotografía.');
  }
};

export const sendFacePhotoController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = parseInput(employeeIdParamsSchema, req.params);
    const { order_id } = await queueFacePhotoOrder(id, req.user!.id);
    return res.status(202).json({ order_id, employee: await getAttendanceEmployee(id) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo enviar la fotografía al reloj.');
  }
};

export const getFacePhotoController = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = parseInput(employeeIdParamsSchema, req.params);
    const file = await getEmployeeFacePhotoFile(id);
    if (!fs.existsSync(file)) return res.status(404).json({ message: 'La fotografía no está disponible.' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo obtener la fotografía.');
  }
};
