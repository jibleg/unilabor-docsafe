import type { Request, Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import {
  createAgent, deleteAgent, getDevicesOverview, rotateAgentKey, updateAgent,
} from '../../services/attendance/agents.service';
import { listOrders, queueEnrollOrder, queueSyncOrders, queueTestOrder } from '../../services/attendance/agent-orders.service';
import { updateTerminal } from '../../services/attendance/terminals.service';
import { ordersQuerySchema } from '../../schemas/attendance/devices.schema';
import { handleAttendanceError, parsePositiveInt } from './attendance-http';
import { invalid } from '../../services/attendance/attendance-errors';

const userIdOf = (req: Request): string => (req as AuthRequest).user!.id;

/** URL publica que usara el agente: variable de entorno o la del propio request. */
const publicUrl = (req: Request): string => {
  const configured = process.env.ATTENDANCE_PUBLIC_URL?.trim() || process.env.PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0]!.trim();
  const host = String(req.headers['x-forwarded-host'] ?? req.get('host') ?? '').split(',')[0]!.trim();
  return `${proto}://${host}`;
};

const idParam = (req: Request, name = 'id'): number => parsePositiveInt(req.params[name]) ?? invalid('Identificador invalido.');

export const overviewController = async (_req: Request, res: Response) => {
  try {
    return res.json(await getDevicesOverview());
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo obtener el estado de los relojes');
  }
};

export const createAgentController = async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store');
    return res.status(201).json(await createAgent(req.body, userIdOf(req), publicUrl(req)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo crear el agente');
  }
};

export const rotateKeyController = async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store');
    return res.json(await rotateAgentKey(idParam(req), userIdOf(req), publicUrl(req)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo regenerar la clave');
  }
};

export const updateAgentController = async (req: Request, res: Response) => {
  try {
    return res.json({ agent: await updateAgent(idParam(req), req.body, userIdOf(req)) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo actualizar el agente');
  }
};

export const deleteAgentController = async (req: Request, res: Response) => {
  try {
    await deleteAgent(idParam(req), userIdOf(req));
    return res.json({ ok: true });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo eliminar el agente');
  }
};

export const updateTerminalController = async (req: Request, res: Response) => {
  try {
    return res.json({ terminal: await updateTerminal(idParam(req), req.body, userIdOf(req)) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo actualizar la terminal');
  }
};

export const listOrdersController = async (req: Request, res: Response) => {
  try {
    const parsed = ordersQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid('Filtros invalidos.', parsed.error.issues.map((i) => i.message));
    return res.json(await listOrders(parsed.data));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron consultar las ordenes');
  }
};

export const testAgentController = async (req: Request, res: Response) => {
  try {
    return res.status(201).json(await queueTestOrder(idParam(req), userIdOf(req)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo encolar la prueba');
  }
};

export const syncAgentController = async (req: Request, res: Response) => {
  try {
    return res.json(await queueSyncOrders(idParam(req), req.body.all === true, userIdOf(req)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo encolar la sincronizacion');
  }
};

export const enrollController = async (req: Request, res: Response) => {
  try {
    return res.status(201).json(await queueEnrollOrder(idParam(req, 'employeeId'), req.body.mode, userIdOf(req)));
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo encolar el enrolamiento');
  }
};
