import api from './axios';
import { getArrayFromPayload } from './service.shared';
import type {
  AssignableArea,
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
