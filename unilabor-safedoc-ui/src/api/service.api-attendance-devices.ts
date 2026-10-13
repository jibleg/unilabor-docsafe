import api from './axios';

// Cliente de Relojes (agentes y terminales HikVision) del modulo Control de Asistencias.

export interface AttendanceAgent {
  id: number;
  branch_id: number;
  branch_name: string;
  name: string;
  api_key_prefix: string;
  software_version: string | null;
  host_name: string | null;
  operating_system: string | null;
  local_ip: string | null;
  last_heartbeat_at: string | null;
  is_online: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AttendanceTerminal {
  id: number;
  agent_id: number;
  serial_number: string;
  name: string;
  model: string | null;
  firmware_version: string | null;
  local_ip: string | null;
  is_active: boolean;
  is_online: boolean;
  clock_drift_seconds: number | null;
  enrolled_people_count: number | null;
  last_event_at: string | null;
  last_heartbeat_at: string | null;
}

export interface DevicesBranchOverview {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  agent: AttendanceAgent | null;
  terminals: AttendanceTerminal[];
  pending_sync_count: number;
  open_orders_count: number;
}

export interface DevicesOverview {
  agent_offline_min: number;
  branches: DevicesBranchOverview[];
}

export interface AgentKeyResult {
  agent: AttendanceAgent;
  agent_key: string;
  config: { docsafeUrl: string; agentKey: string };
}

export type DeviceOrderType =
  | 'sync_person'
  | 'remove_person'
  | 'enroll_fingerprint'
  | 'enroll_face'
  | 'fetch_events'
  | 'check_status';
export type DeviceOrderStatus = 'pending' | 'processing' | 'done' | 'error';

export interface DeviceOrder {
  id: number;
  agent_id: number;
  terminal_id: number | null;
  terminal_name: string | null;
  terminal_serial: string | null;
  employee_id: number | null;
  employee_name: string | null;
  order_type: DeviceOrderType | string;
  payload: Record<string, unknown> | null;
  order_status: DeviceOrderStatus;
  result: Record<string, unknown> | null;
  error_message: string | null;
  attempt_count: number;
  created_at: string;
  picked_up_at: string | null;
  finished_at: string | null;
}

export interface DeviceOrdersPage {
  orders: DeviceOrder[];
  total: number;
  page: number;
  limit: number;
}

export interface SyncResult {
  queued: number;
  queued_sync: number;
  queued_remove: number;
  skipped_without_number: number;
  skipped_invalid_number?: number;
}

export const getDevicesOverview = async (): Promise<DevicesOverview> => {
  const response = await api.get('/attendance/devices/overview');
  return response.data as DevicesOverview;
};

export const createAttendanceAgent = async (payload: { branch_id: number; name: string }): Promise<AgentKeyResult> => {
  const response = await api.post('/attendance/devices/agents', payload);
  return response.data as AgentKeyResult;
};

export const rotateAttendanceAgentKey = async (agentId: number): Promise<AgentKeyResult> => {
  const response = await api.post(`/attendance/devices/agents/${agentId}/rotate-key`);
  return response.data as AgentKeyResult;
};

export const updateAttendanceAgent = async (
  agentId: number,
  payload: { name?: string; is_active?: boolean },
): Promise<AttendanceAgent> => {
  const response = await api.patch(`/attendance/devices/agents/${agentId}`, payload);
  return (response.data as { agent: AttendanceAgent }).agent;
};

export const deleteAttendanceAgent = async (agentId: number): Promise<void> => {
  await api.delete(`/attendance/devices/agents/${agentId}`);
};

export const updateAttendanceTerminal = async (
  terminalId: number,
  payload: { name?: string; is_active?: boolean },
): Promise<void> => {
  await api.patch(`/attendance/devices/terminals/${terminalId}`, payload);
};

export const listDeviceOrders = async (params: {
  agent_id?: number;
  status?: DeviceOrderStatus;
  page: number;
  limit: number;
}): Promise<DeviceOrdersPage> => {
  const response = await api.get('/attendance/devices/orders', { params });
  return response.data as DeviceOrdersPage;
};

export const testAttendanceAgent = async (agentId: number): Promise<number> => {
  const response = await api.post(`/attendance/devices/agents/${agentId}/test`);
  return (response.data as { order_id: number }).order_id;
};

export const syncAttendanceAgent = async (agentId: number, all: boolean): Promise<SyncResult> => {
  const response = await api.post(`/attendance/devices/agents/${agentId}/sync`, { all });
  return response.data as SyncResult;
};
