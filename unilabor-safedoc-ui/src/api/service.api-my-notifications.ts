import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type { EmployeeXlabLink, MyNotification, MyNotificationsPage, XlabUser } from '../types/models';

// Mis notificaciones de Contigo+. La identidad la pone el backend (sesión -> vínculo
// con XLab); desde aquí nunca viaja la clave de XLab del destinatario.

const BASE = '/my/notifications';

export const listMyNotifications = async (limit: number, offset: number): Promise<MyNotificationsPage> => {
  const response = await api.get(BASE, { params: { limit, offset } });
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    linked: Boolean(data.linked),
    available: Boolean(data.available),
    rows: (data.rows as MyNotification[]) ?? [],
    total: Number(data.total ?? 0),
    unread: Number(data.unread ?? 0),
  };
};

export const getMyNotificationsCount = async (): Promise<number> => {
  const response = await api.get(`${BASE}/count`);
  return Number(asRecord(unwrapPayload(response.data))?.count ?? 0);
};

export const markMyNotificationRead = async (id: string): Promise<void> => {
  await api.post(`${BASE}/${id}/read`);
};

export const markAllMyNotificationsRead = async (): Promise<void> => {
  await api.post(`${BASE}/read-all`);
};

// Vínculo con XLab desde la ficha del colaborador (RH).

const linkFrom = (payload: unknown): EmployeeXlabLink => asRecord(unwrapPayload(payload))?.link as EmployeeXlabLink;

export const getEmployeeXlabLink = async (employeeId: number): Promise<EmployeeXlabLink> =>
  linkFrom((await api.get(`/employees/${employeeId}/xlab-link`)).data);

export const listAvailableXlabUsers = async (): Promise<XlabUser[]> => {
  const response = await api.get('/employees/xlab-users');
  return (asRecord(unwrapPayload(response.data))?.users as XlabUser[]) ?? [];
};

export const createEmployeeXlabLink = async (employeeId: number, cveUsuario: number): Promise<EmployeeXlabLink> =>
  linkFrom((await api.post(`/employees/${employeeId}/xlab-link`, { cve_usuario: cveUsuario })).data);

export const updateEmployeeXlabLink = async (employeeId: number, cveUsuario: number): Promise<EmployeeXlabLink> =>
  linkFrom((await api.put(`/employees/${employeeId}/xlab-link`, { cve_usuario: cveUsuario })).data);

export const deleteEmployeeXlabLink = async (employeeId: number): Promise<void> => {
  await api.delete(`/employees/${employeeId}/xlab-link`);
};
