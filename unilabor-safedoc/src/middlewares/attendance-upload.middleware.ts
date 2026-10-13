import { randomUUID } from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';

/**
 * Cargas del modulo de asistencias (multer propio, independiente de
 * upload.middleware.ts): comprobantes de incidencias a disco y plantilla Excel
 * de importacion en memoria.
 */

const MB = 1024 * 1024;

export const INCIDENT_FILE_MAX_BYTES = 5 * MB;
export const INCIDENT_FILE_MAX_COUNT = 3;
export const IMPORT_FILE_MAX_BYTES = 2 * MB;
export const FACE_PHOTO_MAX_BYTES = 400 * 1024;

const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export const getIncidentUploadRoot = (): string =>
  process.env.DIRECTORY_UPLOAD_ATTENDANCE_INCIDENTS || 'uploads/attendance-incidents';

const incidentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const month = new Date().toISOString().slice(0, 7);
    const directory = path.join(getIncidentUploadRoot(), month);
    fs.mkdirSync(directory, { recursive: true });
    cb(null, directory);
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${ALLOWED_MIME_EXTENSIONS[file.mimetype] ?? ''}`);
  },
});

const incidentUpload = multer({
  storage: incidentStorage,
  limits: { fileSize: INCIDENT_FILE_MAX_BYTES, files: INCIDENT_FILE_MAX_COUNT },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_EXTENSIONS[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos JPG, PNG, WebP o PDF.'));
    }
  },
}).fields([
  { name: 'files', maxCount: INCIDENT_FILE_MAX_COUNT },
  { name: 'file', maxCount: 1 },
]);

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_FILE_MAX_BYTES, files: 1 },
}).single('file');

const facePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FACE_PHOTO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg') cb(null, true);
    else cb(new Error('La fotografía debe ser una imagen JPEG.'));
  },
}).single('photo');

const translateUploadError = (error: unknown, fileLimit: string): string => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return `El archivo excede el tamano maximo permitido (${fileLimit}).`;
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return `Solo se permiten hasta ${INCIDENT_FILE_MAX_COUNT} archivos, en el campo "files".`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'No se pudo procesar el archivo.';
};

const wrap =
  (handler: RequestHandler, fileLimit: string): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error?: unknown) => {
      if (error) {
        res.status(400).json({ message: translateUploadError(error, fileLimit) });
        return;
      }
      next();
    });
  };

/** Comprobantes de incidencia: campo `files` (hasta 3) o `file`; JPG/PNG/WebP/PDF de 5 MB. */
export const uploadIncidentFiles: RequestHandler = wrap(incidentUpload, '5 MB');

/** Libro de Excel de importacion: campo `file`, hasta 2 MB, en memoria. */
export const uploadImportWorkbook: RequestHandler = wrap(importUpload, '2 MB');

/** Fotografia de rostro (JPEG ya recortado en el navegador): campo `photo`, hasta 400 KB, en memoria. */
export const uploadFacePhoto: RequestHandler = wrap(facePhotoUpload, '400 KB');

/** Aplana los archivos subidos por `uploadIncidentFiles`. */
export const collectUploadedFiles = (req: Request): Express.Multer.File[] => {
  const files = req.files;
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
};
