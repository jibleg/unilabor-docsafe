import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type {
  PositionSupervisionConfig,
  SupervisionAreaSignatory,
  SupervisionChecklist,
  SupervisionGenerateDraftsResult,
  SupervisionChecklistPage,
  SupervisionChecklistStatus,
  SupervisionFormItem,
  SupervisionPendingRow,
  SupervisionPracticalOutcome,
  SupervisionResult,
  SupervisionType,
} from '../types/models';

/** API de la Lista de verificacion de Supervision ANA-REG-060. */

const BASE = '/rh/supervision-checklists';

export const listSupervisionFormItems = async (): Promise<SupervisionFormItem[]> => {
  const response = await api.get(`${BASE}/items`);
  return (asRecord(unwrapPayload(response.data))?.items as SupervisionFormItem[]) ?? [];
};

export const getPositionSupervisionConfig = async (positionId: number): Promise<PositionSupervisionConfig> => {
  const response = await api.get(`${BASE}/positions/${positionId}/na-items`);
  return asRecord(unwrapPayload(response.data))?.config as PositionSupervisionConfig;
};

export const setPositionSupervisionConfig = async (positionId: number, itemIds: number[]): Promise<PositionSupervisionConfig> => {
  const response = await api.put(`${BASE}/positions/${positionId}/na-items`, { item_ids: itemIds });
  return asRecord(unwrapPayload(response.data))?.config as PositionSupervisionConfig;
};

export interface SupervisionPendingQuery {
  q?: string;
  area?: string;
  include_passed?: boolean;
}

export const listSupervisionPending = async (query: SupervisionPendingQuery = {}): Promise<SupervisionPendingRow[]> => {
  const params: Record<string, string> = {};
  if (query.q) params.q = query.q;
  if (query.area) params.area = query.area;
  if (query.include_passed) params.include_passed = 'true';
  const response = await api.get(`${BASE}/pending`, { params });
  return (asRecord(unwrapPayload(response.data))?.rows as SupervisionPendingRow[]) ?? [];
};

export interface SupervisionListQuery {
  status?: SupervisionChecklistStatus;
  employee_id?: number;
  position_id?: number;
  enrollment_id?: number;
  q?: string;
  page?: number;
  limit?: number;
}

export const listSupervisionChecklists = async (query: SupervisionListQuery = {}): Promise<SupervisionChecklistPage> => {
  const params: Record<string, string | number> = {};
  if (query.status) params.status = query.status;
  if (query.employee_id) params.employee_id = query.employee_id;
  if (query.position_id) params.position_id = query.position_id;
  if (query.enrollment_id) params.enrollment_id = query.enrollment_id;
  if (query.q) params.q = query.q;
  params.page = query.page ?? 1;
  params.limit = query.limit ?? 20;
  const response = await api.get(BASE, { params });
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    rows: (data.rows as SupervisionChecklistPage['rows']) ?? [],
    total: Number(data.total ?? 0),
    page: Number(data.page ?? 1),
    limit: Number(data.limit ?? 20),
    total_pages: Number(data.total_pages ?? 1),
  };
};

export interface CreateSupervisionChecklistPayload {
  /** Opcionales cuando viene enrollment_id (se resuelven de la inscripcion de la Fase 6). */
  employee_id?: number | null;
  position_id?: number | null;
  enrollment_id?: number | null;
  supervision_date: string;
  supervision_type?: SupervisionType;
  supervisor_name?: string | null;
  area_responsible_name?: string | null;
  area_name?: string | null;
  reuse_draft?: boolean;
}

export const createSupervisionChecklist = async (payload: CreateSupervisionChecklistPayload): Promise<SupervisionChecklist> => {
  const response = await api.post(BASE, payload);
  return asRecord(unwrapPayload(response.data))?.checklist as SupervisionChecklist;
};

export const getSupervisionChecklist = async (id: number): Promise<SupervisionChecklist> => {
  const response = await api.get(`${BASE}/${id}`);
  return asRecord(unwrapPayload(response.data))?.checklist as SupervisionChecklist;
};

export interface SupervisionHeaderPayload {
  supervision_date?: string;
  supervision_type?: SupervisionType;
  area_name?: string | null;
  supervisor_name?: string;
  area_responsible_name?: string;
  sgc_follow_up_required?: boolean;
  sgc_reference?: string | null;
  supervisor_comments?: string | null;
}

export const updateSupervisionChecklist = async (id: number, payload: SupervisionHeaderPayload): Promise<SupervisionChecklist> => {
  const response = await api.patch(`${BASE}/${id}`, payload);
  return asRecord(unwrapPayload(response.data))?.checklist as SupervisionChecklist;
};

export interface SupervisionResultPayload {
  item_id: number;
  result: SupervisionResult | null;
  observations?: string | null;
}

export const saveSupervisionResults = async (id: number, results: SupervisionResultPayload[]): Promise<SupervisionChecklist> => {
  const response = await api.put(`${BASE}/${id}/results`, { results });
  return asRecord(unwrapPayload(response.data))?.checklist as SupervisionChecklist;
};

export interface CloseSupervisionChecklistPayload {
  supervisor_signature: string;
  area_responsible_signature: string;
  employee_signature?: string | null;
  is_final?: boolean;
  header?: SupervisionHeaderPayload;
}

export interface CloseSupervisionChecklistResult {
  message: string;
  checklist: SupervisionChecklist;
  practical: SupervisionPracticalOutcome | null;
}

export const closeSupervisionChecklist = async (id: number, payload: CloseSupervisionChecklistPayload): Promise<CloseSupervisionChecklistResult> => {
  const response = await api.post(`${BASE}/${id}/close`, payload);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    message: String(data.message ?? ''),
    checklist: data.checklist as SupervisionChecklist,
    practical: (data.practical as SupervisionPracticalOutcome | null) ?? null,
  };
};

export const deleteSupervisionDraft = async (id: number): Promise<void> => {
  await api.delete(`${BASE}/${id}`);
};

/** PDF (borrador con marca de agua o cerrado con firmas) como URL de blob para abrir en pestaña nueva. */
export const getSupervisionChecklistPdfUrl = async (id: number): Promise<string> => {
  const response = await api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

export const listAreaSignatories = async (): Promise<SupervisionAreaSignatory[]> => {
  const response = await api.get(`${BASE}/signatories`);
  return (asRecord(unwrapPayload(response.data))?.rows as SupervisionAreaSignatory[]) ?? [];
};

export interface AreaSignatoryPayload {
  area_name: string;
  supervisor_name: string;
  area_responsible_name: string;
}

export const saveAreaSignatories = async (rows: AreaSignatoryPayload[]): Promise<SupervisionAreaSignatory[]> => {
  const response = await api.put(`${BASE}/signatories`, { rows });
  return (asRecord(unwrapPayload(response.data))?.rows as SupervisionAreaSignatory[]) ?? [];
};

export const generateSupervisionDrafts = async (employeeIds?: number[]): Promise<{ message: string; result: SupervisionGenerateDraftsResult }> => {
  const response = await api.post(`${BASE}/pending/generate`, employeeIds ? { employee_ids: employeeIds } : {});
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return { message: String(data.message ?? ''), result: data.result as SupervisionGenerateDraftsResult };
};
