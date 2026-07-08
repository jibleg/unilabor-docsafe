import api from './axios';
import { asRecord, unwrapPayload, getArrayFromPayload } from './service.shared';
import { normalizeHelpdeskAssetMovement } from './service.normalizers';
import type { HelpdeskAssetMovement, HelpdeskAssetMovementPayload } from '../types/models';

export const listHelpdeskAssetMovements = async (assetId?: number): Promise<HelpdeskAssetMovement[]> => {
  const response = await api.get('/helpdesk/movements', {
    params: assetId ? { asset_id: assetId } : undefined,
  });
  return getArrayFromPayload(response.data, ['movements', 'items', 'results'])
    .map(normalizeHelpdeskAssetMovement)
    .filter((movement): movement is HelpdeskAssetMovement => movement !== null);
};

export const createHelpdeskAssetMovement = async (
  payload: HelpdeskAssetMovementPayload,
): Promise<HelpdeskAssetMovement> => {
  const response = await api.post('/helpdesk/movements', payload);
  const parsed = normalizeHelpdeskAssetMovement(
    asRecord(unwrapPayload(response.data))?.movement ?? unwrapPayload(response.data),
  );
  if (!parsed) {
    throw new Error('No se pudo interpretar el movimiento creado');
  }
  return parsed;
};

// Firma electrónica del movimiento (evidencia). Se descarga como blob (token en header).
export const fetchMovementSignatureUrl = async (
  movementId: number,
  party: 'performed' | 'responsible',
): Promise<string> => {
  const response = await api.get(`/helpdesk/movements/${movementId}/signature`, {
    params: { party },
    responseType: 'blob',
  });
  return URL.createObjectURL(response.data as Blob);
};
