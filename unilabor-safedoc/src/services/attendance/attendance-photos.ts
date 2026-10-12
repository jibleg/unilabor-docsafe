import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DetectedImage } from './punch-mapping';

/**
 * Fotos de las checadas. photo_path se guarda RELATIVO a este directorio base
 * ('AAAA-MM/<uuid>.<ext>'); quien las sirva debe resolverlas con resolvePunchPhotoPath.
 */

export const getPunchPhotosDir = (): string =>
  path.resolve(process.env.DIRECTORY_UPLOAD_ATTENDANCE?.trim() || path.join('uploads', 'attendance-punches'));

/** Ruta absoluta de una foto; null si el valor intenta salir del directorio base. */
export const resolvePunchPhotoPath = (photoPath: string): string | null => {
  const base = getPunchPhotosDir();
  const full = path.resolve(base, photoPath);
  return full.startsWith(base + path.sep) ? full : null;
};

export const savePunchPhoto = async (image: DetectedImage, now: Date = new Date()): Promise<string> => {
  const relative = `${now.toISOString().slice(0, 7)}/${randomUUID()}.${image.extension}`;
  const full = path.join(getPunchPhotosDir(), relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, image.bytes, { flag: 'wx' });
  return relative;
};

export const discardPunchPhoto = async (photoPath: string): Promise<void> => {
  const full = resolvePunchPhotoPath(photoPath);
  if (full) await unlink(full).catch(() => undefined);
};
