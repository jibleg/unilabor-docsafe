import api from './axios';
import { unwrapPayload, asRecord } from './service.shared';
import type {
  RhInductionChecklistItem,
  RhInductionChecklistProgressItem,
  RhInductionEffectivenessReview,
  RhInductionMasterRecord,
  RhInductionPhase,
  RhInductionPhaseDocument,
  RhInductionPhaseEnrollmentSummary,
  RhInductionProgressItem,
} from '../types/models';

export const listInductionPhases = async (): Promise<RhInductionPhase[]> => {
  const response = await api.get('/rh/induction/phases');
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.phases as RhInductionPhase[]) ?? [];
};

export const updatePhaseContact = async (
  phaseId: number,
  responsibleName: string | null,
  responsiblePhone: string | null,
): Promise<void> => {
  await api.patch(`/rh/induction/phases/${phaseId}/contact`, {
    responsible_name: responsibleName,
    responsible_phone: responsiblePhone,
  });
};

export const addPhaseDocument = async (
  phaseId: number,
  documentId: string,
  sortOrder = 0,
): Promise<RhInductionPhaseDocument> => {
  const response = await api.post(`/rh/induction/phases/${phaseId}/documents`, {
    document_id: documentId,
    sort_order: sortOrder,
  });
  const data = asRecord(unwrapPayload(response.data));
  return data?.document as RhInductionPhaseDocument;
};

export const removePhaseDocument = async (phaseDocumentId: number): Promise<void> => {
  await api.delete(`/rh/induction/phase-documents/${phaseDocumentId}`);
};

export const enrollEmployeeInPhase = async (
  phaseId: number,
  employeeId: number,
  supervisorEmployeeId?: number | null,
): Promise<void> => {
  await api.post(`/rh/induction/phases/${phaseId}/enroll`, {
    employee_id: employeeId,
    supervisor_employee_id: supervisorEmployeeId ?? null,
  });
};

export const setEnrollmentSupervisor = async (
  enrollmentId: number,
  supervisorEmployeeId: number | null,
): Promise<void> => {
  await api.patch(`/rh/induction/enrollments/${enrollmentId}/supervisor`, {
    supervisor_employee_id: supervisorEmployeeId,
  });
};

export const listPhaseChecklistItems = async (phaseId: number): Promise<RhInductionChecklistItem[]> => {
  const response = await api.get(`/rh/induction/phases/${phaseId}/checklist-items`);
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.items as RhInductionChecklistItem[]) ?? [];
};

export const addPhaseChecklistItem = async (phaseId: number, itemText: string): Promise<RhInductionChecklistItem> => {
  const response = await api.post(`/rh/induction/phases/${phaseId}/checklist-items`, { item_text: itemText });
  const data = asRecord(unwrapPayload(response.data));
  return data?.item as RhInductionChecklistItem;
};

export const removePhaseChecklistItem = async (checklistItemId: number): Promise<void> => {
  await api.delete(`/rh/induction/checklist-items/${checklistItemId}`);
};

export const listEnrollmentChecklistProgress = async (
  enrollmentId: number,
): Promise<RhInductionChecklistProgressItem[]> => {
  const response = await api.get(`/rh/induction/enrollments/${enrollmentId}/checklist-progress`);
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.progress as RhInductionChecklistProgressItem[]) ?? [];
};

export const toggleChecklistItem = async (
  enrollmentId: number,
  checklistItemId: number,
  completed: boolean,
): Promise<void> => {
  await api.put(`/rh/induction/enrollments/${enrollmentId}/checklist-items/${checklistItemId}`, { completed });
};

export const listEffectivenessReviews = async (employeeId: number): Promise<RhInductionEffectivenessReview[]> => {
  const response = await api.get(`/rh/employees/${employeeId}/induction/effectiveness`);
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.reviews as RhInductionEffectivenessReview[]) ?? [];
};

export interface CreateEffectivenessReviewPayload {
  review_date: string;
  method: string;
  result_percentage: number | null;
  performs_as_expected: boolean | null;
  evidence_notes: string | null;
}

export const createEffectivenessReview = async (
  employeeId: number,
  payload: CreateEffectivenessReviewPayload,
): Promise<RhInductionEffectivenessReview> => {
  const response = await api.post(`/rh/employees/${employeeId}/induction/effectiveness`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return data?.review as RhInductionEffectivenessReview;
};

export const getEmployeeInductionMasterRecord = async (employeeId: number): Promise<RhInductionMasterRecord> => {
  const response = await api.get(`/rh/employees/${employeeId}/induction/master-record`);
  const payload = asRecord(unwrapPayload(response.data));
  return payload?.record as RhInductionMasterRecord;
};

/** Descarga el reporte de avance del Formato de Induccion como blob y devuelve un object URL. */
export const getEmployeeInductionMasterRecordPdfUrl = async (employeeId: number): Promise<string> => {
  const response = await api.get(`/rh/employees/${employeeId}/induction/master-record.pdf`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

export const listPhaseEnrollments = async (phaseId: number): Promise<RhInductionPhaseEnrollmentSummary[]> => {
  const response = await api.get(`/rh/induction/phases/${phaseId}/enrollments`);
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.enrollments as RhInductionPhaseEnrollmentSummary[]) ?? [];
};

export const getEmployeeInductionProgress = async (employeeId: number): Promise<RhInductionProgressItem[]> => {
  const response = await api.get(`/rh/employees/${employeeId}/induction`);
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.progress as RhInductionProgressItem[]) ?? [];
};

export const getMyInductionProgress = async (): Promise<RhInductionProgressItem[]> => {
  const response = await api.get('/rh/me/induction');
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.progress as RhInductionProgressItem[]) ?? [];
};
