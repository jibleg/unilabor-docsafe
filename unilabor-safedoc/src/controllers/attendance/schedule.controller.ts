import type { Response } from 'express';
import type { AuthRequest } from '../../types';
import {
  assignmentIdParamsSchema,
  deleteAssignmentQuerySchema,
  employeeScheduleParamsSchema,
  employeeScheduleQuerySchema,
  scheduleLogQuerySchema,
  scheduleQuerySchema,
  type CopyScheduleInput,
  type CreateAssignmentsInput,
  type UpdateAssignmentInput,
} from '../../schemas/attendance/schedule.schema';
import { copySchedule } from '../../services/attendance/schedule-copy.service';
import { listScheduleLog } from '../../services/attendance/schedule-log.service';
import { getEmployeeSchedule, getWeekSchedule } from '../../services/attendance/schedule-view.service';
import {
  createAssignments,
  removeAssignment,
  updateAssignment,
  type AuditContext,
} from '../../services/attendance/shift-assignments.service';
import { handleAttendanceError } from './attendance-http';
import { parseInput } from './shifts.controller';

const auditContext = (req: AuthRequest): AuditContext => ({ userId: req.user?.id ?? '', ip: req.ip ?? null });

export const getScheduleController = async (req: AuthRequest, res: Response) => {
  const query = parseInput(scheduleQuerySchema, req.query, res);
  if (!query) return res;
  try {
    return res.json(await getWeekSchedule(query));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo cargar el calendario.');
  }
};

export const getEmployeeScheduleController = async (req: AuthRequest, res: Response) => {
  const params = parseInput(employeeScheduleParamsSchema, req.params, res);
  const query = parseInput(employeeScheduleQuerySchema, req.query, res);
  if (!params || !query) return res;
  try {
    return res.json(await getEmployeeSchedule(params.employeeId, query.from, query.to));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo cargar el horario del colaborador.');
  }
};

export const createAssignmentsController = async (req: AuthRequest, res: Response) => {
  try {
    const assignments = await createAssignments(req.body as CreateAssignmentsInput, auditContext(req));
    return res.status(201).json({ assignments });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo programar el horario.');
  }
};

export const updateAssignmentController = async (req: AuthRequest, res: Response) => {
  const params = parseInput(assignmentIdParamsSchema, req.params, res);
  if (!params) return res;
  try {
    const assignment = await updateAssignment(params.id, req.body as UpdateAssignmentInput, auditContext(req));
    return res.json({ assignment });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo actualizar la programacion.');
  }
};

export const deleteAssignmentController = async (req: AuthRequest, res: Response) => {
  const params = parseInput(assignmentIdParamsSchema, req.params, res);
  const query = parseInput(deleteAssignmentQuerySchema, req.query, res);
  if (!params || !query) return res;
  try {
    const result = await removeAssignment(
      params.id,
      { date: query.date, fromDateOnly: query.from_date_only ?? false },
      auditContext(req),
    );
    return res.json({ result });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo quitar la programacion.');
  }
};

export const copyScheduleController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await copySchedule(req.body as CopyScheduleInput, auditContext(req));
    return res.json({ result });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo copiar el horario.');
  }
};

export const listScheduleLogController = async (req: AuthRequest, res: Response) => {
  const query = parseInput(scheduleLogQuerySchema, req.query, res);
  if (!query) return res;
  try {
    return res.json(await listScheduleLog(query));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo cargar la bitacora.');
  }
};
