import api from './axios';
import { unwrapPayload, asRecord } from './service.shared';
import type {
  RhInductionChecklistItem,
  RhInductionChecklistProgressItem,
  RhInductionClosure,
  RhInductionEffectivenessReview,
  RhInductionMasterRecord,
  RhInductionPhase,
  RhInductionPhaseDocument,
  RhInductionPhaseEnrollmentSummary,
  RhInductionPhasePosition,
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

export interface RhInductionCertificateReadiness {
  duration_ok: boolean;
  courses: Array<{ course_id: number; label: string; signatures_count: number }>;
  employees_missing_branch: Array<{ employee_id: number; full_name: string }>;
  employees_missing_position: Array<{ employee_id: number; full_name: string }>;
  pending_enrollments: number;
}

/** Radiografia de los datos que alimentan la constancia de la fase (puesto/sucursal/duracion/firmas). */
export const getPhaseCertificateReadiness = async (phaseId: number): Promise<RhInductionCertificateReadiness> => {
  const response = await api.get(`/rh/induction/phases/${phaseId}/certificate-readiness`);
  const data = asRecord(unwrapPayload(response.data));
  return data?.readiness as RhInductionCertificateReadiness;
};

export const updatePhaseReadingLimit = async (phaseId: number, readingLimitHours: number | null): Promise<void> => {
  await api.patch(`/rh/induction/phases/${phaseId}/reading-limit`, { reading_time_limit_hours: readingLimitHours });
};

export const updatePhaseDuration = async (phaseId: number, durationHours: number | null): Promise<void> => {
  await api.patch(`/rh/induction/phases/${phaseId}/duration`, { duration_hours: durationHours });
};

export const listPhasePositions = async (phaseId: number): Promise<RhInductionPhasePosition[]> => {
  const response = await api.get(`/rh/induction/phases/${phaseId}/positions`);
  const payload = asRecord(unwrapPayload(response.data));
  return (payload?.positions as RhInductionPhasePosition[]) ?? [];
};

export const enablePhaseForPosition = async (
  phaseId: number,
  positionId: number,
): Promise<RhInductionPhasePosition> => {
  const response = await api.post(`/rh/induction/phases/${phaseId}/positions/${positionId}/enable`);
  const data = asRecord(unwrapPayload(response.data));
  return data?.position as RhInductionPhasePosition;
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

export interface RhInductionBulkEnrollmentResult {
  total: number;
  enrolled: number;
  skipped: Array<{ employee_id: number; full_name: string; reason: string }>;
}

/** Inscribe de una vez a todos los colaboradores activos en una fase institucional (1-4). */
export const enrollAllInPhase = async (phaseId: number): Promise<RhInductionBulkEnrollmentResult> => {
  const response = await api.post(`/rh/induction/phases/${phaseId}/enroll-all`);
  const data = asRecord(unwrapPayload(response.data));
  return data?.result as RhInductionBulkEnrollmentResult;
};

/** Elimina una inscripcion sin evidencia aprobatoria (el backend rechaza fases aprobadas o en revision). */
export const removeEnrollment = async (enrollmentId: number): Promise<void> => {
  await api.delete(`/rh/induction/enrollments/${enrollmentId}`);
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

export interface CloseInductionRecordPayload {
  verdict: 'APROBADA' | 'NO_APROBADA';
  closing_notes?: string | null;
  collaborator_signature: string;
  rh_signature: string;
  area_signature: string;
  rh_signatory_name: string;
  area_signatory_name: string;
  supersede?: boolean;
}

export const closeInductionRecord = async (
  employeeId: number,
  payload: CloseInductionRecordPayload,
): Promise<RhInductionClosure> => {
  const response = await api.post(`/rh/employees/${employeeId}/induction/close`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return data?.closure as RhInductionClosure;
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
