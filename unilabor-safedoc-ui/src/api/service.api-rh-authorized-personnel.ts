import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type { AuthorizedPersonnelListing, RhAuthorizationLevel, RhOrganizationalLevel } from '../types/models';

/** API del Listado de personal autorizado (REH-REG-026) y sus catálogos. */

export const getAuthorizedPersonnel = async (): Promise<AuthorizedPersonnelListing> => {
  const response = await api.get('/rh/authorized-personnel');
  return unwrapPayload(response.data) as AuthorizedPersonnelListing;
};

/** PDF del listado con el formato controlado, como URL de blob. */
export const getAuthorizedPersonnelPdfUrl = async (): Promise<string> => {
  const response = await api.get('/rh/authorized-personnel/pdf', { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

/** Fija o corrige el nivel de una evaluación ya autorizada. */
export const setEvaluationAuthorizationLevel = async (evaluationId: number, authorizationLevelId: number): Promise<string> => {
  const response = await api.put(`/rh/authorized-personnel/evaluations/${evaluationId}/authorization-level`, {
    authorization_level_id: authorizationLevelId,
  });
  return String(asRecord(unwrapPayload(response.data))?.message ?? 'Nivel de autorización registrado.');
};

export const listOrganizationalLevels = async (includeInactive = false): Promise<RhOrganizationalLevel[]> => {
  const response = await api.get('/rh/organizational-levels', { params: includeInactive ? { include_inactive: 'true' } : {} });
  return (asRecord(unwrapPayload(response.data))?.levels as RhOrganizationalLevel[]) ?? [];
};

export interface OrganizationalLevelPayload {
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export const saveOrganizationalLevel = async (id: number | null, payload: OrganizationalLevelPayload): Promise<RhOrganizationalLevel> => {
  const response = id ? await api.put(`/rh/organizational-levels/${id}`, payload) : await api.post('/rh/organizational-levels', payload);
  return asRecord(unwrapPayload(response.data))?.level as RhOrganizationalLevel;
};

export const listAuthorizationLevels = async (includeInactive = false): Promise<RhAuthorizationLevel[]> => {
  const response = await api.get('/rh/authorization-levels', { params: includeInactive ? { include_inactive: 'true' } : {} });
  return (asRecord(unwrapPayload(response.data))?.levels as RhAuthorizationLevel[]) ?? [];
};

export interface AuthorizationLevelPayload {
  level_no: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

export const saveAuthorizationLevel = async (id: number | null, payload: AuthorizationLevelPayload): Promise<RhAuthorizationLevel> => {
  const response = id ? await api.put(`/rh/authorization-levels/${id}`, payload) : await api.post('/rh/authorization-levels', payload);
  return asRecord(unwrapPayload(response.data))?.level as RhAuthorizationLevel;
};
