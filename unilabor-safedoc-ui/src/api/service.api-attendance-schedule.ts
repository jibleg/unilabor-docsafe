import api from './axios';
import axios from 'axios';

// Cliente del contrato /api/attendance (turnos, calendario semanal, asignaciones, copia y bitacora).

export type ShiftType = 'fixed' | 'flexible';

export interface AttendanceShift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  break_minutes: number;
  shift_type: ShiftType;
  color_hex: string;
  is_active: boolean;
  /** Ventanas de checada, en minutos respecto a la hora de entrada y de salida del turno. */
  entry_before_min: number;
  entry_after_min: number;
  exit_before_min: number;
  exit_after_min: number;
  /** Solo en GET /shifts. */
  assignments_count?: number;
}

export interface ShiftInput {
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  shift_type: ShiftType;
  color_hex: string;
  is_active?: boolean;
  entry_before_min?: number;
  entry_after_min?: number;
  exit_before_min?: number;
  exit_after_min?: number;
}

export interface ScheduleChip {
  assignment_id: number;
  shift_id: number | null;
  name: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  color_hex: string;
  is_recurring: boolean;
  duplicate_count: number;
  start_date: string;
  end_date: string | null;
  repeats_weekly: boolean;
  week_interval: number;
  weekdays: number[];
  notes: string | null;
}

export interface ScheduleDay {
  date: string;
  chips: ScheduleChip[];
  is_rest_day: boolean;
  has_conflict_limit: boolean;
  is_split: boolean;
  total_hours: number;
}

export interface ScheduleEmployeeRow {
  employee_id: number;
  full_name: string;
  employee_code: string | null;
  position: string | null;
  branch_id: number | null;
  branch_name: string | null;
  device_employee_number: string | null;
  is_enabled: boolean;
  week_hours: number;
  days: ScheduleDay[];
}

export interface SchedulePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ScheduleWeek {
  data: ScheduleEmployeeRow[];
  pagination: SchedulePagination;
  shifts: AttendanceShift[];
  max_shifts_per_day: number;
  week_start: string;
  week_start_date: string;
  days: string[];
}

export interface ScheduleQuery {
  week?: string;
  branch_id?: number;
  search?: string;
  only_enabled?: boolean;
  page?: number;
  limit?: number;
}

export interface AssignmentInput {
  employee_ids: number[];
  shift_ids: number[];
  start_date: string;
  end_date: string | null;
  repeats_weekly: boolean;
  week_interval: number;
  weekdays: number[];
  notes?: string | null;
  keep_existing?: boolean;
}

export interface AssignmentRecord {
  id: number;
  employee_id: number;
  shift_id: number | null;
  is_rest_day: boolean;
  start_date: string;
  end_date: string | null;
  repeats_weekly: boolean;
  week_interval: number;
  weekdays: number[];
  notes: string | null;
}

export interface AssignmentPatch {
  shift_id?: number | null;
  start_date?: string;
  end_date?: string | null;
  repeats_weekly?: boolean;
  week_interval?: number;
  weekdays?: number[];
  notes?: string | null;
}

export interface RemoveResult {
  action: 'end' | 'remove' | 'mixed';
  ended_ids: number[];
  removed_ids: number[];
}

export interface CopyInput {
  source_employee_id: number;
  source_date: string;
  target_employee_ids: number[];
  same_week: boolean;
  weeks: number;
  replace: boolean;
}

export interface CopyResult {
  created: number;
  assignments_created: number;
  skipped_existing: number;
  skipped_conflict: number;
  detail: { employee_id: number; date: string; reason: 'existing' | 'conflict'; message: string }[];
}

export interface ScheduleLogEntry {
  id: number;
  employee_id: number;
  employee_name: string;
  action: 'schedule' | 'edit' | 'remove' | 'end' | 'copy';
  shift_name: string | null;
  description: string;
  start_date: string | null;
  end_date: string | null;
  repeats_weekly: boolean | null;
  weekdays: number[] | null;
  changed_by_user_id: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

export interface ScheduleLogQuery {
  from?: string;
  to?: string;
  employee_id?: number;
  action?: string;
  page?: number;
  limit?: number;
}

export interface ScheduleConflictDetail {
  employee_id: number;
  employee_name: string;
  summary: string;
  conflicts: { date: string; message: string }[];
}

type RawPagination = { page: number; limit: number; total: number; total_pages?: number; totalPages?: number };

const normalizePagination = (raw: RawPagination): SchedulePagination => ({
  page: raw.page,
  limit: raw.limit,
  total: raw.total,
  totalPages: raw.totalPages ?? raw.total_pages ?? 1,
});

/** Extrae los conflictos 409 del backend (details) o null si el error no es un conflicto. */
export const extractScheduleConflicts = (error: unknown): ScheduleConflictDetail[] | null => {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;
  const details = (error.response.data as { details?: unknown } | undefined)?.details;
  if (!Array.isArray(details)) return null;
  return details as ScheduleConflictDetail[];
};

const cleanParams = (params: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

export const listShifts = async (includeInactive = true): Promise<AttendanceShift[]> => {
  const { data } = await api.get('/attendance/shifts', { params: { include_inactive: includeInactive } });
  return (data?.shifts ?? []) as AttendanceShift[];
};

export const createShift = async (input: ShiftInput): Promise<AttendanceShift> => {
  const { data } = await api.post('/attendance/shifts', input);
  return data.shift as AttendanceShift;
};

export const updateShift = async (id: number, input: Partial<ShiftInput>): Promise<AttendanceShift> => {
  const { data } = await api.patch(`/attendance/shifts/${id}`, input);
  return data.shift as AttendanceShift;
};

export const deleteShift = async (id: number): Promise<void> => {
  await api.delete(`/attendance/shifts/${id}`);
};

export const getScheduleWeek = async (query: ScheduleQuery): Promise<ScheduleWeek> => {
  const { data } = await api.get('/attendance/schedule', { params: cleanParams(query) });
  return { ...data, pagination: normalizePagination(data.pagination) } as ScheduleWeek;
};

export const createAssignments = async (input: AssignmentInput): Promise<AssignmentRecord[]> => {
  const { data } = await api.post('/attendance/assignments', input);
  return (data?.assignments ?? []) as AssignmentRecord[];
};

export const updateAssignment = async (id: number, patch: AssignmentPatch): Promise<AssignmentRecord> => {
  const { data } = await api.patch(`/attendance/assignments/${id}`, patch);
  return data.assignment as AssignmentRecord;
};

export const removeAssignment = async (
  id: number,
  options: { date?: string; fromDateOnly?: boolean },
): Promise<RemoveResult> => {
  const { data } = await api.delete(`/attendance/assignments/${id}`, {
    params: cleanParams({ date: options.date, from_date_only: options.fromDateOnly }),
  });
  return data.result as RemoveResult;
};

export const copySchedule = async (input: CopyInput): Promise<CopyResult> => {
  const { data } = await api.post('/attendance/schedule/copy', input);
  return data.result as CopyResult;
};

export const listScheduleLog = async (
  query: ScheduleLogQuery,
): Promise<{ data: ScheduleLogEntry[]; pagination: SchedulePagination }> => {
  const { data } = await api.get('/attendance/schedule/log', { params: cleanParams(query) });
  return { data: (data?.data ?? []) as ScheduleLogEntry[], pagination: normalizePagination(data.pagination) };
};
