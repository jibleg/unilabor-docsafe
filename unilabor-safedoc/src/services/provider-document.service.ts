import fs from 'fs';
import path from 'path';
import pool from '../config/db';

// Motor de versiones de documentos de proveedor: replica el patron probado en
// `document.service.ts` (Calidad) — status active/superseded/inactive +
// replaces_document_id/replaced_by_document_id encadenados — pero sobre
// `provider_documents`, sin acoplarse al modulo de Calidad.

export interface CreateProviderDocumentInput {
  provider_id: number;
  category_id: number;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  uploaded_by: string | undefined;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
}

export interface ReplaceProviderDocumentInput {
  previous_document_id: number;
  category_id: number;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  uploaded_by: string | undefined;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
}

export interface ProviderDocumentRecord {
  id: number;
  provider_id: number;
  provider_name: string | null;
  category_id: number;
  category_name: string | null;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  document_date: string | null;
  effective_from: string | null;
  expiry_date: string | null;
  status: string;
  replaces_document_id: number | null;
  replaced_by_document_id: number | null;
  created_at: string;
  updated_at: string;
}

// Columnas DATE: `pg` las devuelve como Date (medianoche local), no como texto.
// String(date) da un toString() legible por humanos ("Thu Jan 15 2026..."),
// no el YYYY-MM-DD que espera <input type="date"> ni la BD. toISOString().slice(0,10)
// da la fecha correcta porque estas columnas no llevan hora.
const formatDateOnly = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
};

const formatTimestamp = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value);

const mapDocumentRow = (row: any): ProviderDocumentRecord => ({
  id: Number(row.id),
  provider_id: Number(row.provider_id),
  provider_name: row.provider_name ? String(row.provider_name) : null,
  category_id: Number(row.category_id),
  category_name: row.category_name ? String(row.category_name) : null,
  title: String(row.title),
  description: row.description ? String(row.description) : null,
  file_path: String(row.file_path),
  file_size: Number(row.file_size),
  uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
  uploaded_by_name: row.uploaded_by_name ? String(row.uploaded_by_name) : null,
  document_date: formatDateOnly(row.document_date),
  effective_from: formatDateOnly(row.effective_from),
  expiry_date: formatDateOnly(row.expiry_date),
  status: String(row.status),
  replaces_document_id: row.replaces_document_id ? Number(row.replaces_document_id) : null,
  replaced_by_document_id: row.replaced_by_document_id ? Number(row.replaced_by_document_id) : null,
  created_at: formatTimestamp(row.created_at),
  updated_at: formatTimestamp(row.updated_at),
});

const DOCUMENT_SELECT = `
  SELECT
    d.id, d.provider_id, s.name AS provider_name,
    d.category_id, c.name AS category_name,
    d.title, d.description, d.file_path, d.file_size,
    d.uploaded_by, u.full_name AS uploaded_by_name,
    d.document_date, d.effective_from, d.expiry_date,
    d.status, d.replaces_document_id, d.replaced_by_document_id,
    d.created_at, d.updated_at
  FROM public.provider_documents d
  INNER JOIN public.helpdesk_suppliers s ON s.id = d.provider_id
  LEFT JOIN public.provider_document_categories c ON c.id = d.category_id
  LEFT JOIN public.users u ON u.id = d.uploaded_by
`;

export const resolveStoredProviderDocumentPath = (storedPath: string): string => {
  if (!storedPath || typeof storedPath !== 'string') {
    throw new Error('INVALID_PATH');
  }

  const absolutePath = path.isAbsolute(storedPath) ? storedPath : path.resolve(process.cwd(), storedPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error('FILE_NOT_FOUND');
  }

  return absolutePath;
};

export const createProviderDocument = async (
  data: CreateProviderDocumentInput,
): Promise<ProviderDocumentRecord> => {
  const result = await pool.query(
    `
      INSERT INTO public.provider_documents (
        provider_id, category_id, title, description, file_path, file_size,
        uploaded_by, document_date, effective_from, expiry_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id;
    `,
    [
      data.provider_id,
      data.category_id,
      data.title,
      data.description,
      data.file_path,
      data.file_size,
      data.uploaded_by,
      data.document_date,
      data.effective_from,
      data.expiry_date,
    ],
  );

  const created = await findProviderDocumentById(Number(result.rows[0]?.id));
  if (!created) {
    const error = new Error('PROVIDER_DOCUMENT_CREATE_FAILED');
    (error as any).code = 'PROVIDER_DOCUMENT_CREATE_FAILED';
    throw error;
  }

  return created;
};

export const findProviderDocumentById = async (
  documentId: number,
): Promise<ProviderDocumentRecord | null> => {
  const result = await pool.query(`${DOCUMENT_SELECT} WHERE d.id = $1 LIMIT 1;`, [documentId]);
  const row = result.rows[0];
  return row ? mapDocumentRow(row) : null;
};

// Documentos vigentes de un proveedor (puede haber varios por categoria). Para
// ver el historico completo de un documento se camina replaces_document_id
// desde el vigente (getProviderDocumentHistory).
export const listActiveProviderDocuments = async (
  providerId: number,
): Promise<ProviderDocumentRecord[]> => {
  const result = await pool.query(
    `
      ${DOCUMENT_SELECT}
      WHERE d.provider_id = $1 AND d.status = 'active'
      ORDER BY c.sort_order ASC NULLS LAST, d.created_at DESC;
    `,
    [providerId],
  );
  return result.rows.map(mapDocumentRow);
};

