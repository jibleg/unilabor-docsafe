import api from './axios';

// Cliente de Colaboradores del control, vacaciones, horario por colaborador y relojes (por empleado).

export type DeviceSyncStatus = 'not_applicable' | 'pending' | 'synced' | 'error';

export interface AttendanceEmployee {
  id: number;
  employee_code: string | null;
  full_name: string;
  email: string | null;
  area: string | null;
  position: string | null;
  is_active: boolean;
  branch_id: number | null;
  branch_name: string | null;
  hire_date: string | null;
  is_enabled: boolean;
  device_employee_number: string | null;
  suggested_device_number: string | null;
  device_sync_status: DeviceSyncStatus;
  device_sync_error: string | null;
  device_synced_at: string | null;
  has_schedule: boolean;
  /** Con checadas registradas el número de empleado ya no se puede cambiar. */
  number_locked: boolean;
  has_face_photo: boolean;
  face_photo_updated_at: string | null;
  /** Estado del envío de la foto al reloj (pending = aún no está en el equipo). */
  face_sync_status: DeviceSyncStatus;
  face_sync_error: string | null;
}

export interface EmployeeListParams {
  branch_id?: string;
  enabled?: string;
  search?: string;
  sync_status?: string;
  without_schedule?: string;
  include_inactive?: string;
  page?: number;
  limit?: number;
}

export interface EmployeeListResult {
  data: AttendanceEmployee[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface EmployeeSummary {
  enabled: number;
  without_branch: number;
  without_device_number: number;
  pending_sync: number;
  without_schedule: number;
  sync_error: number;
}

const cleanParams = (params: Record<string, string | number | undefined>) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));

export const listAttendanceEmployees = async (params: EmployeeListParams): Promise<EmployeeListResult> => {
  const response = await api.get('/attendance/employees', { params: cleanParams({ ...params }) });
  return response.data as EmployeeListResult;
};

export const getEmployeeSummary = async (branchId?: string): Promise<EmployeeSummary> => {
  const response = await api.get('/attendance/employees/summary', { params: cleanParams({ branch_id: branchId }) });
  return (response.data as { summary: EmployeeSummary }).summary;
};

export const getAttendanceEmployee = async (id: number): Promise<AttendanceEmployee> => {
  const response = await api.get(`/attendance/employees/${id}`);
  return (response.data as { employee: AttendanceEmployee }).employee;
};

export interface EmployeePatch {
  is_enabled?: boolean;
  device_employee_number?: string | null;
  branch_id?: number | null;
  hire_date?: string | null;
}

export const patchAttendanceEmployee = async (id: number, patch: EmployeePatch): Promise<AttendanceEmployee> => {
  const response = await api.patch(`/attendance/employees/${id}`, patch);
  return (response.data as { employee: AttendanceEmployee }).employee;
};

export interface BulkEnableRow {
  employee_id: number;
  device_employee_number: string;
  branch_id?: number;
}

export const bulkEnableEmployees = async (
  rows: BulkEnableRow[],
  defaultBranchId?: number,
): Promise<{ enabled: number; employee_ids: number[] }> => {
  const response = await api.post('/attendance/employees/bulk-enable', {
    rows,
    ...(defaultBranchId ? { default_branch_id: defaultBranchId } : {}),
  });
  return response.data as { enabled: number; employee_ids: number[] };
};

/** Extrae los errores por fila de un 400 de bulk-enable: { details: { rows: [{employee_id, message}] } }. */
export const extractBulkRowErrors = (error: unknown): Record<number, string> => {
  const data = (error as { response?: { data?: { details?: { rows?: Array<{ employee_id: number; message: string }> } } } })
    ?.response?.data;
  const result: Record<number, string> = {};
  for (const row of data?.details?.rows ?? []) {
    result[row.employee_id] = row.message;
  }
  return result;
};

// ---------- Vacaciones ----------

export interface VacationPeriod {
  id: number;
  seniority_year: number;
  period_start_date: string;
  period_due_date: string;
  days_entitled: number;
  days_adjustment: number;
  adjustment_reason: string | null;
  days_taken: number;
  expired: boolean;
  balance: number;
}

export interface VacationSummary {
  employee: { id: number; full_name: string; employee_code: string | null };
  hire_date: string | null;
  periods: VacationPeriod[];
  balance: {
    entitled: number;
    adjustment: number;
    taken: number;
    balance: number;
    expiring: { days: number; due_date: string } | null;
  };
  periods_touched?: number;
}

export const getEmployeeVacations = async (employeeId: number): Promise<VacationSummary> => {
  const response = await api.get(`/attendance/vacations/employees/${employeeId}`);
  return response.data as VacationSummary;
};

export const openVacationPeriods = async (employeeId: number): Promise<VacationSummary> => {
  const response = await api.post(`/attendance/vacations/employees/${employeeId}/open-periods`, {});
  return response.data as VacationSummary;
};

