import type { Request, Response } from 'express';
import { getAuthenticatedAgent } from '../../middlewares/attendance-agent.middleware';
import { finishOrder, takeOrders } from '../../services/attendance/agent-orders.service';
import { invalid } from '../../services/attendance/attendance-errors';
import { ingestPunches } from '../../services/attendance/punch-ingestion.service';
import { processHeartbeat } from '../../services/attendance/terminals.service';
import { orderResultSchema, ordersQuerySchema } from '../../schemas/attendance/agent.schema';
import { handleAttendanceError, parsePositiveInt } from './attendance-http';

export const heartbeatController = async (req: Request, res: Response) => {
  try {
    const result = await processHeartbeat(getAuthenticatedAgent(res), req.body);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo registrar el latido');
  }
};

export const takeOrdersController = async (req: Request, res: Response) => {
  try {
    const parsed = ordersQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid('Limite invalido.');
    return res.json({ orders: await takeOrders(getAuthenticatedAgent(res), parsed.data.limit) });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron entregar las ordenes');
  }
};

export const orderResultController = async (req: Request, res: Response) => {
  try {
    const orderId = parsePositiveInt(req.params.id) ?? invalid('Identificador invalido.');
    const body = orderResultSchema.parse(req.body);
    await finishOrder(getAuthenticatedAgent(res), orderId, body);
    return res.json({ ok: true });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudo cerrar la orden');
  }
};

export const punchesController = async (req: Request, res: Response) => {
  try {
    const { terminalSerial, events } = req.body as { terminalSerial: string; events: unknown[] };
    const result = await ingestPunches(getAuthenticatedAgent(res), terminalSerial, events);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return handleAttendanceError(res, error, 'No se pudieron registrar las checadas');
  }
};
