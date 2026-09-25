import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type {
  EvaluationTemplate,
  InductionAlert,
  InductionEmployee360,
  InductionProgramOverview,
  InductionRosterPage,
  InductionRosterRow,
  InductionStage,
} from '../types/models';

/** Tablero de gestión integral de la Inducción (Fases 1-4). */

export const getInductionDashboardOverview = async (): Promise<InductionProgramOverview> => {
  const response = await api.get('/rh/induction/dashboard/overview');
  return asRecord(unwrapPayload(response.data))?.overview as InductionProgramOverview;
};

export interface InductionRosterQuery {
  q?: string;
  stages?: InductionStage[];
  alerts?: InductionAlert[];
  page?: number;
  limit?: number;
}

export const getInductionPhaseRoster = async (phaseId: number, query: InductionRosterQuery = {}): Promise<InductionRosterPage> => {
  const params: Record<string, string | number> = {};
  if (query.q) params.q = query.q;
  if (query.stages && query.stages.length > 0) params.stage = query.stages.join(',');
  if (query.alerts && query.alerts.length > 0) params.alert = query.alerts.join(',');
  if (query.page) params.page = query.page;
  if (query.limit) params.limit = query.limit;
  const response = await api.get(`/rh/induction/dashboard/phases/${phaseId}/roster`, { params });
  return asRecord(unwrapPayload(response.data))?.roster as InductionRosterPage;
};

export const getInductionEmployee360 = async (employeeId: number): Promise<InductionEmployee360> => {
  const response = await api.get(`/rh/induction/dashboard/employees/${employeeId}`);
  return asRecord(unwrapPayload(response.data))?.detail as InductionEmployee360;
};

export const getInductionEnrollmentRow = async (enrollmentId: number): Promise<InductionRosterRow> => {
  const response = await api.get(`/rh/induction/dashboard/enrollments/${enrollmentId}`);
  return asRecord(unwrapPayload(response.data))?.row as InductionRosterRow;
};

export const updatePhaseAutoAdvance = async (phaseId: number, enabled: boolean): Promise<string> => {
  const response = await api.patch(`/rh/induction/phases/${phaseId}/auto-advance`, { enabled });
  return String(asRecord(unwrapPayload(response.data))?.message ?? '');
};

export interface InductionEvaluationRulesPayload {
  window_hours?: number;
  attempt_time_limit_minutes?: number | null;
  passing_score?: number;
}

export const updatePhaseEvaluationRules = async (
  phaseId: number,
  payload: InductionEvaluationRulesPayload,
): Promise<EvaluationTemplate | null> => {
  const response = await api.patch(`/rh/induction/phases/${phaseId}/evaluation-rules`, payload);
  return (asRecord(unwrapPayload(response.data))?.template as EvaluationTemplate | undefined) ?? null;
};

export interface InductionReconcileResult {
  phase_id: number;
  phase_number: number;
  candidates: number;
  advanced: number;
  skipped: Array<{ employee_id: number; full_name: string; reason: string }>;
}

export const reconcilePhaseAdvance = async (phaseId: number): Promise<{ message: string; result: InductionReconcileResult }> => {
  const response = await api.post(`/rh/induction/phases/${phaseId}/reconcile-advance`);
  const data = asRecord(unwrapPayload(response.data));
  return { message: String(data?.message ?? ''), result: data?.result as InductionReconcileResult };
};

export interface InductionAdvanceResult {
  employee_id: number;
  employee_name: string;
  from_phase_number: number;
  to_phase_number: number;
  to_enrollment_id: number;
  to_phase_published: boolean;
}

export const advanceEnrollment = async (enrollmentId: number): Promise<{ message: string; advanced: InductionAdvanceResult }> => {
  const response = await api.post(`/rh/induction/enrollments/${enrollmentId}/advance`);
  const data = asRecord(unwrapPayload(response.data));
  return { message: String(data?.message ?? ''), advanced: data?.advanced as InductionAdvanceResult };
};

export interface InductionResetAttemptResult {
  closed_assignment_id: number;
  closed_reasons: string[];
  closed_responses_kept: number;
  new_assignment_id: number;
  attempt_no: number;
  deadline_at: string;
}

export const resetTruncatedAttempt = async (
  enrollmentId: number,
  note?: string,
): Promise<{ message: string; reset: InductionResetAttemptResult }> => {
  const response = await api.post(`/rh/induction/enrollments/${enrollmentId}/reset-attempt`, note ? { note } : {});
  const data = asRecord(unwrapPayload(response.data));
  return { message: String(data?.message ?? ''), reset: data?.reset as InductionResetAttemptResult };
};

export const issueEnrollmentCertificate = async (
  enrollmentId: number,
): Promise<{ message: string; certificate_document_id: number; already_existed: boolean }> => {
  const response = await api.post(`/rh/induction/enrollments/${enrollmentId}/issue-certificate`);
  const data = asRecord(unwrapPayload(response.data));
  const certificate = asRecord(data?.certificate);
  return {
    message: String(data?.message ?? ''),
    certificate_document_id: Number(certificate?.certificate_document_id ?? 0),
    already_existed: Boolean(certificate?.already_existed),
  };
};

export const resendReadingNotice = async (enrollmentId: number): Promise<string> => {
  const response = await api.post(`/rh/induction/enrollments/${enrollmentId}/resend-notice`);
  return String(asRecord(unwrapPayload(response.data))?.message ?? '');
};

export const updatePhaseAdvanceGrace = async (phaseId: number, hours: number | null): Promise<string> => {
  const response = await api.patch(`/rh/induction/phases/${phaseId}/advance-grace`, { hours });
  return String(asRecord(unwrapPayload(response.data))?.message ?? '');
};

export const startDeferredEnrollmentNow = async (enrollmentId: number): Promise<string> => {
  const response = await api.post(`/rh/induction/enrollments/${enrollmentId}/start-now`);
  return String(asRecord(unwrapPayload(response.data))?.message ?? '');
};
