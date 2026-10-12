import api from './axios';

// Cliente de Incidencias, importacion Excel y vista previa de vacaciones (Control de Asistencias).

export type IncidentStatus = 'captured' | 'authorized' | 'rejected' | 'cancelled';

export interface IncidentType {
  id: number;
  code: string;
  name: string;
  requires_attachment: boolean;
  is_paid: boolean;
  deducts_vacation: boolean;
  counts_as_attendance: boolean;
  is_hourly: boolean;
  is_system: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface IncidentAttachment {
  id: number;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

export interface Incident {
  id: number;
  employee: {
    id: number;
    full_name: string;
    employee_code: string | null;
    branch_id: number | null;
    branch_name: string | null;
  };
  type: Pick<IncidentType, 'id' | 'code' | 'name' | 'is_hourly' | 'requires_attachment' | 'deducts_vacation'>;
  start_date: string;
  end_date: string;
  days: number | null;
  hours: number | null;
  status: IncidentStatus;
  reason: string | null;
  imss_folio: string | null;
  captured_by_name: string | null;
  authorized_by_name: string | null;
  authorized_at: string | null;
  authorization_notes: string | null;
  notified_at: string | null;
  attachments_count: number;
  created_at: string;
  attachments?: IncidentAttachment[];
}

export interface IncidentListParams {
  from?: string;
  to?: string;
  employee_id?: string;
  branch_id?: string;
  type_id?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface IncidentPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface IncidentListResult {
  data: Incident[];
  pagination: IncidentPagination;
}

export interface IncidentMutationResult {
  incident: Incident;
  warnings: string[];
}

export interface CreateIncidentInput {
  employee_id: number;
  incident_type_id: number;
  start_date: string;
  end_date?: string;
  hours?: number;
  reason?: string;
  imss_folio?: string;
  authorize?: boolean;
  authorization_notes?: string;
  files?: File[];
}

const cleanParams = (params: Record<string, string | number | undefined>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));

export const listIncidents = async (params: IncidentListParams): Promise<IncidentListResult> => {
  const response = await api.get('/attendance/incidents', { params: cleanParams({ ...params }) });
  return response.data as IncidentListResult;
};

export const getIncident = async (id: number): Promise<Incident> => {
  const response = await api.get(`/attendance/incidents/${id}`);
  return (response.data as { incident: Incident }).incident;
};

export const listIncidentTypes = async (includeInactive = false): Promise<IncidentType[]> => {
  const response = await api.get('/attendance/incident-types', {
    params: includeInactive ? { include_inactive: true } : undefined,
  });
  return ((response.data as { incident_types?: IncidentType[] }).incident_types ?? []);
};

export const createIncident = async (input: CreateIncidentInput): Promise<IncidentMutationResult> => {
  const form = new FormData();
  form.append('employee_id', String(input.employee_id));
  form.append('incident_type_id', String(input.incident_type_id));
  form.append('start_date', input.start_date);
  if (input.end_date) form.append('end_date', input.end_date);
  if (input.hours !== undefined) form.append('hours', String(input.hours));
  if (input.reason) form.append('reason', input.reason);
  if (input.imss_folio) form.append('imss_folio', input.imss_folio);
  if (input.authorize) form.append('authorize', 'true');
  if (input.authorization_notes) form.append('authorization_notes', input.authorization_notes);
  (input.files ?? []).forEach((file) => form.append('files', file));
  const response = await api.post('/attendance/incidents', form);
  const data = response.data as Partial<IncidentMutationResult>;
  return { incident: data.incident as Incident, warnings: data.warnings ?? [] };
};

export type IncidentTransition = 'authorize' | 'reject' | 'cancel';

export const transitionIncident = async (
  id: number,
  action: IncidentTransition,
  notes?: string,
): Promise<IncidentMutationResult> => {
  const response = await api.post(`/attendance/incidents/${id}/${action}`, notes ? { notes } : {});
  const data = response.data as Partial<IncidentMutationResult>;
  return { incident: data.incident as Incident, warnings: data.warnings ?? [] };
};

export const addIncidentAttachments = async (id: number, files: File[]): Promise<IncidentAttachment[]> => {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  const response = await api.post(`/attendance/incidents/${id}/attachments`, form);
  return ((response.data as { attachments?: IncidentAttachment[] }).attachments ?? []);
};

export const deleteIncidentAttachment = async (id: number, attachmentId: number): Promise<Incident> => {
  const response = await api.delete(`/attendance/incidents/${id}/attachments/${attachmentId}`);
  return (response.data as { incident: Incident }).incident;
};

export const incidentAttachmentPath = (id: number, attachmentId: number): string =>
  `/attendance/incidents/${id}/attachments/${attachmentId}`;

// ---------- Importacion Excel ----------

export type ImportRowStatus = 'ok' | 'duplicate' | 'error';

export interface ImportRow {
  row: number;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  employee?: string;
  type?: string;
  start_date?: string;
  end_date?: string;
  imported?: boolean;
  authorized?: boolean;
  incident_id?: number;
}

export interface ImportSimulation {
  summary: { total: number; ok: number; duplicate: number; error: number };
  rows: ImportRow[];
}

export interface ImportResult {
  summary: { total: number; imported: number; authorized: number; skipped: number; failed: number };
  rows: ImportRow[];
}

const fileForm = (file: File): FormData => {
  const form = new FormData();
  form.append('file', file);
  return form;
};

export const simulateIncidentImport = async (file: File): Promise<ImportSimulation> => {
  const response = await api.post('/attendance/incidents/import/simulate', fileForm(file));
  return response.data as ImportSimulation;
};

export const importIncidents = async (file: File): Promise<ImportResult> => {
  const response = await api.post('/attendance/incidents/import', fileForm(file));
  return response.data as ImportResult;
};

// ---------- Vista previa de vacaciones ----------

export interface VacationPreview {
  applies: boolean;
  no_hire_date: boolean;
  working_days: number;
  balance: number;
  pending: number;
  available: number;
  exceeds: number;
  policy: 'warn' | 'block' | 'allow' | string;
  blocked: boolean;
  message: string | null;
  is_hourly: boolean;
  deducts_vacation: boolean;
}

export interface VacationPreviewInput {
  employee_id: number;
  incident_type_id: number;
  start_date: string;
  end_date: string;
}

export const previewVacation = async (input: VacationPreviewInput): Promise<VacationPreview> => {
  const response = await api.post('/attendance/vacations/preview', input);
  return response.data as VacationPreview;
};
