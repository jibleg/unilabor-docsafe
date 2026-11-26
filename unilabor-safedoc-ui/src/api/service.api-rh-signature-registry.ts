import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type {
  RhDiscipline,
  SignatureAuthorizationPayload,
  SignatureRegistryListing,
  SignatureRegistryRow,
  SignatureSpecimen,
  SignatureSpecimenHistoryItem,
  SignatureSpecimenKind,
  SigningScopeProposal,
} from '../types/models';

/** API del Registro de firmas autorizadas (REH-REG-027). */

const BASE = '/rh/signature-registry';

export const getSignatureRegistry = async (): Promise<SignatureRegistryListing> => {
  const response = await api.get(BASE);
  return unwrapPayload(response.data) as SignatureRegistryListing;
};

/** Clave de fila que comparte la tabla con el PDF: `empleado:puesto`. */
export const signatureRegistryRowKey = (row: Pick<SignatureRegistryRow, 'employee_id' | 'position_id'>): string => `${row.employee_id}:${row.position_id}`;

/** PDF del registro con las filas que muestra la tabla y la descripción de sus filtros, como URL de blob. */
export const getSignatureRegistryPdfUrl = async (rows: SignatureRegistryRow[]): Promise<string> => {
  const response = await api.post(`${BASE}/pdf`, { keys: rows.map(signatureRegistryRowKey) }, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

export const saveSignatureAuthorization = async (employeeId: number, positionId: number, payload: SignatureAuthorizationPayload): Promise<string> => {
  const response = await api.put(`${BASE}/${employeeId}/${positionId}`, payload);
  return String(asRecord(unwrapPayload(response.data))?.message ?? 'Fila del registro guardada.');
};

export const proposeSigningScope = async (employeeId: number, positionId: number): Promise<SigningScopeProposal> => {
  const response = await api.get(`${BASE}/${employeeId}/${positionId}/scope-proposal`);
  return unwrapPayload(response.data) as SigningScopeProposal;
};

// --- Disciplinas ---------------------------------------------------------------

export const listDisciplines = async (includeInactive = false): Promise<RhDiscipline[]> => {
  const response = await api.get(`${BASE}/disciplines`, { params: includeInactive ? { include_inactive: 'true' } : {} });
  return (asRecord(unwrapPayload(response.data))?.disciplines as RhDiscipline[]) ?? [];
};

export const saveDiscipline = async (id: number | null, payload: { name: string; is_active: boolean }): Promise<RhDiscipline> => {
  const response = id ? await api.put(`${BASE}/disciplines/${id}`, payload) : await api.post(`${BASE}/disciplines`, payload);
  return asRecord(unwrapPayload(response.data))?.discipline as RhDiscipline;
};

// --- Especímenes ---------------------------------------------------------------

export const listSpecimens = async (employeeId: number): Promise<SignatureSpecimenHistoryItem[]> => {
  const response = await api.get(`${BASE}/${employeeId}/specimens`);
  return (asRecord(unwrapPayload(response.data))?.specimens as SignatureSpecimenHistoryItem[]) ?? [];
};

export interface RegisterSpecimenPayload {
  kind: SignatureSpecimenKind;
  /** Data URL PNG del espécimen (archivo o portapapeles). */
  image?: string;
  source?: 'UPLOAD' | 'CLIPBOARD';
  /** Copia la última firma del colaborador en SafeDoc. */
  from_last_signature?: boolean;
}

export const registerSpecimen = async (employeeId: number, payload: RegisterSpecimenPayload): Promise<{ message: string; specimen: SignatureSpecimen }> => {
  const response = await api.post(`${BASE}/${employeeId}/specimens`, payload);
  const record = asRecord(unwrapPayload(response.data));
  return { message: String(record?.message ?? 'Espécimen registrado.'), specimen: record?.specimen as SignatureSpecimen };
};

export const retireSpecimen = async (id: number): Promise<string> => {
  const response = await api.post(`${BASE}/specimens/${id}/retire`);
  return String(asRecord(unwrapPayload(response.data))?.message ?? 'Espécimen retirado.');
};

const specimenUrlCache = new Map<number, Promise<string>>();

/** PNG del espécimen como URL de blob (con el token de la sesión); se memoriza por id. */
export const getSpecimenImageUrl = (id: number): Promise<string> => {
  const cached = specimenUrlCache.get(id);
  if (cached) return cached;
  const pending = api
    .get(`${BASE}/specimens/${id}/image`, { responseType: 'blob' })
    .then((response) => URL.createObjectURL(response.data as Blob))
    .catch((error: unknown) => {
      specimenUrlCache.delete(id);
      throw error;
    });
  specimenUrlCache.set(id, pending);
  return pending;
};
