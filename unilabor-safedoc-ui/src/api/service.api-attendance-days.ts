import axios from 'axios';
import api from './axios';
import { downloadAttendanceFile } from './service.api-attendance-common';
import type { DayResultCode } from '../components/attendance/shared/dayResult';

// Cliente de Dias y Checadas del modulo Control de Asistencias (contratos days-punches.md).

export interface AttendancePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DayEmployeeRef {
  id: number;
  code: string | null;
  full_name: string;
  area: string | null;
  branch_id: number | null;
  branch_name: string | null;
}

export interface DaySegment {
  shift_id: number | null;
  name: string | null;
  expected_start: string | null;
  expected_end: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  clock_in_punch_id: number | null;
  clock_out_punch_id: number | null;
  late_minutes: number;
  early_departure_minutes: number;
  hours: number;
  has_punches: boolean;
}

export interface AttendanceDay {
  id: number;
  work_date: string;
  employee: DayEmployeeRef;
  expected_start_time: string | null;
  expected_end_time: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  late_minutes: number;
  early_departure_minutes: number;
  worked_hours: number | null;
  overtime_hours: number | null;
  day_result: DayResultCode;
  reason: string | null;
  incident: { id: number; code: string; name: string } | null;
  is_late_accumulation_absence: boolean;
  has_pending_review: boolean;
  segments: DaySegment[];
}

export interface DaysSummary {
  absent: number;
  late: number;
  partial_absence: number;
  early_departure: number;
  late_accumulation_absence: number;
  pending_review: number;
}

export interface DaysQuery {
  from: string;
  to: string;
  branch_id?: string;
  employee_id?: string;
  result?: string;
  search?: string;
  only_issues?: boolean;
  page?: number;
  limit?: number;
}

export interface DaysResponse {
  data: AttendanceDay[];
  pagination: AttendancePagination;
  summary: DaysSummary;
  range: { from: string; to: string };
}

export type PunchType = 'in' | 'out' | 'break_start' | 'break_end';
export type VerificationMethod = 'face' | 'fingerprint' | 'card' | 'pin' | 'manual' | 'other';
export type ReviewStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface AttendancePunch {
  id: number;
  employee: { id: number; code: string | null; full_name: string } | null;
  device_employee_number: string | null;
  source: 'terminal' | 'manual';
  terminal: { id: number; name: string; serial_number: string | null } | null;
  branch: { id: number; name: string } | null;
  punch_type: PunchType | null;
  punched_at: string;
  device_reported_at: string | null;
  verification_method: VerificationMethod | null;
  review_status: ReviewStatus;
  review_reason: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  manual_justification: string | null;
  registered_by_name: string | null;
  has_photo: boolean;
}

export interface PunchesQuery {
  from: string;
  to: string;
  branch_id?: string;
  employee_id?: string;
  source?: string;
  review_status?: string;
  only_review?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PunchesResponse {
  data: AttendancePunch[];
  pagination: AttendancePagination;
  range: { from: string; to: string };
}

export interface RecalculationResult {
  employees: number;
  days: number;
}

export interface PunchMutationResult {
  punch: AttendancePunch;
  recalculation: RecalculationResult;
}

export interface ManualPunchInput {
  employee_id: number;
  work_date: string;
  time: string;
  punch_type: 'in' | 'out';
  justification: string;
}

export interface AttendanceEmployeeOption {
  id: number;
  employee_code: string | null;
  full_name: string;
  branch_name: string | null;
  device_employee_number: string | null;
}

const clean = <T extends object>(params: T): Record<string, string | number | boolean> =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== false && value !== null),
  ) as Record<string, string | number | boolean>;

export const listAttendanceDays = async (query: DaysQuery): Promise<DaysResponse> => {
  const response = await api.get('/attendance/days', { params: clean(query) });
  return response.data as DaysResponse;
};

export const recalculateAttendanceDays = async (input: {
  from: string;
  to: string;
  employee_ids?: number[];
}): Promise<RecalculationResult> => {
  const response = await api.post('/attendance/days/recalculate', input);
  return response.data as RecalculationResult;
};

/** Justifica una falta/retardo/salida anticipada (multipart; el comprobante viaja como `file`). */
export const justifyAttendanceDay = async (
  employeeId: number,
  date: string,
  reason: string,
  file: File | null,
): Promise<void> => {
  const form = new FormData();
  form.append('reason', reason);
  if (file) form.append('file', file);
  await api.post(`/attendance/days/${employeeId}/${date}/justify`, form);
};

export const listAttendancePunches = async (query: PunchesQuery): Promise<PunchesResponse> => {
  const response = await api.get('/attendance/punches', { params: clean(query) });
  return response.data as PunchesResponse;
};

export const createManualPunch = async (input: ManualPunchInput): Promise<PunchMutationResult> => {
  const response = await api.post('/attendance/punches/manual', input);
  return response.data as PunchMutationResult;
};

export const reviewAttendancePunch = async (
  id: number,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<PunchMutationResult> => {
  const response = await api.post(`/attendance/punches/${id}/review`, { decision, ...(reason ? { reason } : {}) });
  return response.data as PunchMutationResult;
};

export const linkPunchToEmployee = async (id: number, employeeId: number): Promise<PunchMutationResult> => {
  const response = await api.post(`/attendance/punches/${id}/link-employee`, { employee_id: employeeId });
  return response.data as PunchMutationResult;
};

/** Busca colaboradores (nombre, codigo o numero de empleado) para los selectores. */
export const searchAttendanceEmployees = async (search: string): Promise<AttendanceEmployeeOption[]> => {
  const response = await api.get('/attendance/employees', { params: clean({ search: search.trim(), limit: 30 }) });
  return ((response.data?.data ?? []) as AttendanceEmployeeOption[]).map((item) => ({
    id: item.id,
    employee_code: item.employee_code ?? null,
    full_name: item.full_name,
    branch_name: item.branch_name ?? null,
    device_employee_number: item.device_employee_number ?? null,
  }));
};

export const getAttendanceEmployeeOption = async (id: number): Promise<AttendanceEmployeeOption | null> => {
  try {
    const response = await api.get(`/attendance/employees/${id}`);
    const item = response.data?.employee as AttendanceEmployeeOption | undefined;
    return item ?? null;
  } catch {
    return null;
  }
};

/** Con responseType blob el cuerpo del error llega como Blob: se extrae el message del JSON. */
export const readBlobErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const parsed = JSON.parse(await error.response.data.text()) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // cuerpo no JSON: se usa el mensaje de respaldo
    }
    return fallback;
  }
  return fallback;
};

export const downloadDaysExcel = (params: { from: string; to: string; branch_id?: string; employee_id?: string; result?: string }) =>
  downloadAttendanceFile('/attendance/export/days.xlsx', params, `dias-asistencia_${params.from}_${params.to}.xlsx`);

export const downloadOvertimeExcel = (params: { from: string; to: string; branch_id?: string }) =>
  downloadAttendanceFile('/attendance/export/overtime.xlsx', params, `horas-extra_${params.from}_${params.to}.xlsx`);
