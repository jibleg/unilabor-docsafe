import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type {
  AssetProgramOverview,
  CalendarFilters,
  CalendarResponse,
  CoverageSummary,
  MaintenanceOrderDetail,
  MaintenanceOrderEvidence,
  MaintenanceTemplate,
  MaintenanceTemplatePayload,
  OrderExecutionPayload,
  ProgramKpis,
  ProgramPayload,
  ProgramRoutine,
  RoutineInput,
} from '../types/helpdesk-program';

/** Cliente del Programa de Mantenimiento (Help Desk). */

const filtersToParams = (filters: CalendarFilters): Record<string, string> => {
  const params: Record<string, string> = {};
  if (filters.unit_id) params.unit_id = filters.unit_id;
  if (filters.area_id) params.area_id = filters.area_id;
  if (filters.responsible_employee_id) params.responsible_employee_id = filters.responsible_employee_id;
  if (filters.responsible_user_id) params.responsible_user_id = filters.responsible_user_id;
  if (filters.category_id) params.category_id = filters.category_id;
  if (filters.criticality_id) params.criticality_id = filters.criticality_id;
  if (filters.asset_id) params.asset_id = filters.asset_id;
  if (filters.kind && filters.kind.length > 0) params.kind = filters.kind.join(',');
  if (filters.status && filters.status.length > 0) params.status = filters.status.join(',');
  if (filters.search) params.search = filters.search;
  if (filters.mine) params.mine = 'true';
  return params;
};

export const fetchProgramCalendar = async (from: string, to: string, filters: CalendarFilters): Promise<CalendarResponse> => {
  const response = await api.get('/helpdesk/maintenance-program/calendar', { params: { from, to, ...filtersToParams(filters) } });
  return unwrapPayload(response.data) as CalendarResponse;
};

export const fetchProgramKpis = async (from: string, to: string, filters: CalendarFilters): Promise<ProgramKpis> => {
  const response = await api.get('/helpdesk/maintenance-program/kpis', { params: { from, to, ...filtersToParams(filters) } });
  return asRecord(unwrapPayload(response.data))?.kpis as ProgramKpis;
};

export const downloadProgramReportPdf = async (from: string, to: string, filters: CalendarFilters): Promise<Blob> => {
  const response = await api.get('/helpdesk/maintenance-program/report.pdf', { params: { from, to, ...filtersToParams(filters) }, responseType: 'blob' });
  return response.data as Blob;
};

export const fetchProgramCoverage = async (filters: CalendarFilters): Promise<CoverageSummary> => {
  const response = await api.get('/helpdesk/maintenance-program/coverage', { params: filtersToParams(filters) });
  return asRecord(unwrapPayload(response.data))?.coverage as CoverageSummary;
};

export const fetchMaintenanceOrderDetail = async (
  orderId: number,
): Promise<{ order: MaintenanceOrderDetail; evidence: MaintenanceOrderEvidence[] }> => {
  const response = await api.get(`/helpdesk/maintenance/orders/${orderId}`);
  const payload = asRecord(unwrapPayload(response.data));
  return { order: payload?.order as MaintenanceOrderDetail, evidence: (payload?.evidence as MaintenanceOrderEvidence[]) ?? [] };
};

export const executeMaintenanceOrder = async (
  orderId: number,
  payload: OrderExecutionPayload,
): Promise<{ message: string; order: MaintenanceOrderDetail }> => {
  const response = await api.post(`/helpdesk/maintenance/orders/${orderId}/execute`, payload);
  return response.data as { message: string; order: MaintenanceOrderDetail };
};

export const validateMaintenanceOrderSignature = async (
  orderId: number,
  responsibleSignature: string,
  validationNotes?: string | null,
): Promise<{ message: string; order: MaintenanceOrderDetail }> => {
  const response = await api.post(`/helpdesk/maintenance/orders/${orderId}/validate`, {
    responsible_signature: responsibleSignature,
    validation_notes: validationNotes ?? null,
  });
  return response.data as { message: string; order: MaintenanceOrderDetail };
};

export const uploadMaintenanceOrderEvidence = async (
  orderId: number,
  file: File,
  title: string,
): Promise<MaintenanceOrderEvidence> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  const response = await api.post(`/helpdesk/maintenance/orders/${orderId}/evidence`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return asRecord(unwrapPayload(response.data))?.document as MaintenanceOrderEvidence;
};

