import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type { AssignmentAuthorizationItem, AssignmentLetter, AssignmentLetterListRow, AssignmentLetterStatus } from '../types/models';

// Carta de asignacion de puesto REH-REG-008 (Fase 7).
const BASE = '/rh/assignment-letters';

export const listAssignmentAuthorizationItems = async (): Promise<AssignmentAuthorizationItem[]> => {
  const response = await api.get(`${BASE}/items`);
  return (asRecord(unwrapPayload(response.data))?.items as AssignmentAuthorizationItem[]) ?? [];
};

export const getPositionAuthorizations = async (positionId: number): Promise<number[]> => {
  const response = await api.get(`${BASE}/positions/${positionId}/authorizations`);
  return (asRecord(unwrapPayload(response.data))?.item_ids as number[]) ?? [];
};

export const setPositionAuthorizations = async (positionId: number, itemIds: number[]): Promise<number[]> => {
  const response = await api.put(`${BASE}/positions/${positionId}/authorizations`, { item_ids: itemIds });
  return (asRecord(unwrapPayload(response.data))?.item_ids as number[]) ?? [];
};

export const listAssignmentLetters = async (query: { status?: AssignmentLetterStatus; q?: string } = {}): Promise<AssignmentLetterListRow[]> => {
  const response = await api.get(BASE, { params: query });
  return (asRecord(unwrapPayload(response.data))?.rows as AssignmentLetterListRow[]) ?? [];
};

export const generatePendingAssignmentLetters = async (): Promise<string> => {
  const response = await api.post(`${BASE}/generate`);
  return String(asRecord(unwrapPayload(response.data))?.message ?? '');
};

export const getAssignmentLetter = async (id: number): Promise<AssignmentLetter> => {
  const response = await api.get(`${BASE}/${id}`);
  return asRecord(unwrapPayload(response.data))?.letter as AssignmentLetter;
};

export interface UpdateAssignmentLetterPayload {
  letter_date?: string;
  other_authorizations?: string | null;
  area_signatory_name?: string;
  director_signatory_name?: string;
  items?: Array<{ item_id: number; authorized: boolean }>;
}

export const updateAssignmentLetter = async (id: number, payload: UpdateAssignmentLetterPayload): Promise<AssignmentLetter> => {
  const response = await api.patch(`${BASE}/${id}`, payload);
  return asRecord(unwrapPayload(response.data))?.letter as AssignmentLetter;
};

export const closeAssignmentLetter = async (
  id: number,
  payload: { collaborator_signature: string; area_signature: string; director_signature: string },
): Promise<{ message: string; letter: AssignmentLetter }> => {
  const response = await api.post(`${BASE}/${id}/close`, payload);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return { message: String(data.message ?? ''), letter: data.letter as AssignmentLetter };
};

export const deleteAssignmentLetterDraft = async (id: number): Promise<void> => {
  await api.delete(`${BASE}/${id}`);
};

export const getAssignmentLetterPdfUrl = async (id: number): Promise<string> => {
  const response = await api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};
