import api from './axios';
import { asRecord, unwrapPayload, getArrayFromPayload } from './service.shared';
import type {
  HelpdeskCalibrationPlanPayload,
  HelpdeskCalibrationOrderClosePayload,
  HelpdeskCalibrationOrderReschedulePayload,
  HelpdeskScheduleDatesPayload,
} from './service.shared';
import {
  normalizeCalibrationCatalogs,
  normalizeCalibrationPlan,
  normalizeCalibrationOrder,
} from './service.normalizers';
import type {
  HelpdeskCalibrationCatalogs,
  HelpdeskCalibrationPlan,
  HelpdeskCalibrationOrder,
} from '../types/models';

export const listCalibrationCatalogs = async (): Promise<HelpdeskCalibrationCatalogs> => {
  const response = await api.get('/helpdesk/calibration-catalogs');
  const payload = asRecord(unwrapPayload(response.data));
  return normalizeCalibrationCatalogs(payload?.catalogs ?? payload);
};

export const listCalibrationPlans = async (): Promise<HelpdeskCalibrationPlan[]> => {
  const response = await api.get('/helpdesk/calibration/plans');
  return getArrayFromPayload(response.data, ['plans', 'items', 'results'])
    .map(normalizeCalibrationPlan)
    .filter((plan): plan is HelpdeskCalibrationPlan => plan !== null);
};

export const listCalibrationOrders = async (): Promise<HelpdeskCalibrationOrder[]> => {
  const response = await api.get('/helpdesk/calibration/orders');
  return getArrayFromPayload(response.data, ['data', 'orders', 'items', 'results'])
    .map(normalizeCalibrationOrder)
    .filter((order): order is HelpdeskCalibrationOrder => order !== null);
};

export const createCalibrationPlan = async (
  payload: HelpdeskCalibrationPlanPayload,
): Promise<HelpdeskCalibrationPlan> => {
  const response = await api.post('/helpdesk/calibration/plans', payload);
  const parsed = normalizeCalibrationPlan(asRecord(unwrapPayload(response.data))?.plan ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar el plan de calibracion creado');
  }
  return parsed;
};

export const updateCalibrationPlanById = async (
  planId: number,
  payload: HelpdeskCalibrationPlanPayload,
): Promise<HelpdeskCalibrationPlan | null> => {
  const response = await api.patch(`/helpdesk/calibration/plans/${planId}`, payload);
  return normalizeCalibrationPlan(asRecord(unwrapPayload(response.data))?.plan ?? unwrapPayload(response.data));
};

export const loadCalibrationSchedule = async (
  planId: number,
  payload: HelpdeskScheduleDatesPayload,
): Promise<HelpdeskCalibrationPlan | null> => {
  const response = await api.post(`/helpdesk/calibration/plans/${planId}/schedule`, payload);
  return normalizeCalibrationPlan(asRecord(unwrapPayload(response.data))?.plan ?? unwrapPayload(response.data));
};

export const startCalibrationOrderById = async (orderId: number): Promise<HelpdeskCalibrationOrder | null> => {
  const response = await api.post(`/helpdesk/calibration/orders/${orderId}/start`);
  return normalizeCalibrationOrder(asRecord(unwrapPayload(response.data))?.order ?? unwrapPayload(response.data));
};

export const rescheduleCalibrationOrderById = async (
  orderId: number,
  payload: HelpdeskCalibrationOrderReschedulePayload,
): Promise<HelpdeskCalibrationOrder | null> => {
  const response = await api.post(`/helpdesk/calibration/orders/${orderId}/reschedule`, payload);
  return normalizeCalibrationOrder(asRecord(unwrapPayload(response.data))?.order ?? unwrapPayload(response.data));
};

export const closeCalibrationOrderById = async (
  orderId: number,
  payload: HelpdeskCalibrationOrderClosePayload,
): Promise<HelpdeskCalibrationOrder | null> => {
  const response = await api.post(`/helpdesk/calibration/orders/${orderId}/close`, payload);
  return normalizeCalibrationOrder(asRecord(unwrapPayload(response.data))?.order ?? unwrapPayload(response.data));
};
