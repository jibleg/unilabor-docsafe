import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  addCalibrationScheduleDates,
  closeCalibrationOrder,
  createCalibrationPlan,
  listCalibrationCatalogs,
  listCalibrationOrders,
  listCalibrationPlans,
  rescheduleCalibrationOrder,
  startCalibrationOrder,
  updateCalibrationPlan,
} from '../services/helpdesk-calibration.service';
import {
  getNumberId,
  mapHelpdeskError,
  getCalibrationPlanPayload,
  getCalibrationOrderClosePayload,
  getCalibrationOrderReschedulePayload,
  getScheduleDatesPayload,
  logHelpdeskAudit,
} from './helpdesk-controller.shared';

export const listCalibrationCatalogsController = async (_req: AuthRequest, res: Response) => {
  try {
    const catalogs = await listCalibrationCatalogs();
    return res.json({ catalogs });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando catalogos calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los catalogos de calibracion.' });
  }
};

export const listCalibrationPlansController = async (_req: AuthRequest, res: Response) => {
  try {
    const plans = await listCalibrationPlans();
    return res.json({ plans });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando planes calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los planes de calibracion.' });
  }
};

export const listCalibrationOrdersController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listCalibrationOrders({
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

    console.error('Error listando ordenes calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las ordenes de calibracion.' });
  }
};

export const createCalibrationPlanController = async (req: AuthRequest, res: Response) => {
  const payload = getCalibrationPlanPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Activo, titulo, inicio y proxima calibracion son obligatorios.' });
  }

  try {
    const plan = await createCalibrationPlan(payload, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_CALIBRATION_PLAN_CREATE:${plan.id}`, req.ip, plan.id, 'helpdesk_calibration_plan');

    return res.status(201).json({
      message: 'Plan de calibracion creado correctamente.',
      plan,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando plan calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo crear el plan de calibracion.' });
  }
};

export const updateCalibrationPlanController = async (req: AuthRequest, res: Response) => {
  const planId = getNumberId(req.params.id);
  if (!planId) {
    return res.status(400).json({ message: 'ID de plan invalido.' });
  }

  const payload = getCalibrationPlanPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Activo, titulo, inicio y proxima calibracion son obligatorios.' });
  }

  try {
    const plan = await updateCalibrationPlan(planId, payload, req.user?.id ?? null);
    if (!plan) {
      return res.status(404).json({ message: 'Plan de calibracion no encontrado.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_CALIBRATION_PLAN_UPDATE:${planId}`, req.ip, planId, 'helpdesk_calibration_plan');

    return res.json({
      message: 'Plan de calibracion actualizado correctamente.',
      plan,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando plan calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el plan de calibracion.' });
  }
};

export const addCalibrationScheduleController = async (req: AuthRequest, res: Response) => {
  const planId = getNumberId(req.params.id);
  if (!planId) {
    return res.status(400).json({ message: 'ID de plan invalido.' });
  }

  const dates = getScheduleDatesPayload(req.body);
  if (!dates) {
    return res.status(400).json({ message: 'Agrega al menos una fecha del cronograma.' });
  }

  try {
    const plan = await addCalibrationScheduleDates(planId, dates, req.user?.id ?? null);
    if (!plan) {
      return res.status(404).json({ message: 'Plan de calibracion no encontrado.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_CALIBRATION_SCHEDULE_LOAD:${planId}`, req.ip, planId, 'helpdesk_calibration_plan');

    return res.json({
      message: 'Cronograma cargado correctamente.',
      plan,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error cargando cronograma calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo cargar el cronograma de calibracion.' });
  }
};

export const startCalibrationOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }

  try {
    const order = await startCalibrationOrder(orderId, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de calibracion no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_CALIBRATION_ORDER_START:${orderId}`, req.ip, orderId, 'helpdesk_calibration_order');

    return res.json({
      message: 'Orden de calibracion iniciada correctamente.',
      order,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error iniciando orden calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo iniciar la orden de calibracion.' });
  }
};

export const rescheduleCalibrationOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }

  const payload = getCalibrationOrderReschedulePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Nueva fecha y justificacion son obligatorias.' });
  }

  try {
    const order = await rescheduleCalibrationOrder(orderId, payload, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de calibracion no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_CALIBRATION_ORDER_RESCHEDULE:${orderId}`, req.ip, orderId, 'helpdesk_calibration_order');

    return res.json({
      message: 'Orden de calibracion reprogramada correctamente.',
      order,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error reprogramando orden calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo reprogramar la orden de calibracion.' });
  }
};

export const closeCalibrationOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }

  const payload = getCalibrationOrderClosePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Fecha de calibracion y resultado son obligatorios.' });
  }

  try {
    const order = await closeCalibrationOrder(orderId, payload, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de calibracion no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_CALIBRATION_ORDER_CLOSE:${orderId}`, req.ip, orderId, 'helpdesk_calibration_order');

    return res.json({
      message: 'Orden de calibracion cerrada correctamente.',
      order,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error cerrando orden calibracion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo cerrar la orden de calibracion.' });
  }
};
