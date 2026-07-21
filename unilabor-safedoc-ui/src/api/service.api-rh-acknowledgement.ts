import api from './axios';
import { getArrayFromPayload, unwrapPayload } from './service.shared';
import type {
  AcknowledgementStatus,
  DocumentAcknowledgement,
  InstitutionalDocument,
} from '../types/models';

// Acuse de lectura y firma autografa de documentos institucionales (RH-ACK).
// El documento lo carga RH una vez; cada lector recibe su copia firmada en su
// propio expediente.

// --- Documentos institucionales (la fuente que se lee) ----------------------

export const listInstitutionalDocuments = async (
  includeInactive = false,
): Promise<InstitutionalDocument[]> => {
  const response = await api.get('/rh/institutional-documents', {
    params: includeInactive ? { include_inactive: 'true' } : {},
  });
  return getArrayFromPayload(response.data, [
    'documents',
    'items',
    'results',
  ]) as InstitutionalDocument[];
};

export const createInstitutionalDocument = async (payload: {
  title: string;
  description?: string;
  target_document_type_id: number;
  file: File;
}): Promise<InstitutionalDocument> => {
  const form = new FormData();
  form.append('title', payload.title);
  if (payload.description) {
    form.append('description', payload.description);
  }
  form.append('target_document_type_id', String(payload.target_document_type_id));
  form.append('file', payload.file);

  const response = await api.post('/rh/institutional-documents', form);
  return unwrapPayload(response.data) as InstitutionalDocument;
};

export const deactivateInstitutionalDocument = async (documentId: number): Promise<void> => {
  await api.delete(`/rh/institutional-documents/${documentId}`);
};

// --- Asignacion y seguimiento (lado RH) -------------------------------------

export interface AssignAcknowledgementPayload {
  employee_ids: number[];
  deadline_hours?: number;
  min_seconds_per_page?: number;
}

export interface AssignAcknowledgementResult {
  created: DocumentAcknowledgement[];
  skipped_employee_ids: number[];
}

export interface AcknowledgementFilters {
  status?: AcknowledgementStatus | null;
  employeeId?: number | null;
  institutionalDocumentId?: number | null;
}

export const assignAcknowledgements = async (
  documentId: number,
  payload: AssignAcknowledgementPayload,
): Promise<AssignAcknowledgementResult> => {
  const response = await api.post(
    `/rh/institutional-documents/${documentId}/acknowledgements`,
    payload,
  );
  const data = unwrapPayload(response.data) as AssignAcknowledgementResult;
  return {
    created: data?.created ?? [],
    skipped_employee_ids: data?.skipped_employee_ids ?? [],
  };
};

export const listAcknowledgements = async (
  filters: AcknowledgementFilters = {},
): Promise<DocumentAcknowledgement[]> => {
  const params: Record<string, string | number> = {};
  if (filters.status) {
    params.status = filters.status;
  }
  if (filters.employeeId) {
    params.employee_id = filters.employeeId;
  }
  if (filters.institutionalDocumentId) {
    params.institutional_document_id = filters.institutionalDocumentId;
  }
  const response = await api.get('/rh/acknowledgements', { params });
  return getArrayFromPayload(response.data, [
    'acknowledgements',
    'items',
    'results',
  ]) as DocumentAcknowledgement[];
};

export const cancelAcknowledgement = async (acknowledgementId: number): Promise<void> => {
  await api.delete(`/rh/acknowledgements/${acknowledgementId}`);
};

// --- Autoservicio del colaborador -------------------------------------------

export const listMyAcknowledgements = async (): Promise<DocumentAcknowledgement[]> => {
  const response = await api.get('/rh/me/acknowledgements');
  return getArrayFromPayload(response.data, [
    'acknowledgements',
    'items',
    'results',
  ]) as DocumentAcknowledgement[];
};

/**
 * Firma el acuse. La IP y el navegador los toma el servidor de la peticion, no
 * se envian desde aqui.
 */
export const signAcknowledgement = async (
  acknowledgementId: number,
  signature: string,
): Promise<DocumentAcknowledgement> =>
  unwrapPayload(
    (await api.post(`/rh/me/acknowledgements/${acknowledgementId}/sign`, { signature })).data,
  ) as DocumentAcknowledgement;

/**
 * Latido del visor: solo reporta la pagina actual. Los segundos los mide el
 * servidor con su propio reloj; mandarlos desde aqui permitiria saltarse el gate.
 */
export const reportReadingProgress = async (
  acknowledgementId: number,
  page: number,
): Promise<DocumentAcknowledgement> =>
  unwrapPayload(
    (await api.post(`/rh/me/acknowledgements/${acknowledgementId}/progress`, { page })).data,
  ) as DocumentAcknowledgement;
