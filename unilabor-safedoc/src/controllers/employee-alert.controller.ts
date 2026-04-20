import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { listEmployeeAlerts } from '../services/employee-alert.service';

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

export const listRhAlertsController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.query.employee_id);
  const area = typeof req.query.area === 'string' ? req.query.area.trim() : undefined;
  const stateRaw = typeof req.query.state === 'string' ? req.query.state.trim().toLowerCase() : '';
  const state =
    stateRaw === 'missing' || stateRaw === 'expiring' || stateRaw === 'expired'
      ? stateRaw
      : undefined;

  try {
    const response = await listEmployeeAlerts({
      ...(employeeId ? { employee_id: employeeId } : {}),
      ...(area ? { area } : {}),
      ...(state ? { state } : {}),
    });

    return res.json(response);
  } catch (error) {
    console.error('Error obteniendo alertas RH:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las alertas RH.' });
  }
};

export const listEmployeeAlertsController = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.id);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }

  const stateRaw = typeof req.query.state === 'string' ? req.query.state.trim().toLowerCase() : '';
  const state =
    stateRaw === 'missing' || stateRaw === 'expiring' || stateRaw === 'expired'
      ? stateRaw
      : undefined;

  try {
    const response = await listEmployeeAlerts({
      employee_id: employeeId,
      ...(state ? { state } : {}),
    });

    return res.json(response);
  } catch (error) {
    console.error('Error obteniendo alertas por colaborador:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las alertas del colaborador.' });
  }
};
