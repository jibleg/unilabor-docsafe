import api from './axios';
import { getArrayFromPayload } from './service.shared';
import type {
  AssignableArea,
  MyReading,
  ReadingAssignment,
  ReadingPublication,
  ReadingPublicationStatus,
} from '../types/models';

// Sala de Lectura (Calidad). La fuente es un documento vigente del SGC: aqui no
// se sube ni se copia nada, solo se publica a lectura lo que ya esta controlado.

export const listReadingPublications = async (
  status?: ReadingPublicationStatus,
): Promise<ReadingPublication[]> => {
  const response = await api.get('/quality/readings', {
    params: status ? { status } : {},
  });
  return getArrayFromPayload(response.data, ['publications', 'items', 'results']) as
    ReadingPublication[];
};

export const publishReading = async (payload: {
  document_id: string;
  deadline_hours?: number;
  min_seconds_per_page?: number;
  instructions?: string | null;
}): Promise<ReadingPublication> => {
  const response = await api.post('/quality/readings', payload);
  return response.data as ReadingPublication;
};

export const getReadingPublication = async (
  publicationId: number,
): Promise<{ publication: ReadingPublication; readers: ReadingAssignment[] }> => {
  const response = await api.get(`/quality/readings/${publicationId}`);
  return response.data as { publication: ReadingPublication; readers: ReadingAssignment[] };
};

export const listAssignableAreas = async (): Promise<AssignableArea[]> => {
  const response = await api.get('/quality/readings/areas');
  return getArrayFromPayload(response.data, ['areas', 'items', 'results']) as AssignableArea[];
};

/** Las tres formas de asignar: individual, por area, o a todos. */
export type AssignReadersPayload =
  | { mode: 'users'; user_ids: string[]; deadline_hours?: number }
  | { mode: 'area'; area: string; deadline_hours?: number }
  | { mode: 'all'; deadline_hours?: number };

export const assignReaders = async (
  publicationId: number,
  payload: AssignReadersPayload,
): Promise<{ created: ReadingAssignment[]; skipped_user_ids: string[] }> => {
  const response = await api.post(`/quality/readings/${publicationId}/readers`, payload);
  return response.data as { created: ReadingAssignment[]; skipped_user_ids: string[] };
};

export const closeReadingPublication = async (
  publicationId: number,
): Promise<ReadingPublication> => {
  const response = await api.post(`/quality/readings/${publicationId}/close`);
  return response.data as ReadingPublication;
};

export const cancelReadingAssignment = async (
  publicationId: number,
  readingId: number,
): Promise<void> => {
  await api.delete(`/quality/readings/${publicationId}/readers/${readingId}`);
};

// --- Sala de lectura del colaborador ----------------------------------------

export const listMyReadings = async (): Promise<MyReading[]> => {
  const response = await api.get('/quality/me/readings');
  return getArrayFromPayload(response.data, ['readings', 'items', 'results']) as MyReading[];
};

/**
 * Latido del visor. Solo reporta la pagina: el tiempo lo mide el servidor, asi
 * que aqui no hay nada que "ayudar" a acumular.
 */
export const reportReadingProgress = async (
  readingId: number,
  page: number,
): Promise<MyReading> => {
  const response = await api.post(`/quality/me/readings/${readingId}/progress`, { page });
  return response.data as MyReading;
};

export const signMyReading = async (
  readingId: number,
  signature: string,
): Promise<MyReading> => {
  const response = await api.post(`/quality/me/readings/${readingId}/sign`, { signature });
  return response.data as MyReading;
};
