import api from './axios';
import { asRecord, unwrapPayload, getArrayFromPayload } from './service.shared';
import { normalizeHelpdeskAsset, normalizeHelpdeskHandover } from './service.normalizers';
import type {
  HelpdeskAsset,
  HelpdeskHandover,
  HelpdeskHandoverPayload,
  HelpdeskHandoverSignPayload,
  HelpdeskHandoverStatus,
} from '../types/models';

export interface HelpdeskHandoverFilters {
  status?: HelpdeskHandoverStatus | null;
  areaId?: number | null;
  receivedByUserId?: string | null;
}

export const listHelpdeskHandovers = async (
  filters: HelpdeskHandoverFilters = {},
): Promise<HelpdeskHandover[]> => {
  const params: Record<string, string | number> = {};
  if (filters.status) {
    params.status = filters.status;
  }
  if (filters.areaId) {
    params.area_id = filters.areaId;
  }
  if (filters.receivedByUserId) {
    params.received_by_user_id = filters.receivedByUserId;
  }
  const response = await api.get('/helpdesk/handovers', { params });
  return getArrayFromPayload(response.data, ['handovers', 'items', 'results'])
    .map(normalizeHelpdeskHandover)
    .filter((handover): handover is HelpdeskHandover => handover !== null);
};

export const getHelpdeskHandover = async (handoverId: number): Promise<HelpdeskHandover | null> => {
  const response = await api.get(`/helpdesk/handovers/${handoverId}`);
  const payload = unwrapPayload(response.data);
  return normalizeHelpdeskHandover(asRecord(payload)?.handover ?? payload);
};

// Activos del area pendientes de entrega (sin acta firmada).
export const listHandoverPendingAssets = async (areaId: number): Promise<HelpdeskAsset[]> => {
  const response = await api.get('/helpdesk/handovers/pending-assets', { params: { area_id: areaId } });
  return getArrayFromPayload(response.data, ['assets', 'items', 'results'])
    .map(normalizeHelpdeskAsset)
    .filter((asset): asset is HelpdeskAsset => asset !== null);
};

export const createHelpdeskHandover = async (
  payload: HelpdeskHandoverPayload,
): Promise<HelpdeskHandover> => {
  const response = await api.post('/helpdesk/handovers', payload);
  const parsed = normalizeHelpdeskHandover(
    asRecord(unwrapPayload(response.data))?.handover ?? unwrapPayload(response.data),
  );
  if (!parsed) {
    throw new Error('No se pudo interpretar el acta creada');
  }
  return parsed;
};

export const updateHelpdeskHandover = async (
  handoverId: number,
  payload: HelpdeskHandoverPayload,
): Promise<HelpdeskHandover | null> => {
  const response = await api.patch(`/helpdesk/handovers/${handoverId}`, payload);
  return normalizeHelpdeskHandover(asRecord(unwrapPayload(response.data))?.handover ?? unwrapPayload(response.data));
};

export const signHelpdeskHandover = async (
  handoverId: number,
  payload: HelpdeskHandoverSignPayload,
): Promise<HelpdeskHandover | null> => {
  const response = await api.post(`/helpdesk/handovers/${handoverId}/sign`, payload);
  return normalizeHelpdeskHandover(asRecord(unwrapPayload(response.data))?.handover ?? unwrapPayload(response.data));
};

export const voidHelpdeskHandover = async (
  handoverId: number,
  reason: string,
): Promise<HelpdeskHandover | null> => {
  const response = await api.post(`/helpdesk/handovers/${handoverId}/void`, { reason });
  return normalizeHelpdeskHandover(asRecord(unwrapPayload(response.data))?.handover ?? unwrapPayload(response.data));
};

export const deleteHelpdeskHandover = async (handoverId: number): Promise<void> => {
  await api.delete(`/helpdesk/handovers/${handoverId}`);
};

// El PDF requiere el token en el header: se descarga como blob y se abre por object URL.
export const fetchHelpdeskHandoverActaUrl = async (handoverId: number): Promise<string> => {
  const response = await api.get(`/helpdesk/handovers/${handoverId}/acta`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};