export const adjustVacationPeriod = async (
  periodId: number,
  adjustment: number,
  reason: string,
): Promise<VacationSummary> => {
  const response = await api.post('/attendance/vacations/adjust', { period_id: periodId, adjustment, reason });
  return response.data as VacationSummary;
};

// ---------- Horario del colaborador ----------

export interface ScheduleChip {
  assignment_id: number | null;
  shift_id: number | null;
  name: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  color_hex: string;
  is_recurring?: boolean;
  duplicate_count?: number;
}

export interface EmployeeScheduleDay {
  date: string;
  weekday: number;
  chips: ScheduleChip[];
  is_rest_day: boolean;
  has_schedule: boolean;
  has_conflict_limit: boolean;
  is_split: boolean;
  total_hours: number;
}

export interface EmployeeSchedule {
  employee: { id: number; full_name: string; employee_code: string | null };
  from: string;
  to: string;
  days: EmployeeScheduleDay[];
}

export const getEmployeeSchedule = async (employeeId: number, from: string, to: string): Promise<EmployeeSchedule> => {
  const response = await api.get(`/attendance/schedule/employee/${employeeId}`, { params: { from, to } });
  return response.data as EmployeeSchedule;
};

// ---------- Ultimos dias ----------

export interface EmployeeDayRow {
  id: number;
  work_date: string;
  day_result: string;
  expected_start_time: string | null;
  expected_end_time: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  late_minutes: number;
  worked_hours: number | null;
  incident: { id: number; code: string; name: string } | null;
}

export const listEmployeeDays = async (employeeId: number, from: string, to: string, limit = 10): Promise<EmployeeDayRow[]> => {
  const response = await api.get('/attendance/days', { params: { employee_id: employeeId, from, to, limit } });
  return ((response.data as { data?: EmployeeDayRow[] }).data ?? []);
};

// ---------- Relojes (por empleado y por sucursal) ----------

export interface BranchAgentOverview {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  agent: { id: number; name: string; is_online: boolean; is_active: boolean; last_heartbeat_at: string | null } | null;
  pending_sync_count: number;
  open_orders_count: number;
}

export const getDevicesOverview = async (): Promise<BranchAgentOverview[]> => {
  const response = await api.get('/attendance/devices/overview');
  return ((response.data as { branches?: BranchAgentOverview[] }).branches ?? []);
};

export interface SyncResult {
  queued: number;
  queued_sync: number;
  queued_remove: number;
  skipped_without_number: number;
  skipped_invalid_number?: number;
}

export const syncAgent = async (agentId: number, all = false): Promise<SyncResult> => {
  const response = await api.post(`/attendance/devices/agents/${agentId}/sync`, { all });
  return response.data as SyncResult;
};

export type EnrollMode = 'fingerprint' | 'face';

/** Sube la fotografía de rostro (JPEG ya recortado); si el colaborador está sincronizado se envía sola al reloj. */
export const uploadFacePhoto = async (employeeId: number, photo: Blob): Promise<{ employee: AttendanceEmployee; queued: boolean }> => {
  const form = new FormData();
  form.append('photo', photo, 'rostro.jpg');
  const response = await api.post(`/attendance/employees/${employeeId}/face-photo`, form);
  return response.data as { employee: AttendanceEmployee; queued: boolean };
};

/** Reenvía al reloj la fotografía vigente (el colaborador debe estar sincronizado). */
export const sendFacePhoto = async (employeeId: number): Promise<AttendanceEmployee> => {
  const response = await api.post(`/attendance/employees/${employeeId}/face-photo/send`);
  return (response.data as { employee: AttendanceEmployee }).employee;
};

/** Descarga la fotografía vigente como URL de objeto (liberar con URL.revokeObjectURL). */
export const fetchFacePhotoUrl = async (employeeId: number): Promise<string> => {
  const response = await api.get(`/attendance/employees/${employeeId}/face-photo`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

export const enrollEmployee = async (employeeId: number, mode: EnrollMode): Promise<{ order_id: number; terminal_id: number }> => {
  const response = await api.post(`/attendance/devices/employees/${employeeId}/enroll`, { mode });
  return response.data as { order_id: number; terminal_id: number };
};

/**
 * Los chips "sin sucursal" / "sin numero de empleado" no tienen filtro en el backend: se recorren los
 * habilitados (hasta 1000) y se filtra en el cliente. Es un caso raro (el PATCH no permite habilitar sin ambos).
 */
export const listEmployeesWithGap = async (
  gap: 'branch' | 'number',
  params: EmployeeListParams,
): Promise<AttendanceEmployee[]> => {
  const result: AttendanceEmployee[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await listAttendanceEmployees({ ...params, enabled: 'true', page, limit: 100 });
    result.push(...response.data);
    if (page >= response.pagination.totalPages) break;
  }
  return result.filter((employee) => (gap === 'branch' ? employee.branch_id === null : !employee.device_employee_number));
};
