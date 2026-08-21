import api from './axios';
import { asRecord, getArrayFromPayload, unwrapPayload } from './service.shared';
import type { ClassificationPayload } from './service.shared';
import type { Classification, ClassificationType } from '../types/models';

// Catalogo compartido de Clasificacion (proveedores/clientes). Un solo
// catalogo con el campo `type` distingue a que lado pertenece cada fila.

export interface ClassificationListQuery {
  type: ClassificationType;
  includeInactive?: boolean;
}

export const listClassifications = async (query: ClassificationListQuery): Promise<Classification[]> => {
  const response = await api.get('/providers/classifications', {
    params: {
      type: query.type,
      ...(query.includeInactive ? { includeInactive: true } : {}),
    },
  });
  return getArrayFromPayload(response.data, ['classifications', 'data']) as Classification[];
};

export const createClassification = async (payload: ClassificationPayload): Promise<Classification> => {
  const response = await api.post('/providers/classifications', payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.classification ?? unwrapPayload(response.data)) as Classification;
};

export const updateClassification = async (
  classificationId: number,
  payload: Partial<ClassificationPayload>,
): Promise<Classification> => {
  const response = await api.patch(`/providers/classifications/${classificationId}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.classification ?? unwrapPayload(response.data)) as Classification;
};

export const deactivateClassification = async (classificationId: number): Promise<Classification> => {
  const response = await api.post(`/providers/classifications/${classificationId}/deactivate`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.classification ?? unwrapPayload(response.data)) as Classification;
};

export const deleteClassification = async (classificationId: number): Promise<void> => {
  await api.delete(`/providers/classifications/${classificationId}`);
};
