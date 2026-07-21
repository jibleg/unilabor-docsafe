import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { safeUnlink, sha256Buffer } from '../utils/file-storage';

// -----------------------------------------------------------------------------
// Documentos institucionales (RH-ACK).
//
// Reglamentos, politicas y codigos de conducta: no pertenecen a ningun
// colaborador. RH los carga una vez y los asigna para acuse de lectura. El
// archivo NUNCA se modifica: al firmar, cada lector recibe su propia copia con
// la hoja de acuse anexa en su expediente.
//
// La huella sha256 y el numero de paginas se sellan al cargar, porque son el
// ancla de la evidencia de todos los acuses que se generen.
// -----------------------------------------------------------------------------

export interface InstitutionalDocumentRecord {
  id: number;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  sha256: string;
  pages_total: number;
  target_document_type_id: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  // Enriquecido por join
  target_document_type_name?: string;
  uploaded_by_name?: string | null;
  acknowledgement_count?: number;
  signed_count?: number;
}

export interface InstitutionalDocumentPayload {
  title: string;
  description?: string | null;
  target_document_type_id: number;
}

const fail = (code: string, message?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (message) {
    (error as any).publicMessage = message;
  }
  throw error;
};

const tableExists = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.rh_institutional_documents') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertTable = async (): Promise<void> => {
  if (!(await tableExists())) {
    fail('RH_INSTITUTIONAL_TABLE_NOT_AVAILABLE', 'El modulo de documentos institucionales no esta disponible.');
  }
};

const mapRow = (row: any): InstitutionalDocumentRecord => ({
  id: Number(row.id),
  title: String(row.title),
  description: row.description ? String(row.description) : null,
  file_path: String(row.file_path),
  file_size: Number(row.file_size ?? 0),
  mime_type: String(row.mime_type),
  sha256: String(row.sha256),
  pages_total: Number(row.pages_total),
  target_document_type_id: Number(row.target_document_type_id),
  is_active: Boolean(row.is_active),
  created_at: row.created_at ? toIsoDateTime(row.created_at) : null,
  updated_at: row.updated_at ? toIsoDateTime(row.updated_at) : null,
  ...(row.target_document_type_name !== undefined
    ? { target_document_type_name: String(row.target_document_type_name) }
    : {}),
  ...(row.uploaded_by_name !== undefined
    ? { uploaded_by_name: row.uploaded_by_name ? String(row.uploaded_by_name) : null }
    : {}),
  ...(row.acknowledgement_count !== undefined
    ? { acknowledgement_count: Number(row.acknowledgement_count) }
    : {}),
  ...(row.signed_count !== undefined ? { signed_count: Number(row.signed_count) } : {}),
});

const LIST_SELECT = `
  SELECT d.*,
         dt.name AS target_document_type_name,
         u.full_name AS uploaded_by_name,
         (SELECT COUNT(*) FROM public.rh_document_acknowledgements a
           WHERE a.institutional_document_id = d.id AND a.status <> 'cancelled')
           AS acknowledgement_count,
         (SELECT COUNT(*) FROM public.rh_document_acknowledgements a
           WHERE a.institutional_document_id = d.id AND a.status = 'signed')
           AS signed_count
    FROM public.rh_institutional_documents d
    INNER JOIN public.document_types dt ON dt.id = d.target_document_type_id
    LEFT JOIN public.users u ON u.id = d.uploaded_by_user_id
`;

/**
 * Carga un documento institucional. Sella huella y paginas del archivo exacto
 * que leeran los colaboradores.
 */
export const createInstitutionalDocument = async (
  file: Express.Multer.File,
  payload: InstitutionalDocumentPayload,
  uploadedByUserId: string,
): Promise<InstitutionalDocumentRecord> => {
  await assertTable();

  const filePath = file.path;
  try {
    const buffer = fs.readFileSync(filePath);

    let pagesTotal: number;
    try {
      pagesTotal = (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount();
    } catch {
      return fail('RH_INSTITUTIONAL_NOT_PDF', 'El archivo debe ser un PDF valido.');
    }
    if (pagesTotal < 1) {
      return fail('RH_INSTITUTIONAL_NOT_PDF', 'El PDF no tiene paginas legibles.');
    }

    const typeExists = await pool.query(
      `SELECT 1 FROM public.document_types WHERE id = $1 AND is_active = TRUE LIMIT 1;`,
      [payload.target_document_type_id],
    );
    if (typeExists.rows.length === 0) {
      return fail(
        'RH_INSTITUTIONAL_TYPE_NOT_FOUND',
        'El tipo documental destino no existe o esta inactivo.',
      );
    }

    const inserted = await pool.query(
      `INSERT INTO public.rh_institutional_documents
         (title, description, file_path, file_size, mime_type, sha256, pages_total,
          target_document_type_id, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, 'application/pdf', $5, $6, $7, $8)
       RETURNING id;`,
      [
        payload.title.trim(),
        payload.description?.trim() || null,
        filePath,
        buffer.length,
        sha256Buffer(buffer),
        pagesTotal,
        payload.target_document_type_id,
        uploadedByUserId,
      ],
    );

    const created = await getInstitutionalDocumentById(Number(inserted.rows[0].id));
    if (!created) {
      return fail('RH_INSTITUTIONAL_CREATE_FAILED', 'No se pudo registrar el documento.');
    }
    return created;
  } catch (error) {
    // El archivo ya lo escribio multer; si el registro falla no debe quedar huerfano.
    safeUnlink(filePath);
    throw error;
  }
};

export const listInstitutionalDocuments = async (
  includeInactive = false,
): Promise<InstitutionalDocumentRecord[]> => {
  await assertTable();
  const where = includeInactive ? '' : 'WHERE d.is_active = TRUE';
  const result = await pool.query(`${LIST_SELECT} ${where} ORDER BY d.created_at DESC;`);
  return result.rows.map(mapRow);
};

export const getInstitutionalDocumentById = async (
  documentId: number,
): Promise<InstitutionalDocumentRecord | null> => {
  await assertTable();
  const result = await pool.query(`${LIST_SELECT} WHERE d.id = $1 LIMIT 1;`, [documentId]);
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
};

/** Ruta absoluta del archivo, para servirlo al visor. */
export const resolveInstitutionalDocumentPath = async (
  documentId: number,
): Promise<{ document: InstitutionalDocumentRecord; absolutePath: string }> => {
  const document = await getInstitutionalDocumentById(documentId);
  if (!document) {
    return fail('RH_INSTITUTIONAL_NOT_FOUND', 'El documento institucional no existe.');
  }

  const absolutePath = path.isAbsolute(document.file_path)
    ? document.file_path
    : path.join(process.cwd(), document.file_path);

  if (!fs.existsSync(absolutePath)) {
    return fail('RH_INSTITUTIONAL_FILE_MISSING', 'El archivo del documento no esta disponible.');
  }
  return { document, absolutePath };
};

/**
 * Inactiva el documento (no se borra: los acuses firmados lo referencian como
 * evidencia). Los acuses vigentes se cancelan.
 */
export const deactivateInstitutionalDocument = async (documentId: number): Promise<boolean> => {
  await assertTable();
  const result = await pool.query(
    `UPDATE public.rh_institutional_documents
        SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND is_active = TRUE
      RETURNING id;`,
    [documentId],
  );
  if (result.rows.length === 0) {
    return false;
  }

  await pool.query(
    `UPDATE public.rh_document_acknowledgements
        SET status = 'cancelled', updated_at = NOW()
      WHERE institutional_document_id = $1
        AND status IN ('pending', 'in_progress', 'read');`,
    [documentId],
  );
  return true;
};
