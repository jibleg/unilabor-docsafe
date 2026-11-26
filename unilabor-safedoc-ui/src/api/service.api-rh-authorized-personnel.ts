import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type {
  AuthorizedPersonnelListing,
  AuthorizedPersonnelRow,
  FormSignerSlot,
  RhAuthorizationLevel,
  RhFormSigner,
  RhFormSignersBySlot,
  RhOrganizationalLevel,
} from '../types/models';

/** API del Listado de personal autorizado (REH-REG-026) y sus catálogos. */

export const getAuthorizedPersonnel = async (): Promise<AuthorizedPersonnelListing> => {
  const response = await api.get('/rh/authorized-personnel');
  return unwrapPayload(response.data) as AuthorizedPersonnelListing;
};

/** Clave de fila que comparte la tabla con el PDF: `empleado:puesto`. */
export const authorizedPersonnelRowKey = (row: Pick<AuthorizedPersonnelRow, 'employee_id' | 'position_id'>): string =>
  `${row.employee_id}:${row.position_id ?? 'none'}`;

/**
 * PDF del listado con el formato controlado, como URL de blob. Lleva las filas
 * que muestra la tabla (con sus filtros) y la descripcion de esos filtros.
 */
export const getAuthorizedPersonnelPdfUrl = async (rows: AuthorizedPersonnelRow[], filterLabel: string): Promise<string> => {
  const response = await api.post(
    '/rh/authorized-personnel/pdf',
    { keys: rows.map(authorizedPersonnelRowKey), ...(filterLabel ? { filter_label: filterLabel } : {}) },
    { responseType: 'blob' },
  );
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

// --- Firmantes del pie del PDF (ELABORÓ / REVISÓ / AUTORIZÓ) ---------------------

export const listFormSigners = async (): Promise<RhFormSignersBySlot> => {
  const response = await api.get('/rh/authorized-personnel/signers');
  return asRecord(unwrapPayload(response.data))?.signers as RhFormSignersBySlot;
};

export interface SaveFormSignerPayload {
  signer_name: string;
  signer_title: string;
  /** PNG en data URL; sin imagen se conserva la firma vigente. */
  image?: string;
}

export const saveFormSigner = async (slot: FormSignerSlot, payload: SaveFormSignerPayload): Promise<{ message: string; signer: RhFormSigner }> => {
  const response = await api.put(`/rh/authorized-personnel/signers/${slot}`, payload);
  const record = asRecord(unwrapPayload(response.data));
  return { message: String(record?.message ?? 'Firmante registrado.'), signer: record?.signer as RhFormSigner };
};

export const retireFormSigner = async (slot: FormSignerSlot): Promise<string> => {
  const response = await api.post(`/rh/authorized-personnel/signers/${slot}/retire`);
  return String(asRecord(unwrapPayload(response.data))?.message ?? 'Firmante retirado.');
};

/** PNG de la firma vigente del puesto como URL de blob (null si no hay firma). */
export const getFormSignerImageUrl = async (slot: FormSignerSlot): Promise<string | null> => {
  try {
    const response = await api.get(`/rh/authorized-personnel/signers/${slot}/image`, { responseType: 'blob' });
    return URL.createObjectURL(response.data as Blob);
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) return null;
    throw error;
  }
};
