import type { Request, Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { registerAuditEvent } from '../../services/audit.service';
import { AttendanceError, invalid } from '../../services/attendance/attendance-errors';
import {
  adjustVacationPeriod,
  getEmployeeVacations,
  listVacationBalances,
  openPeriodsForEmployee,
  previewVacationRequest,
} from '../../services/attendance/vacation-balance.service';
import { listBalancesQuerySchema } from '../../schemas/attendance/vacations.schema';
import { handleAttendanceError, parsePositiveInt } from './attendance-http';

const userIdOf = (req: Request): string => {
  const id = (req as AuthRequest).user?.id;
  if (!id) throw new AttendanceError('ATTENDANCE_UNAUTHENTICATED', 'Sesion invalida o expirada');
  return id;
};

const employeeIdOf = (req: Request): number =>
  parsePositiveInt(req.params.employeeId) ?? invalid('Colaborador invalido.');

const audit = (req: Request, action: string, employeeId: number, metadata: Record<string, unknown>): void => {
  void registerAuditEvent({
    user_id: userIdOf(req),
    action,
    ip_address: req.ip ?? null,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_vacation',
    employee_id: employeeId,
    metadata,
  }).catch(() => undefined);
};

export const employeeVacations = async (req: Request, res: Response) => {
  try {
    return res.json(await getEmployeeVacations(employeeIdOf(req)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron consultar las vacaciones');
  }
};

export const openPeriods = async (req: Request, res: Response) => {
  try {
    const employeeId = employeeIdOf(req);
    const result = await openPeriodsForEmployee(employeeId);
    audit(req, 'attendance_vacation_periods_opened', employeeId, { periods_touched: result.periods_touched });
    return res.json(result);
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron abrir los periodos');
  }
};

export const adjust = async (req: Request, res: Response) => {
  try {
    const body = req.body as { period_id: number; adjustment: number; reason: string };
    const result = await adjustVacationPeriod({
      periodId: body.period_id,
      adjustment: body.adjustment,
      reason: body.reason,
      userId: userIdOf(req),
    });
    audit(req, 'attendance_vacation_adjusted', result.employeeId, {
      period_id: body.period_id,
      previous_adjustment: result.previousAdjustment,
      adjustment: body.adjustment,
      reason: body.reason,
    });
    return res.json(result.vacations);
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo ajustar el periodo');
  }
};

export const preview = async (req: Request, res: Response) => {
  try {
    const body = req.body as { employee_id: number; incident_type_id: number; start_date: string; end_date: string };
    return res.json(
      await previewVacationRequest({
        employeeId: body.employee_id,
        incidentTypeId: body.incident_type_id,
        startDate: body.start_date,
        endDate: body.end_date,
      }),
    );
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo calcular la vista previa');
  }
};

export const balances = async (req: Request, res: Response) => {
  try {
    const parsed = listBalancesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Datos de entrada invalidos',
        errors: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    return res.json(await listVacationBalances({
      branchId: parsed.data.branch_id,
      search: parsed.data.search,
      page: parsed.data.page,
      limit: parsed.data.limit,
    }));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron consultar los saldos');
  }
};
