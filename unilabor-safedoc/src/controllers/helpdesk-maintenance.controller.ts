import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  listMaintenanceCatalogs,
  listMaintenanceOrders,
  listMaintenancePlans,
  rescheduleMaintenanceOrder,
  startMaintenanceOrder,
} from '../services/helpdesk-maintenance.service';
import {
  getNumberId,
  mapHelpdeskError,
  getMaintenanceOrderReschedulePayload,
  logHelpdeskAudit,
} from './helpdesk-controller.shared';

export const listMaintenanceCatalogsController = async (_req: AuthRequest, res: Response) => {
  try {
    const catalogs = await listMaintenanceCatalogs();
    return res.json({ catalogs });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando catalogos mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los catalogos de mantenimiento.' });
  }
};

export const listMaintenancePlansController = async (_req: AuthRequest, res: Response) => {
  try {
    const plans = await listMaintenancePlans();
    return res.json({ plans });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando planes mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los planes de mantenimiento.' });
  }
};

export const listMaintenanceOrdersController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listMaintenanceOrders({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    });
    return res.json(result);
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando ordenes mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las ordenes de mantenimiento.' });
  }
};

export const startMaintenanceOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }

  try {
    const order = await startMaintenanceOrder(orderId, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de mantenimiento no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ORDER_START:${orderId}`, req.ip, orderId, 'helpdesk_maintenance_order');

    return res.json({
      message: 'Orden de mantenimiento iniciada correctamente.',
      order,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error iniciando orden mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo iniciar la orden de mantenimiento.' });
  }
};

export const rescheduleMaintenanceOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }

  const payload = getMaintenanceOrderReschedulePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Nueva fecha y justificacion son obligatorias.' });
  }

  try {
    const order = await rescheduleMaintenanceOrder(orderId, payload, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de mantenimiento no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ORDER_RESCHEDULE:${orderId}`, req.ip, orderId, 'helpdesk_maintenance_order');

    return res.json({
      message: 'Orden de mantenimiento reprogramada correctamente.',
      order,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error reprogramando orden mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo reprogramar la orden de mantenimiento.' });
  }
};
