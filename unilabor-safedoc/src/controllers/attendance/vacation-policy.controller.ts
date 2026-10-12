import type { Response } from 'express';
import {
  saveVacationPolicySchema,
  vacationPolicyParamsSchema,
} from '../../schemas/attendance/vacation-policy.schema';
import {
  deleteVacationPolicyRow,
  listVacationPolicy,
  resetVacationPolicy,
  saveVacationPolicyRow,
} from '../../services/attendance/vacation-policy.service';
import { applyPolicyToCurrentPeriods } from '../../services/attendance/vacation-periods.service';
import type { AuthRequest } from '../../types';
import { handleAttendanceError } from './attendance-http';
import { parseInput } from './catalog-input';

/** Propaga la tabla vigente a los periodos no vencidos (best-effort: no rompe la peticion). */
const propagatePolicy = async (): Promise<void> => {
  try {
    await applyPolicyToCurrentPeriods();
  } catch (error) {
    console.error('[attendance] No se pudo aplicar la tabla de vacaciones a los periodos vigentes:', error);
  }
};

export const listVacationPolicyController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ policy: await listVacationPolicy() });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo obtener la tabla de vacaciones.');
  }
};

export const saveVacationPolicyController = async (req: AuthRequest, res: Response) => {
  try {
    const { fromYear } = parseInput(vacationPolicyParamsSchema, req.params);
    const body = parseInput(saveVacationPolicySchema, req.body);
    const policy = await saveVacationPolicyRow(fromYear, body.vacation_days, req.user!.id);
    await propagatePolicy();
    return res.json({ policy });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo guardar la tabla de vacaciones.');
  }
};

export const deleteVacationPolicyController = async (req: AuthRequest, res: Response) => {
  try {
    const { fromYear } = parseInput(vacationPolicyParamsSchema, req.params);
    const policy = await deleteVacationPolicyRow(fromYear, req.user!.id);
    await propagatePolicy();
    return res.json({ policy });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo borrar la fila de vacaciones.');
  }
};

export const resetVacationPolicyController = async (req: AuthRequest, res: Response) => {
  try {
    const policy = await resetVacationPolicy(req.user!.id);
    await propagatePolicy();
    return res.json({ policy });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo restaurar la tabla de vacaciones.');
  }
};
