import api from './axios';
import { asRecord, buildPageParams, extractPagination, getArrayFromPayload, unwrapPayload } from './service.shared';
import type {
  PageQuery,
  PageResult,
  ProviderContactPayload,
  ProviderDocumentCategoryPayload,
  ProviderDocumentReplacePayload,
  ProviderDocumentUploadPayload,
  ProviderPayload,
} from './service.shared';
import type {
  ProviderContact,
  ProviderDocument,
  ProviderDocumentCategory,
  ProviderNotificationRecipient,
  ProviderSummary,
} from '../types/models';

// Modulo Proveedores: gestion documental de contratos/convenios con vigencia
// y derogacion. El catalogo de proveedores es el mismo `helpdesk_suppliers`
// que ya usa Activos; Proveedores tiene su propia alta/edicion (gated por
// PROVIDERS.CATALOG.MANAGE) ademas del alta que ya existia en Activos.

// --- Catalogo: proveedores ---------------------------------------------------
export interface ProviderListQuery extends PageQuery {
  includeInactive?: boolean;
}

export const listProvidersPaginated = async (
  query: ProviderListQuery = {},
): Promise<PageResult<ProviderSummary>> => {
  const params = buildPageParams(query);
  if (query.includeInactive) {
    params.includeInactive = 'true';
  }
  const response = await api.get('/providers/catalog/providers', { params });
  const data = getArrayFromPayload(response.data, ['providers', 'data']) as ProviderSummary[];
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const createProviderCatalog = async (payload: ProviderPayload): Promise<ProviderSummary> => {
  const response = await api.post('/providers/catalog/providers', payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.provider ?? unwrapPayload(response.data)) as ProviderSummary;
};

export const updateProviderCatalog = async (
  providerId: number,
  payload: ProviderPayload,
): Promise<ProviderSummary> => {
  const response = await api.patch(`/providers/catalog/providers/${providerId}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.provider ?? unwrapPayload(response.data)) as ProviderSummary;
};

export const deactivateProviderCatalog = async (providerId: number): Promise<ProviderSummary> => {
  const response = await api.post(`/providers/catalog/providers/${providerId}/deactivate`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.provider ?? unwrapPayload(response.data)) as ProviderSummary;
};

// --- Catalogo: contactos del proveedor ---------------------------------------
export const listProviderContacts = async (providerId: number): Promise<ProviderContact[]> => {
  const response = await api.get(`/providers/catalog/providers/${providerId}/contacts`);
  const payload = asRecord(unwrapPayload(response.data));
  return getArrayFromPayload(payload?.contacts ?? [], ['contacts']) as ProviderContact[];
};

export const createProviderContact = async (
  providerId: number,
  payload: ProviderContactPayload,
): Promise<ProviderContact> => {
  const response = await api.post(`/providers/catalog/providers/${providerId}/contacts`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.contact ?? unwrapPayload(response.data)) as ProviderContact;
};

export const updateProviderContact = async (
  contactId: number,
  payload: ProviderContactPayload,
): Promise<ProviderContact> => {
  const response = await api.patch(`/providers/catalog/contacts/${contactId}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.contact ?? unwrapPayload(response.data)) as ProviderContact;
};

export const deleteProviderContact = async (contactId: number): Promise<void> => {
  await api.delete(`/providers/catalog/contacts/${contactId}`);
};

// --- Catalogo: categorias de documento --------------------------------------
export const listProviderDocumentCategories = async (
  includeInactive = false,
): Promise<ProviderDocumentCategory[]> => {
  const response = await api.get('/providers/catalog/categories', {
    params: includeInactive ? { includeInactive: true } : {},
  });
  const payload = asRecord(unwrapPayload(response.data));
  return getArrayFromPayload(payload?.categories ?? [], ['categories']) as ProviderDocumentCategory[];
};

export const createProviderDocumentCategory = async (
  payload: ProviderDocumentCategoryPayload,
): Promise<ProviderDocumentCategory> => {
  const response = await api.post('/providers/catalog/categories', payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.category ?? unwrapPayload(response.data)) as ProviderDocumentCategory;
};

export const updateProviderDocumentCategory = async (
  categoryId: number,
  payload: ProviderDocumentCategoryPayload,
): Promise<ProviderDocumentCategory> => {
  const response = await api.patch(`/providers/catalog/categories/${categoryId}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.category ?? unwrapPayload(response.data)) as ProviderDocumentCategory;
};

export const deactivateProviderDocumentCategory = async (
  categoryId: number,
): Promise<ProviderDocumentCategory> => {
  const response = await api.post(`/providers/catalog/categories/${categoryId}/deactivate`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.category ?? unwrapPayload(response.data)) as ProviderDocumentCategory;
};

export const deleteProviderDocumentCategory = async (categoryId: number): Promise<void> => {
  await api.delete(`/providers/catalog/categories/${categoryId}`);
};

// --- Documentos: por proveedor -----------------------------------------------
export const listProviderDocuments = async (
  providerId: number,
  options: { all?: boolean } = {},
): Promise<{ provider: ProviderSummary; documents: ProviderDocument[] }> => {
  const response = await api.get(`/providers/${providerId}/documents`, {
    params: options.all ? { all: true } : {},
  });
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    provider: data.provider as ProviderSummary,
    documents: getArrayFromPayload(data.documents ?? [], ['documents']) as ProviderDocument[],
  };
};

export const getProviderDocument = async (
  documentId: number,
): Promise<{ document: ProviderDocument; history: ProviderDocument[] }> => {
  const response = await api.get(`/providers/documents/${documentId}`);
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    document: data.document as ProviderDocument,
    history: getArrayFromPayload(data.history ?? [], ['history']) as ProviderDocument[],
  };
};

const buildProviderDocumentFormData = (payload: {
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

export const uploadProviderDocument = async (
  providerId: number,
  payload: ProviderDocumentUploadPayload,
): Promise<ProviderDocument> => {
  const formData = buildProviderDocumentFormData(payload);
  const response = await api.post(`/providers/${providerId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const data = asRecord(unwrapPayload(response.data));
  return (data?.document ?? unwrapPayload(response.data)) as ProviderDocument;
};

export const replaceProviderDocument = async (
  documentId: number,
  payload: ProviderDocumentReplacePayload,
): Promise<{ document: ProviderDocument; supersededDocument: unknown }> => {
  const formData = buildProviderDocumentFormData(payload);
  const response = await api.patch(`/providers/documents/${documentId}/replace`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const data = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    document: data.document as ProviderDocument,
    supersededDocument: data.supersededDocument,
  };
};

export const deactivateProviderDocument = async (documentId: number): Promise<ProviderDocument> => {
  const response = await api.post(`/providers/documents/${documentId}/deactivate`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.document ?? unwrapPayload(response.data)) as ProviderDocument;
};

export const deleteProviderDocument = async (documentId: number): Promise<void> => {
  await api.delete(`/providers/documents/${documentId}`);
};

// Descarga protegida (blob), mismo patron que el visor de evidencias de Activos.
export const getProviderDocumentBlobUrl = async (documentId: number): Promise<string> => {
  const response = await api.get(`/providers/documents/${documentId}/view`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
};

// --- Configuracion: destinatarios de alerta de vencimiento -------------------
export const listProviderNotificationRecipients = async (): Promise<ProviderNotificationRecipient[]> => {
  const response = await api.get('/providers/config/recipients');
  const data = asRecord(unwrapPayload(response.data));
  return getArrayFromPayload(data?.recipients ?? [], ['recipients']) as ProviderNotificationRecipient[];
};

export const addProviderNotificationRecipient = async (
  userId: string,
): Promise<ProviderNotificationRecipient> => {
  const response = await api.post('/providers/config/recipients', { user_id: userId });
  const data = asRecord(unwrapPayload(response.data));
  return (data?.recipient ?? unwrapPayload(response.data)) as ProviderNotificationRecipient;
};

export const removeProviderNotificationRecipient = async (recipientId: number): Promise<void> => {
  await api.delete(`/providers/config/recipients/${recipientId}`);
};
