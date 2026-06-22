import api, { API_BASE_URL } from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import { normalizeHelpdeskAsset } from './service.normalizers';
import type {
  HelpdeskAssetExpedient,
  HelpdeskAssetDocument,
  HelpdeskLifecycleEvent,
  HelpdeskLifecycleEventPayload,
} from '../types/models';

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const fetchAssetExpedient = async (assetId: number): Promise<HelpdeskAssetExpedient | null> => {
  const response = await api.get(`/helpdesk/assets/${assetId}/expedient`);
  const payload = asRecord(unwrapPayload(response.data));
  if (!payload) {
    return null;
  }
  const asset = normalizeHelpdeskAsset(payload.asset);
  if (!asset) {
    return null;
  }
  return {
    asset,
    events: asArray(payload.events) as HelpdeskLifecycleEvent[],
    documents: asArray(payload.documents) as HelpdeskAssetDocument[],
  };
};

export const listAssetLifecycleEvents = async (assetId: number): Promise<HelpdeskLifecycleEvent[]> => {
  const response = await api.get(`/helpdesk/assets/${assetId}/lifecycle-events`);
  return asArray(asRecord(response.data)?.events) as HelpdeskLifecycleEvent[];
};

export const createLifecycleEvent = async (
  assetId: number,
  payload: HelpdeskLifecycleEventPayload,
): Promise<HelpdeskLifecycleEvent | null> => {
  const response = await api.post(`/helpdesk/assets/${assetId}/lifecycle-events`, payload);
  return (asRecord(unwrapPayload(response.data))?.event as HelpdeskLifecycleEvent) ?? null;
};

export const updateLifecycleEvent = async (
  eventId: number,
  payload: HelpdeskLifecycleEventPayload,
): Promise<HelpdeskLifecycleEvent | null> => {
  const response = await api.patch(`/helpdesk/lifecycle-events/${eventId}`, payload);
  return (asRecord(unwrapPayload(response.data))?.event as HelpdeskLifecycleEvent) ?? null;
};

export interface ListAssetDocumentsParams {
  lifecycle_event_id?: number | null;
  document_kind_id?: number | null;
  current_only?: boolean;
}

export const listAssetDocuments = async (
  assetId: number,
  params: ListAssetDocumentsParams = {},
): Promise<HelpdeskAssetDocument[]> => {
  const response = await api.get(`/helpdesk/assets/${assetId}/documents`, { params });
  return asArray(asRecord(response.data)?.documents) as HelpdeskAssetDocument[];
};

export interface UploadAssetDocumentFields {
  title: string;
  document_kind_id?: number | null;
  lifecycle_event_id?: number | null;
  reference_key?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
}

export const uploadAssetDocument = async (
  assetId: number,
  file: File,
  fields: UploadAssetDocumentFields,
): Promise<HelpdeskAssetDocument | null> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', fields.title);
  if (fields.document_kind_id) formData.append('document_kind_id', String(fields.document_kind_id));
  if (fields.lifecycle_event_id) formData.append('lifecycle_event_id', String(fields.lifecycle_event_id));
  if (fields.reference_key) formData.append('reference_key', fields.reference_key);
  if (fields.issued_on) formData.append('issued_on', fields.issued_on);
  if (fields.expires_on) formData.append('expires_on', fields.expires_on);

  const response = await api.post(`/helpdesk/assets/${assetId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return (asRecord(unwrapPayload(response.data))?.document as HelpdeskAssetDocument) ?? null;
};

// URL de descarga segura (blob) para el visor protegido, mismo patron que RH.
export const getAssetDocumentBlobUrl = async (documentId: number): Promise<string> => {
  const response = await api.get(`/helpdesk/asset-documents/${documentId}/view`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

export const assetDocumentDirectUrl = (documentId: number): string =>
  `${API_BASE_URL}/helpdesk/asset-documents/${documentId}/view`;
