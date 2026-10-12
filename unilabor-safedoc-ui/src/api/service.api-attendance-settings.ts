import api from './axios';

// Cliente de Parametros, festivos, tipos de incidencia y tabla de vacaciones.

export type SettingGroup = 'punctuality' | 'calendar' | 'devices' | 'vacations' | 'commitment';
export type SettingType = 'integer' | 'enum' | 'time' | 'text';

export interface AttendanceSetting {
  key: string;
  label: string;
  description: string;
  group: SettingGroup | string;
  type: SettingType | string;
  unit: string | null;
  options: string[] | null;
  min: number | null;
  max: number | null;
  default_value: number | string;
  value: number | string;
  is_modified: boolean;
}

export interface SettingChange {
  id: string;
  setting_key: string;
  previous_value: string | null;
  new_value: string;
  change_reason: string | null;
  changed_at: string;
  changed_by_name: string | null;
}

export interface AttendanceHoliday {
  id: number;
  holiday_date: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IncidentTypeFlags {
  requires_attachment: boolean;
  is_paid: boolean;
  deducts_vacation: boolean;
  counts_as_attendance: boolean;
  is_hourly: boolean;
}

export interface AttendanceIncidentType extends IncidentTypeFlags {
  id: number;
  code: string;
  name: string;
  is_system: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface IncidentTypePayload extends Partial<IncidentTypeFlags> {
  code?: string;
  name?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface VacationPolicyRow {
  from_seniority_year: number;
  vacation_days: number;
  law_days: number | null;
  differs_from_law: boolean;
}

export const listAttendanceSettings = async (): Promise<AttendanceSetting[]> => {
  const response = await api.get('/attendance/settings');
  return (response.data?.settings ?? []) as AttendanceSetting[];
};

export const updateAttendanceSetting = async (
  key: string,
  payload: { value: number | string; reason: string },
): Promise<AttendanceSetting[]> => {
  const response = await api.put(`/attendance/settings/${encodeURIComponent(key)}`, payload);
  return (response.data?.settings ?? []) as AttendanceSetting[];
};

export const listSettingChanges = async (limit = 100): Promise<SettingChange[]> => {
  const response = await api.get('/attendance/settings/changes', { params: { limit } });
  return (response.data?.changes ?? []) as SettingChange[];
};

export const listAttendanceHolidays = async (year?: number): Promise<AttendanceHoliday[]> => {
  const response = await api.get('/attendance/holidays', { params: year ? { year } : {} });
  return (response.data?.holidays ?? []) as AttendanceHoliday[];
};

export const createAttendanceHoliday = async (payload: { holiday_date: string; name: string }): Promise<AttendanceHoliday> => {
  const response = await api.post('/attendance/holidays', payload);
  return (response.data as { holiday: AttendanceHoliday }).holiday;
};

export const updateAttendanceHoliday = async (
  id: number,
  payload: { holiday_date?: string; name?: string; is_active?: boolean },
): Promise<AttendanceHoliday> => {
  const response = await api.patch(`/attendance/holidays/${id}`, payload);
  return (response.data as { holiday: AttendanceHoliday }).holiday;
};

export const deleteAttendanceHoliday = async (id: number): Promise<void> => {
  await api.delete(`/attendance/holidays/${id}`);
};

export const listAttendanceIncidentTypes = async (includeInactive = true): Promise<AttendanceIncidentType[]> => {
  const response = await api.get('/attendance/incident-types', { params: { include_inactive: includeInactive } });
  return (response.data?.incident_types ?? []) as AttendanceIncidentType[];
};

export const createAttendanceIncidentType = async (payload: IncidentTypePayload): Promise<AttendanceIncidentType> => {
  const response = await api.post('/attendance/incident-types', payload);
  return (response.data as { incident_type: AttendanceIncidentType }).incident_type;
};

export const updateAttendanceIncidentType = async (id: number, payload: IncidentTypePayload): Promise<AttendanceIncidentType> => {
  const response = await api.patch(`/attendance/incident-types/${id}`, payload);
  return (response.data as { incident_type: AttendanceIncidentType }).incident_type;
};

export const getVacationPolicy = async (): Promise<VacationPolicyRow[]> => {
  const response = await api.get('/attendance/vacation-policy');
  return (response.data?.policy ?? []) as VacationPolicyRow[];
};

export const saveVacationPolicyRow = async (fromYear: number, vacationDays: number): Promise<VacationPolicyRow[]> => {
  const response = await api.put(`/attendance/vacation-policy/${fromYear}`, { vacation_days: vacationDays });
  return (response.data?.policy ?? []) as VacationPolicyRow[];
};

export const deleteVacationPolicyRow = async (fromYear: number): Promise<VacationPolicyRow[]> => {
  const response = await api.delete(`/attendance/vacation-policy/${fromYear}`);
  return (response.data?.policy ?? []) as VacationPolicyRow[];
};

export const resetVacationPolicy = async (): Promise<VacationPolicyRow[]> => {
  const response = await api.post('/attendance/vacation-policy/reset');
  return (response.data?.policy ?? []) as VacationPolicyRow[];
};
