import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type { SupervisionChecklist, SupervisionChecklistListRow, SupervisionResult } from '../types/models';

// "Mis supervisiones" (ANA-REG-060, Fase 6): el supervisor asignado califica
// sus listas y las envía a firma. La firma ocurre en el Buzón de firmas.

const BASE = '/my/supervisions';

export interface MySupervisionsOverview {
  to_supervise: SupervisionChecklistListRow[];
  in_signature: SupervisionChecklistListRow[];
}

export const listMySupervisions = async (): Promise<MySupervisionsOverview> => {
  const response = await api.get(BASE);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    to_supervise: (data.to_supervise as SupervisionChecklistListRow[]) ?? [],
    in_signature: (data.in_signature as SupervisionChecklistListRow[]) ?? [],
  };
};

export const getMySupervision = async (id: number): Promise<SupervisionChecklist> => {
  const response = await api.get(`${BASE}/${id}`);
  return asRecord(unwrapPayload(response.data))?.checklist as SupervisionChecklist;
};

export const saveMySupervisionResults = async (
  id: number,
  results: Array<{ item_id: number; result: SupervisionResult | null; observations: string | null }>,
): Promise<SupervisionChecklist> => {
  const response = await api.put(`${BASE}/${id}/results`, { results });
  return asRecord(unwrapPayload(response.data))?.checklist as SupervisionChecklist;
};

export interface MySupervisionSendPayload {
  sgc_follow_up_required: boolean;
  sgc_reference: string | null;
  supervisor_comments: string | null;
}

export const sendMySupervisionToSignature = async (id: number, payload: MySupervisionSendPayload): Promise<{ message: string; checklist: SupervisionChecklist }> => {
  const response = await api.post(`${BASE}/${id}/send-to-signature`, payload);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return { message: String(data.message ?? ''), checklist: data.checklist as SupervisionChecklist };
};

export const getMySupervisionPdfUrl = async (id: number): Promise<string> => {
  const response = await api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};