// --- Plantillas ---------------------------------------------------------------
export const listMaintenanceTemplates = async (includeInactive = false): Promise<MaintenanceTemplate[]> => {
  const response = await api.get('/helpdesk/maintenance-templates', { params: includeInactive ? { include_inactive: 'true' } : {} });
  return (asRecord(unwrapPayload(response.data))?.templates as MaintenanceTemplate[]) ?? [];
};

export const createMaintenanceTemplate = async (payload: MaintenanceTemplatePayload): Promise<MaintenanceTemplate> => {
  const response = await api.post('/helpdesk/maintenance-templates', payload);
  return asRecord(unwrapPayload(response.data))?.template as MaintenanceTemplate;
};

export const updateMaintenanceTemplate = async (templateId: number, payload: MaintenanceTemplatePayload): Promise<MaintenanceTemplate> => {
  const response = await api.put(`/helpdesk/maintenance-templates/${templateId}`, payload);
  return asRecord(unwrapPayload(response.data))?.template as MaintenanceTemplate;
};

export const setMaintenanceTemplateActive = async (templateId: number, isActive: boolean): Promise<void> => {
  await api.patch(`/helpdesk/maintenance-templates/${templateId}/active`, { is_active: isActive });
};

export const proposeRoutinesFromTemplate = async (templateId: number, startsOn: string): Promise<RoutineInput[]> => {
  const response = await api.get(`/helpdesk/maintenance-templates/${templateId}/propose`, { params: { starts_on: startsOn } });
  return (asRecord(unwrapPayload(response.data))?.routines as RoutineInput[]) ?? [];
};

// --- Programa por activo ------------------------------------------------------
export const fetchAssetProgram = async (assetId: number): Promise<AssetProgramOverview> => {
  const response = await api.get(`/helpdesk/maintenance-program/assets/${assetId}`);
  return unwrapPayload(response.data) as AssetProgramOverview;
};

export const saveAssetProgramVersion = async (assetId: number, payload: ProgramPayload): Promise<{ message: string } & AssetProgramOverview> => {
  const response = await api.post(`/helpdesk/maintenance-program/assets/${assetId}`, payload);
  return response.data as { message: string } & AssetProgramOverview;
};

export const setProgramProjectionMonths = async (programId: number, months: number): Promise<{ message: string; created: number }> => {
  const response = await api.patch(`/helpdesk/maintenance-program/programs/${programId}/projection`, { projection_months: months });
  return response.data as { message: string; created: number };
};

export const updateProgramRoutine = async (planId: number, payload: RoutineInput): Promise<{ message: string; routine: ProgramRoutine }> => {
  const response = await api.put(`/helpdesk/maintenance-program/routines/${planId}`, payload);
  return response.data as { message: string; routine: ProgramRoutine };
};

export const pauseProgramRoutine = async (planId: number, reason: string): Promise<{ message: string; routine: ProgramRoutine }> => {
  const response = await api.post(`/helpdesk/maintenance-program/routines/${planId}/pause`, { reason });
  return response.data as { message: string; routine: ProgramRoutine };
};

export const resumeProgramRoutine = async (planId: number, nextDueOn: string | null): Promise<{ message: string; routine: ProgramRoutine }> => {
  const response = await api.post(`/helpdesk/maintenance-program/routines/${planId}/resume`, { next_due_on: nextDueOn });
  return response.data as { message: string; routine: ProgramRoutine };
};

export const deactivateProgramRoutine = async (planId: number): Promise<{ message: string }> => {
  const response = await api.delete(`/helpdesk/maintenance-program/routines/${planId}`);
  return response.data as { message: string };
};

export interface TicketPostRepairVerification {
  id: number;
  order_code: string;
  scheduled_for: string;
}

export const fetchTicketPostRepairVerification = async (ticketId: number): Promise<TicketPostRepairVerification | null> => {
  const response = await api.get(`/helpdesk/maintenance-program/tickets/${ticketId}/verification`);
  return (asRecord(unwrapPayload(response.data))?.verification as TicketPostRepairVerification | null) ?? null;
};
