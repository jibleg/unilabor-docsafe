import api from './axios';
import { asRecord, buildPageParams, extractPagination, getArrayFromPayload, unwrapPayload } from './service.shared';
import type {
  PageQuery,
  PageResult,
  ClientContactPayload,
  ClientDocumentCategoryPayload,
  ClientDocumentReplacePayload,
  ClientDocumentUploadPayload,
  ClientPayload,
} from './service.shared';
import type {
  ClientContact,
  ClientDocument,
  ClientDocumentCategory,
  ClientNotificationRecipient,
  ClientSummary,
} from '../types/models';

// Modulo Clientes: mirror 1:1 de Proveedores (mismo patron de vigencia y
// derogacion documental), bajo el mismo prefijo `/providers/clients/...`.

// --- Catalogo: clientes -------------------------------------------------------
export interface ClientListQuery extends PageQuery {
  includeInactive?: boolean;
  classificationId?: number | null;
}

export const listClientsPaginated = async (
  query: ClientListQuery = {},
): Promise<PageResult<ClientSummary>> => {
  const params = buildPageParams(query);
  if (query.includeInactive) {
    params.includeInactive = 'true';
  }
  if (query.classificationId) {
    params.classificationId = String(query.classificationId);
  }
  const response = await api.get('/providers/clients/catalog/clients', { params });
  const data = getArrayFromPayload(response.data, ['clients', 'data']) as ClientSummary[];
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const createClientCatalog = async (payload: ClientPayload): Promise<ClientSummary> => {
  const response = await api.post('/providers/clients/catalog/clients', payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.client ?? unwrapPayload(response.data)) as ClientSummary;
};

export const updateClientCatalog = async (
  clientId: number,
  payload: ClientPayload,
): Promise<ClientSummary> => {
  const response = await api.patch(`/providers/clients/catalog/clients/${clientId}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.client ?? unwrapPayload(response.data)) as ClientSummary;
};

export const deactivateClientCatalog = async (clientId: number): Promise<ClientSummary> => {
  const response = await api.post(`/providers/clients/catalog/clients/${clientId}/deactivate`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.client ?? unwrapPayload(response.data)) as ClientSummary;
};

// --- Catalogo: contactos del cliente ------------------------------------------
export const listClientContacts = async (clientId: number): Promise<ClientContact[]> => {
  const response = await api.get(`/providers/clients/catalog/clients/${clientId}/contacts`);
  const payload = asRecord(unwrapPayload(response.data));
  return getArrayFromPayload(payload?.contacts ?? [], ['contacts']) as ClientContact[];
};

export const createClientContact = async (
  clientId: number,
  payload: ClientContactPayload,
): Promise<ClientContact> => {
  const response = await api.post(`/providers/clients/catalog/clients/${clientId}/contacts`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.contact ?? unwrapPayload(response.data)) as ClientContact;
};

export const updateClientContact = async (
  contactId: number,
  payload: ClientContactPayload,
): Promise<ClientContact> => {
  const response = await api.patch(`/providers/clients/catalog/contacts/${contactId}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.contact ?? unwrapPayload(response.data)) as ClientContact;
};

export const deleteClientContact = async (contactId: number): Promise<void> => {
  await api.delete(`/providers/clients/catalog/contacts/${contactId}`);
};

// --- Catalogo: categorias de documento ----------------------------------------
export const listClientDocumentCategories = async (
  includeInactive = false,
): Promise<ClientDocumentCategory[]> => {
  const response = await api.get('/providers/clients/catalog/categories', {
    params: includeInactive ? { includeInactive: true } : {},
  });
  const payload = asRecord(unwrapPayload(response.data));
  return getArrayFromPayload(payload?.categories ?? [], ['categories']) as ClientDocumentCategory[];
};

export const createClientDocumentCategory = async (
  payload: ClientDocumentCategoryPayload,
): Promise<ClientDocumentCategory> => {
  const response = await api.post('/providers/clients/catalog/categories', payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.category ?? unwrapPayload(response.data)) as ClientDocumentCategory;
};

export const updateClientDocumentCategory = async (
  categoryId: number,
  payload: ClientDocumentCategoryPayload,
): Promise<ClientDocumentCategory> => {
  const response = await api.patch(`/providers/clients/catalog/categories/${categoryId}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.category ?? unwrapPayload(response.data)) as ClientDocumentCategory;
};

export const deactivateClientDocumentCategory = async (
  categoryId: number,
): Promise<ClientDocumentCategory> => {
  const response = await api.post(`/providers/clients/catalog/categories/${categoryId}/deactivate`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.category ?? unwrapPayload(response.data)) as ClientDocumentCategory;
};

export const deleteClientDocumentCategory = async (categoryId: number): Promise<void> => {
  await api.delete(`/providers/clients/catalog/categories/${categoryId}`);
};

// --- Documentos: por cliente ---------------------------------------------------
export const listClientDocuments = async (
  clientId: number,
  options: { all?: boolean } = {},
): Promise<{ client: ClientSummary; documents: ClientDocument[] }> => {
  const response = await api.get(`/providers/clients/${clientId}/documents`, {
    params: options.all ? { all: true } : {},
  });
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    client: data.client as ClientSummary,
    documents: getArrayFromPayload(data.documents ?? [], ['documents']) as ClientDocument[],
  };
};

export const getClientDocument = async (
  documentId: number,
): Promise<{ document: ClientDocument; history: ClientDocument[] }> => {
  const response = await api.get(`/providers/clients/documents/${documentId}`);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    document: data.document as ClientDocument,
    history: getArrayFromPayload(data.history ?? [], ['history']) as ClientDocument[],
  };
};

const buildClientDocumentFormData = (payload: {
  category_id?: number | null;
  title?: string | null;
  description?: string | null;
  document_date?: string | null;
  effective_from?: string | null;
  expiry_date?: string | null;
  file: File;
}): FormData => {
  const formData = new FormData();
  if (payload.category_id) {
    formData.append('category_id', String(payload.category_id));
  }
  if (payload.title) {
    formData.append('title', payload.title.trim());
  }
  formData.append('description', payload.description?.trim() ?? '');
  formData.append('document_date', payload.document_date?.trim() || '');
  formData.append('effective_from', payload.effective_from?.trim() || '');
  formData.append('expiry_date', payload.expiry_date?.trim() || '');
  formData.append('file', payload.file);
  return formData;
};

export const uploadClientDocument = async (
  clientId: number,
  payload: ClientDocumentUploadPayload,
): Promise<ClientDocument> => {
  const formData = buildClientDocumentFormData(payload);
  const response = await api.post(`/providers/clients/${clientId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const data = asRecord(unwrapPayload(response.data));
  return (data?.document ?? unwrapPayload(response.data)) as ClientDocument;
};

export const replaceClientDocument = async (
  documentId: number,
  payload: ClientDocumentReplacePayload,
): Promise<{ document: ClientDocument; supersededDocument: unknown }> => {
  const formData = buildClientDocumentFormData(payload);
  const response = await api.patch(`/providers/clients/documents/${documentId}/replace`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    document: data.document as ClientDocument,
    supersededDocument: data.supersededDocument,
  };
};

export const deactivateClientDocument = async (documentId: number): Promise<ClientDocument> => {
  const response = await api.post(`/providers/clients/documents/${documentId}/deactivate`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.document ?? unwrapPayload(response.data)) as ClientDocument;
};

export const deleteClientDocument = async (documentId: number): Promise<void> => {
  await api.delete(`/providers/clients/documents/${documentId}`);
};

// Descarga protegida (blob), mismo patron que el visor de Proveedores.
export const getClientDocumentBlobUrl = async (documentId: number): Promise<string> => {
  const response = await api.get(`/providers/clients/documents/${documentId}/view`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

// --- Configuracion: destinatarios de alerta de vencimiento --------------------
export const listClientNotificationRecipients = async (): Promise<ClientNotificationRecipient[]> => {
  const response = await api.get('/providers/clients/config/recipients');
  const data = asRecord(unwrapPayload(response.data));
  return getArrayFromPayload(data?.recipients ?? [], ['recipients']) as ClientNotificationRecipient[];
};

export const addClientNotificationRecipient = async (
  userId: string,
): Promise<ClientNotificationRecipient> => {
  const response = await api.post('/providers/clients/config/recipients', { user_id: userId });
  const data = asRecord(unwrapPayload(response.data));
  return (data?.recipient ?? unwrapPayload(response.data)) as ClientNotificationRecipient;
};

export const removeClientNotificationRecipient = async (recipientId: number): Promise<void> => {
  await api.delete(`/providers/clients/config/recipients/${recipientId}`);
};
