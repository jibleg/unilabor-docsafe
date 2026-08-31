import api from './axios';
import { unwrapPayload, asRecord } from './service.shared';
import type { RhEmployeePosition, RhPosition, RhPositionCompetency, RhPositionDocument } from '../types/models';

// Catalogo minimo de puesto/categoria (REH-MAN-001) para el modulo de
// induccion: nombre + competencias tecnicas + documentos obligatorios.

export const listPositions = async (includeInactive = false): Promise<RhPosition[]> => {
  const response = await api.get('/rh/positions', { params: includeInactive ? { include_inactive: 'true' } : {} });
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.positions as RhPosition[]) ?? [];
};

export const getPositionById = async (id: number): Promise<RhPosition | null> => {
  const response = await api.get(`/rh/positions/${id}`);
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.position as RhPosition) ?? null;
};

export interface PositionPayload {
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

export const createPosition = async (payload: PositionPayload): Promise<RhPosition> => {
  const response = await api.post('/rh/positions', payload);
  const data = asRecord(unwrapPayload(response.data));
  return data?.position as RhPosition;
};

export const updatePosition = async (id: number, payload: Partial<PositionPayload>): Promise<RhPosition> => {
  const response = await api.patch(`/rh/positions/${id}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return data?.position as RhPosition;
};

export const deletePosition = async (id: number): Promise<void> => {
  await api.delete(`/rh/positions/${id}`);
};

export const addPositionCompetency = async (
  positionId: number,
  competencyText: string,
  sortOrder = 0,
  criticality: 'A' | 'M' | 'B' = 'M',
): Promise<RhPositionCompetency> => {
  const response = await api.post(`/rh/positions/${positionId}/competencies`, {
    competency_text: competencyText,
    sort_order: sortOrder,
    criticality,
  });
  const data = asRecord(unwrapPayload(response.data));
  return data?.competency as RhPositionCompetency;
};

export const deletePositionCompetency = async (competencyId: number): Promise<void> => {
  await api.delete(`/rh/positions/competencies/${competencyId}`);
};

export interface DocumentLookupResult {
  id: string;
  title: string;
  code: string;
}

export const lookupDocumentByCode = async (code: string): Promise<DocumentLookupResult | null> => {
  try {
    const response = await api.get('/rh/documents/lookup', { params: { code } });
    const data = asRecord(unwrapPayload(response.data));
    return (data?.document as DocumentLookupResult) ?? null;
  } catch {
    return null;
  }
};

export const addPositionDocument = async (
  positionId: number,
  documentId: string,
  sortOrder = 0,
): Promise<RhPositionDocument> => {
  const response = await api.post(`/rh/positions/${positionId}/documents`, {
    document_id: documentId,
    sort_order: sortOrder,
  });
  const data = asRecord(unwrapPayload(response.data));
  return data?.document as RhPositionDocument;
};

export const removePositionDocument = async (positionDocumentId: number): Promise<void> => {
  await api.delete(`/rh/positions/documents/${positionDocumentId}`);
};

// --- Colaborador <-> puesto (M:N) --------------------------------------------

export const listEmployeePositions = async (
  employeeId: number,
  includeInactive = false,
): Promise<RhEmployeePosition[]> => {
  const response = await api.get(`/rh/employees/${employeeId}/positions`, {
    params: includeInactive ? { include_inactive: 'true' } : {},
  });
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.positions as RhEmployeePosition[]) ?? [];
};

export const assignEmployeePosition = async (
  employeeId: number,
  positionId: number,
): Promise<RhEmployeePosition> => {
  const response = await api.post(`/rh/employees/${employeeId}/positions`, { position_id: positionId });
  const data = asRecord(unwrapPayload(response.data));
  return data?.assignment as RhEmployeePosition;
};

export const endEmployeePosition = async (employeePositionId: number): Promise<void> => {
  await api.delete(`/rh/employee-positions/${employeePositionId}`);
};
