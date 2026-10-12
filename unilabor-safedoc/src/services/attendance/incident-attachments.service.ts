import fs from 'fs';
import { safeUnlink } from '../../utils/file-storage';
import path from 'path';
import pool from '../../config/db';
import { withTransaction, type Queryable } from '../../utils/transaction';
import { conflict, invalid, notFound } from './attendance-errors';

/**
 * Comprobantes de incidencias en DISCO. Regla de evidencia del proyecto: la
 * baja es logica (deleted_at); jamas se borra la fila ni el archivo.
 */

export interface AttachmentView {
  id: number;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

/** Firma binaria esperada por tipo MIME (evita aceptar un archivo con tipo falso). */
const hasValidSignature = (mimeType: string, head: Buffer): boolean => {
  switch (mimeType) {
    case 'application/pdf':
      return head.subarray(0, 4).toString('latin1') === '%PDF';
    case 'image/jpeg':
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/png':
      return head.subarray(1, 4).toString('latin1') === 'PNG' && head[0] === 0x89;
    case 'image/webp':
      return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
    default:
      return false;
  }
};

/** Verifica que el contenido de cada archivo subido corresponda a su tipo declarado. */
export const assertUploadedFilesAreValid = (files: readonly Express.Multer.File[]): void => {
  for (const file of files) {
    const head = Buffer.alloc(12);
    let fd: number | null = null;
    try {
      fd = fs.openSync(file.path, 'r');
      fs.readSync(fd, head, 0, 12, 0);
    } catch {
      invalid(`No se pudo leer el archivo "${file.originalname}".`);
    } finally {
      if (fd !== null) fs.closeSync(fd);
    }
    if (!hasValidSignature(file.mimetype, head)) {
      invalid(`El contenido de "${file.originalname}" no corresponde a un ${file.mimetype}.`);
    }
  }
};

export const insertAttachments = async (
  db: Queryable,
  incidentId: number,
  files: readonly Express.Multer.File[],
  userId: string,
): Promise<void> => {
  for (const file of files) {
    await db.query(
      `INSERT INTO attendance.incident_attachments
         (incident_id, file_path, original_file_name, mime_type, size_bytes, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [incidentId, file.path, file.originalname.slice(0, 200), file.mimetype, file.size, userId],
    );
  }
};

export const listAttachments = async (db: Queryable, incidentId: number): Promise<AttachmentView[]> => {
  const { rows } = await db.query<{
    id: string; original_file_name: string; mime_type: string; size_bytes: number; uploaded_at: Date; uploaded_by_name: string | null;
  }>(
    `SELECT a.id::text, a.original_file_name, a.mime_type, a.size_bytes, a.uploaded_at, u.full_name AS uploaded_by_name
       FROM attendance.incident_attachments a
       LEFT JOIN public.users u ON u.id = a.uploaded_by_user_id
      WHERE a.incident_id = $1 AND a.deleted_at IS NULL
      ORDER BY a.id`,
    [incidentId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    uploaded_at: row.uploaded_at.toISOString(),
    uploaded_by_name: row.uploaded_by_name,
  }));
};

/** Agrega comprobantes a una incidencia capturada o autorizada. */
export const addIncidentAttachments = async (
  incidentId: number,
  files: readonly Express.Multer.File[],
  userId: string,
): Promise<AttachmentView[]> => {
  if (files.length === 0) invalid('Adjunta al menos un archivo (campo "files").');
  assertUploadedFilesAreValid(files);
  return withTransaction(async (client) => {
    const found = await client.query<{ incident_status: string }>(
      'SELECT incident_status FROM attendance.incidents WHERE id = $1 FOR UPDATE',
      [incidentId],
    );
    const incident = found.rows[0];
    if (!incident) return notFound('Incidencia no encontrada.');
    if (!['captured', 'authorized'].includes(incident.incident_status)) {
      return conflict('Solo se pueden agregar comprobantes a incidencias capturadas o autorizadas.');
    }
    const active = await client.query<{ count: string }>(
      'SELECT COUNT(*) FROM attendance.incident_attachments WHERE incident_id = $1 AND deleted_at IS NULL',
      [incidentId],
    );
    if (Number(active.rows[0]?.count ?? 0) + files.length > 10) {
      return conflict('Una incidencia admite hasta 10 comprobantes vigentes.');
    }
    await insertAttachments(client, incidentId, files, userId);
    return listAttachments(client, incidentId);
  });
};

export interface AttachmentFile {
  absolutePath: string;
  mimeType: string;
  fileName: string;
}

/** Ubica el archivo de un comprobante vigente (404 si tiene baja logica o falta en disco). */
export const getAttachmentFile = async (incidentId: number, attachmentId: number): Promise<AttachmentFile> => {
  const { rows } = await pool.query<{ file_path: string; mime_type: string; original_file_name: string }>(
    `SELECT file_path, mime_type, original_file_name
       FROM attendance.incident_attachments
      WHERE id = $1 AND incident_id = $2 AND deleted_at IS NULL`,
    [attachmentId, incidentId],
  );
  const row = rows[0];
  if (!row) return notFound('Comprobante no encontrado.');
  const absolutePath = path.resolve(row.file_path);
  if (!fs.existsSync(absolutePath)) return notFound('El archivo del comprobante no esta disponible.');
  return { absolutePath, mimeType: row.mime_type, fileName: row.original_file_name };
};

/** Baja logica: marca deleted_at; el archivo y la fila se conservan como evidencia. */
export const softDeleteAttachment = async (
  incidentId: number,
  attachmentId: number,
  userId: string,
): Promise<{ original_file_name: string }> =>
  withTransaction(async (client) => {
    const incident = await client.query<{ incident_status: string; requires_attachment: boolean }>(
      `SELECT i.incident_status, t.requires_attachment
         FROM attendance.incidents i
         JOIN attendance.incident_types t ON t.id = i.incident_type_id
        WHERE i.id = $1 FOR UPDATE OF i`,
      [incidentId],
    );
    const info = incident.rows[0];
    if (!info) return notFound('Incidencia no encontrada.');

    const attachment = await client.query<{ original_file_name: string }>(
      `SELECT original_file_name FROM attendance.incident_attachments
        WHERE id = $1 AND incident_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [attachmentId, incidentId],
    );
    const target = attachment.rows[0];
    if (!target) return notFound('Comprobante no encontrado.');

    if (info.requires_attachment && info.incident_status === 'authorized') {
      const active = await client.query<{ count: string }>(
        'SELECT COUNT(*) FROM attendance.incident_attachments WHERE incident_id = $1 AND deleted_at IS NULL',
        [incidentId],
      );
      if (Number(active.rows[0]?.count ?? 0) <= 1) {
        return conflict('Es el unico comprobante de una incidencia autorizada: agrega el nuevo antes de dar de baja este.');
      }
    }
    await client.query(
      'UPDATE attendance.incident_attachments SET deleted_at = NOW(), deleted_by_user_id = $2 WHERE id = $1',
      [attachmentId, userId],
    );
    return { original_file_name: target.original_file_name };
  });

/**
 * Limpia tras un error los archivos subidos que NUNCA llegaron a tener fila
 * (los ya registrados son evidencia y no se tocan).
 */
export const cleanupUnregisteredFiles = async (files: readonly Express.Multer.File[]): Promise<void> => {
  if (files.length === 0) return;
  let registered = new Set<string>();
  try {
    const { rows } = await pool.query<{ file_path: string }>(
      'SELECT file_path FROM attendance.incident_attachments WHERE file_path = ANY($1::text[])',
      [files.map((file) => file.path)],
    );
    registered = new Set(rows.map((row) => row.file_path));
  } catch {
    // Sin poder verificar, mas vale conservar los archivos que borrar evidencia.
    return;
  }
  for (const file of files) {
    if (!registered.has(file.path)) safeUnlink(file.path);
  }
};
