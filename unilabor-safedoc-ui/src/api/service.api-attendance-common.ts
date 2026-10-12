import api from './axios';

// Piezas compartidas del modulo Control de Asistencias (sucursales y descargas).

export interface AttendanceBranch {
  id: number;
  code: string;
  name: string;
}

export const listAttendanceBranches = async (): Promise<AttendanceBranch[]> => {
  const response = await api.get('/attendance/branches');
  return (response.data?.branches ?? []) as AttendanceBranch[];
};

/** Descarga un archivo autenticado (Excel/PDF/adjunto) y lo guarda con el nombre indicado. */
export const downloadAttendanceFile = async (
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  fallbackName: string,
): Promise<void> => {
  const cleanParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));
  const response = await api.get(path, { params: cleanParams, responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(response.data as Blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** Abre un archivo autenticado (PDF/imagen) en una pestana nueva. */
export const openAttendanceFile = async (path: string): Promise<void> => {
  const response = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data as Blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