// Todos los documentos de un proveedor (vigentes + derogados + inactivos),
// para la vista de expediente completo.
export const listAllProviderDocuments = async (providerId: number): Promise<ProviderDocumentRecord[]> => {
  const result = await pool.query(
    `
      ${DOCUMENT_SELECT}
      WHERE d.provider_id = $1
      ORDER BY d.created_at DESC;
    `,
    [providerId],
  );
  return result.rows.map(mapDocumentRow);
};

// Cadena completa de vigencia de un documento: camina replaces_document_id
// hacia atras y replaced_by_document_id hacia adelante, devuelve mas reciente
// primero.
export const getProviderDocumentHistory = async (
  documentId: number,
): Promise<ProviderDocumentRecord[]> => {
  const anchor = await findProviderDocumentById(documentId);
  if (!anchor) {
    return [];
  }

  const chain = new Map<number, ProviderDocumentRecord>();
  chain.set(anchor.id, anchor);

  let cursor: ProviderDocumentRecord | null = anchor;
  while (cursor?.replaces_document_id) {
    const previous = await findProviderDocumentById(cursor.replaces_document_id);
    if (!previous || chain.has(previous.id)) {
      break;
    }
    chain.set(previous.id, previous);
    cursor = previous;
  }

  cursor = anchor;
  while (cursor?.replaced_by_document_id) {
    const next = await findProviderDocumentById(cursor.replaced_by_document_id);
    if (!next || chain.has(next.id)) {
      break;
    }
    chain.set(next.id, next);
    cursor = next;
  }

  return Array.from(chain.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
};

export const deactivateProviderDocument = async (
  documentId: number,
): Promise<ProviderDocumentRecord | null> => {
  const existing = await findProviderDocumentById(documentId);
  if (!existing) {
    return null;
  }

  await pool.query(
    `UPDATE public.provider_documents SET status = 'inactive', updated_at = NOW() WHERE id = $1;`,
    [documentId],
  );

  return findProviderDocumentById(documentId);
};

// Borrado DEFINITIVO. Un documento que forma parte de una cadena de versiones
// (fue reemplazado o reemplaza a otro) no se puede eliminar para no romper la
// trazabilidad documental; en ese caso se debe desactivar en su lugar.
export const deleteProviderDocument = async (
  documentId: number,
): Promise<{ file_path: string } | null> => {
  const existing = await findProviderDocumentById(documentId);
  if (!existing) {
    return null;
  }

  if (existing.replaces_document_id || existing.replaced_by_document_id) {
    const error = new Error('PROVIDER_DOCUMENT_HAS_HISTORY');
    (error as any).code = 'PROVIDER_DOCUMENT_HAS_HISTORY';
    throw error;
  }

  await pool.query('DELETE FROM public.provider_documents WHERE id = $1;', [documentId]);

  return { file_path: existing.file_path };
};

export const replaceProviderDocumentWithNewVersion = async (
  data: ReplaceProviderDocumentInput,
): Promise<{ previousDocument: ProviderDocumentRecord; newDocument: ProviderDocumentRecord }> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const previousResult = await client.query(
      `
        SELECT id, provider_id, status, replaced_by_document_id
        FROM public.provider_documents
        WHERE id = $1
        LIMIT 1
        FOR UPDATE;
      `,
      [data.previous_document_id],
    );

    const previousDocument = previousResult.rows[0];
    if (!previousDocument) {
      const error = new Error('PROVIDER_DOCUMENT_NOT_FOUND');
      (error as any).code = 'PROVIDER_DOCUMENT_NOT_FOUND';
      throw error;
    }

    if (previousDocument.status !== 'active') {
      const error = new Error('PROVIDER_DOCUMENT_NOT_ACTIVE');
      (error as any).code = 'PROVIDER_DOCUMENT_NOT_ACTIVE';
      throw error;
    }

    if (previousDocument.replaced_by_document_id) {
      const error = new Error('PROVIDER_DOCUMENT_ALREADY_SUPERSEDED');
      (error as any).code = 'PROVIDER_DOCUMENT_ALREADY_SUPERSEDED';
      throw error;
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.provider_documents (
          provider_id, category_id, title, description, file_path, file_size,
          uploaded_by, document_date, effective_from, expiry_date,
          status, replaces_document_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)
        RETURNING id;
      `,
      [
        previousDocument.provider_id,
        data.category_id,
        data.title,
        data.description,
        data.file_path,
        data.file_size,
        data.uploaded_by,
        data.document_date,
        data.effective_from,
        data.expiry_date,
        data.previous_document_id,
      ],
    );

    const newDocumentId = Number(insertResult.rows[0]?.id);

    await client.query(
      `
        UPDATE public.provider_documents
        SET status = 'superseded', replaced_by_document_id = $1, updated_at = NOW()
        WHERE id = $2;
      `,
      [newDocumentId, data.previous_document_id],
    );

    await client.query('COMMIT');

    const [previous, created] = await Promise.all([
      findProviderDocumentById(data.previous_document_id),
      findProviderDocumentById(newDocumentId),
    ]);

    if (!previous || !created) {
      const error = new Error('PROVIDER_DOCUMENT_REPLACE_FAILED');
      (error as any).code = 'PROVIDER_DOCUMENT_REPLACE_FAILED';
      throw error;
    }

    return { previousDocument: previous, newDocument: created };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
