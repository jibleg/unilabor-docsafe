import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pool from '../../config/db';

/** Ubicacion y lectura de las fotos de rostro (sin dependencias del resto del modulo). */

export const getFacePhotosDir = (): string =>
  path.resolve(process.env.DIRECTORY_UPLOAD_ATTENDANCE_FACES?.trim() || path.join('uploads', 'attendance-faces'));

/** Ruta absoluta de una foto; null si el valor intenta salir del directorio base. */
export const resolveFacePhotoPath = (relative: string): string | null => {
  const base = getFacePhotosDir();
  const full = path.resolve(base, relative);
  return full.startsWith(base + path.sep) ? full : null;
};

/** Foto vigente en base64 para la orden del agente; null si no hay o no se puede leer. */
export const loadFacePhotoBase64 = async (employeeId: number): Promise<string | null> => {
  const { rows } = await pool.query<{ face_photo_path: string | null }>(
    'SELECT face_photo_path FROM attendance.employee_profiles WHERE employee_id = $1',
    [employeeId],
  );
  const relative = rows[0]?.face_photo_path;
  const full = relative ? resolveFacePhotoPath(relative) : null;
  if (!full) return null;
  try {
    return (await readFile(full)).toString('base64');
  } catch {
    return null;
  }
};
