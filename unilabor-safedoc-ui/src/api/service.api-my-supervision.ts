import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type { SupervisionChecklist, SupervisionChecklistListRow, SupervisionPracticalOutcome, SupervisionResult } from '../types/models';

// "Mis supervisiones" (ANA-REG-060, Fase 6): el supervisor asignado califica y
// firma con su cuenta; el responsable del area avala y cierra.

const BASE = '/my/supervisions';

export type MySupervisionRole = 'supervisor' | 'responsible';

export interface MySupervisionsOverview {
  to_supervise: SupervisionChecklistListRow[];
  to_endorse: SupervisionChecklistListRow[];
  waiting_endorsement: SupervisionChecklistListRow[];
}

export const listMySupervisions = async (): Promise<MySupervisionsOverview> => {
  const response = await api.get(BASE);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    to_supervise: (data.to_supervise as SupervisionChecklistListRow[]) ?? [],
    to_endorse: (data.to_endorse as SupervisionChecklistListRow[]) ?? [],
    waiting_endorsement: (data.waiting_endorsement as SupervisionChecklistListRow[]) ?? [],
  };
};

export const getMySupervision = async (id: number): Promise<{ checklist: SupervisionChecklist; roles: MySupervisionRole[] }> => {
  const response = await api.get(`${BASE}/${id}`);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return { checklist: data.checklist as SupervisionChecklist, roles: (data.roles as MySupervisionRole[]) ?? [] };
};

export const saveMySupervisionResults = async (
  id: number,
  results: Array<{ item_id: number; result: SupervisionResult | null; observations: string | null }>,
): Promise<SupervisionChecklist> => {
  const response = await api.put(`${BASE}/${id}/results`, { results });
  return asRecord(unwrapPayload(response.data))?.checklist as SupervisionChecklist;
};

export interface MySupervisionSignPayload {
  signature: string;
  sgc_follow_up_required: boolean;
  sgc_reference: string | null;
  supervisor_comments: string | null;
}

export const signMySupervision = async (id: number, payload: MySupervisionSignPayload): Promise<{ message: string; checklist: SupervisionChecklist }> => {
  const response = await api.post(`${BASE}/${id}/sign`, payload);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return { message: String(data.message ?? ''), checklist: data.checklist as SupervisionChecklist };
};

export const endorseMySupervision = async (
  id: number,
  signature: string,
): Promise<{ message: string; checklist: SupervisionChecklist; practical: SupervisionPracticalOutcome | null }> => {
  const response = await api.post(`${BASE}/${id}/endorse`, { signature });
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    message: String(data.message ?? ''),
    checklist: data.checklist as SupervisionChecklist,
    practical: (data.practical as SupervisionPracticalOutcome | null) ?? null,
  };
};

export const getMySupervisionPdfUrl = async (id: number): Promise<string> => {
  const response = await api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};
