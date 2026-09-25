import fs from 'fs';
import path from 'path';
import pool from '../config/db';

// Motor de versiones de documentos de cliente: espejo exacto de
// `provider-document.service.ts` — status active/superseded/inactive +
// replaces_document_id/replaced_by_document_id encadenados — pero sobre
// `client_documents`, sin acoplarse al catalogo de proveedores.

export interface CreateClientDocumentInput {
  client_id: number;
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

export interface ReplaceClientDocumentInput {
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

export interface ClientDocumentRecord {
  id: number;
  client_id: number;
  client_name: string | null;
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
  /** Borrado logico (documento con historico oculto de la ficha); el PDF y la cadena se conservan. */
  deleted_at: string | null;
  deleted_by_name: string | null;
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

const mapDocumentRow = (row: any): ClientDocumentRecord => ({
  id: Number(row.id),
  client_id: Number(row.client_id),
  client_name: row.client_name ? String(row.client_name) : null,
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
  deleted_at: row.deleted_at ? formatTimestamp(row.deleted_at) : null,
  deleted_by_name: row.deleted_by_name ? String(row.deleted_by_name) : null,
  created_at: formatTimestamp(row.created_at),
  updated_at: formatTimestamp(row.updated_at),
});

const DOCUMENT_SELECT = `
  SELECT
    d.id, d.client_id, cl.name AS client_name,
    d.category_id, cat.name AS category_name,
    d.title, d.description, d.file_path, d.file_size,
    d.uploaded_by, u.full_name AS uploaded_by_name,
    d.document_date, d.effective_from, d.expiry_date,
    d.status, d.replaces_document_id, d.replaced_by_document_id,
    d.deleted_at, du.full_name AS deleted_by_name,
    d.created_at, d.updated_at
  FROM public.client_documents d
  INNER JOIN public.clients cl ON cl.id = d.client_id
  LEFT JOIN public.client_document_categories cat ON cat.id = d.category_id
  LEFT JOIN public.users u ON u.id = d.uploaded_by
  LEFT JOIN public.users du ON du.id = d.deleted_by
`;

export const resolveStoredClientDocumentPath = (storedPath: string): string => {
  if (!storedPath || typeof storedPath !== 'string') {
    throw new Error('INVALID_PATH');
  }

  const absolutePath = path.isAbsolute(storedPath) ? storedPath : path.resolve(process.cwd(), storedPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error('FILE_NOT_FOUND');
  }

  return absolutePath;
};

export const createClientDocument = async (
  data: CreateClientDocumentInput,
): Promise<ClientDocumentRecord> => {
  const result = await pool.query(
    `
      INSERT INTO public.client_documents (
        client_id, category_id, title, description, file_path, file_size,
        uploaded_by, document_date, effective_from, expiry_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id;
    `,
    [
      data.client_id,
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

  const created = await findClientDocumentById(Number(result.rows[0]?.id));
  if (!created) {
    const error = new Error('CLIENT_DOCUMENT_CREATE_FAILED');
    (error as any).code = 'CLIENT_DOCUMENT_CREATE_FAILED';
    throw error;
  }

  return created;
};

export const findClientDocumentById = async (
  documentId: number,
): Promise<ClientDocumentRecord | null> => {
  const result = await pool.query(`${DOCUMENT_SELECT} WHERE d.id = $1 LIMIT 1;`, [documentId]);
  const row = result.rows[0];
  return row ? mapDocumentRow(row) : null;
};

// Documentos vigentes de un cliente (puede haber varios por categoria). Para
// ver el historico completo de un documento se camina replaces_document_id
// desde el vigente (getClientDocumentHistory).
export const listActiveClientDocuments = async (
  clientId: number,
): Promise<ClientDocumentRecord[]> => {
  const result = await pool.query(
    `
      ${DOCUMENT_SELECT}
      WHERE d.client_id = $1 AND d.status = 'active' AND d.deleted_at IS NULL
      ORDER BY cat.sort_order ASC NULLS LAST, d.created_at DESC;
    `,
    [clientId],
  );
  return result.rows.map(mapDocumentRow);
};

// Todos los documentos de un cliente (vigentes + derogados + inactivos), para
// la vista de expediente completo.
export const listAllClientDocuments = async (clientId: number): Promise<ClientDocumentRecord[]> => {
  const result = await pool.query(
    `
      ${DOCUMENT_SELECT}
      WHERE d.client_id = $1 AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC;
    `,
    [clientId],
  );
  return result.rows.map(mapDocumentRow);
};

// Cadena completa de vigencia de un documento: camina replaces_document_id
// hacia atras y replaced_by_document_id hacia adelante, devuelve mas reciente
// primero.
export const getClientDocumentHistory = async (
  documentId: number,
): Promise<ClientDocumentRecord[]> => {
  const anchor = await findClientDocumentById(documentId);
  if (!anchor) {
    return [];
  }

  const chain = new Map<number, ClientDocumentRecord>();
  chain.set(anchor.id, anchor);

  let cursor: ClientDocumentRecord | null = anchor;
  while (cursor?.replaces_document_id) {
    const previous = await findClientDocumentById(cursor.replaces_document_id);
    if (!previous || chain.has(previous.id)) {
      break;
    }
    chain.set(previous.id, previous);
    cursor = previous;
  }

  cursor = anchor;
  while (cursor?.replaced_by_document_id) {
    const next = await findClientDocumentById(cursor.replaced_by_document_id);
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

export const deactivateClientDocument = async (
  documentId: number,
): Promise<ClientDocumentRecord | null> => {
  const existing = await findClientDocumentById(documentId);
  if (!existing) {
    return null;
  }

  await pool.query(
    `UPDATE public.client_documents SET status = 'inactive', updated_at = NOW() WHERE id = $1;`,
    [documentId],
  );

  return findClientDocumentById(documentId);
};

export type ClientDocumentDeleteResult =
  | { kind: 'physical'; file_path: string }
  | { kind: 'logical'; document: ClientDocumentRecord };

// "Eliminar": un documento SIN historico (no reemplaza ni fue reemplazado) se
// borra fisicamente como siempre. Uno que forma parte de una cadena de versiones
// se oculta de la ficha (borrado logico: deleted_at/deleted_by) conservando el
// PDF y la cadena replaces/replaced_by para la trazabilidad; sigue visible en
// el historico con la etiqueta "Eliminado" y puede restaurarse.
export const deleteClientDocument = async (
  documentId: number,
  deletedByUserId: string | null,
): Promise<ClientDocumentDeleteResult | null> => {
  const existing = await findClientDocumentById(documentId);
  if (!existing) {
    return null;
  }

  if (existing.replaces_document_id || existing.replaced_by_document_id) {
    await pool.query(
      `UPDATE public.client_documents SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1;`,
      [documentId, deletedByUserId],
    );
    const hidden = await findClientDocumentById(documentId);
    return { kind: 'logical', document: hidden ?? existing };
  }

  await pool.query('DELETE FROM public.client_documents WHERE id = $1;', [documentId]);

  return { kind: 'physical', file_path: existing.file_path };
};

// Deshace el borrado logico: el documento vuelve a la ficha con su estado original.
export const restoreClientDocument = async (documentId: number): Promise<ClientDocumentRecord | null> => {
  const existing = await findClientDocumentById(documentId);
  if (!existing) {
    return null;
  }
  if (!existing.deleted_at) {
    const error = new Error('CLIENT_DOCUMENT_NOT_DELETED');
    (error as any).code = 'CLIENT_DOCUMENT_NOT_DELETED';
    throw error;
  }
  await pool.query(
    `UPDATE public.client_documents SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW() WHERE id = $1;`,
    [documentId],
  );
  return findClientDocumentById(documentId);
};

export const replaceClientDocumentWithNewVersion = async (
  data: ReplaceClientDocumentInput,
): Promise<{ previousDocument: ClientDocumentRecord; newDocument: ClientDocumentRecord }> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const previousResult = await client.query(
      `
        SELECT id, client_id, status, replaced_by_document_id
        FROM public.client_documents
        WHERE id = $1
        LIMIT 1
        FOR UPDATE;
      `,
      [data.previous_document_id],
    );

    const previousDocument = previousResult.rows[0];
    if (!previousDocument) {
      const error = new Error('CLIENT_DOCUMENT_NOT_FOUND');
      (error as any).code = 'CLIENT_DOCUMENT_NOT_FOUND';
      throw error;
    }

    if (previousDocument.status !== 'active') {
      const error = new Error('CLIENT_DOCUMENT_NOT_ACTIVE');
      (error as any).code = 'CLIENT_DOCUMENT_NOT_ACTIVE';
      throw error;
    }

    if (previousDocument.replaced_by_document_id) {
      const error = new Error('CLIENT_DOCUMENT_ALREADY_SUPERSEDED');
      (error as any).code = 'CLIENT_DOCUMENT_ALREADY_SUPERSEDED';
      throw error;
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.client_documents (
          client_id, category_id, title, description, file_path, file_size,
          uploaded_by, document_date, effective_from, expiry_date,
          status, replaces_document_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)
        RETURNING id;
      `,
      [
        previousDocument.client_id,
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
        UPDATE public.client_documents
        SET status = 'superseded', replaced_by_document_id = $1, updated_at = NOW()
        WHERE id = $2;
      `,
      [newDocumentId, data.previous_document_id],
    );

    await client.query('COMMIT');

    const [previous, created] = await Promise.all([
      findClientDocumentById(data.previous_document_id),
      findClientDocumentById(newDocumentId),
    ]);

    if (!previous || !created) {
      const error = new Error('CLIENT_DOCUMENT_REPLACE_FAILED');
      (error as any).code = 'CLIENT_DOCUMENT_REPLACE_FAILED';
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

export interface UpdateClientDocumentMetadataInput {
  category_id?: number | undefined;
  title?: string | undefined;
  description?: string | null | undefined;
  document_date?: string | null | undefined;
  effective_from?: string | null | undefined;
  expiry_date?: string | null | undefined;
}

// Correccion de metadatos del documento VIGENTE (titulo, categoria, descripcion,
// fechas) sin tocar el PDF ni la cadena de versiones: no crea version nueva ni
// altera derogados. Devuelve el registro previo y el actualizado para auditar
// exactamente que cambio.
export const updateClientDocumentMetadata = async (
  documentId: number,
  data: UpdateClientDocumentMetadataInput,
): Promise<{ previousDocument: ClientDocumentRecord; document: ClientDocumentRecord }> => {
  const existing = await findClientDocumentById(documentId);
  if (!existing) {
    const error = new Error('CLIENT_DOCUMENT_NOT_FOUND');
    (error as any).code = 'CLIENT_DOCUMENT_NOT_FOUND';
    throw error;
  }
  if (existing.status !== 'active') {
    const error = new Error('CLIENT_DOCUMENT_NOT_ACTIVE');
    (error as any).code = 'CLIENT_DOCUMENT_NOT_ACTIVE';
    throw error;
  }

  await pool.query(
    `
      UPDATE public.client_documents
      SET category_id = $2, title = $3, description = $4,
          document_date = $5, effective_from = $6, expiry_date = $7,
          updated_at = NOW()
      WHERE id = $1;
    `,
    [
      documentId,
      data.category_id ?? existing.category_id,
      data.title !== undefined ? data.title : existing.title,
      data.description !== undefined ? data.description : existing.description,
      data.document_date !== undefined ? data.document_date : existing.document_date,
      data.effective_from !== undefined ? data.effective_from : existing.effective_from,
      data.expiry_date !== undefined ? data.expiry_date : existing.expiry_date,
    ],
  );

  const updated = await findClientDocumentById(documentId);
  if (!updated) {
    const error = new Error('CLIENT_DOCUMENT_NOT_FOUND');
    (error as any).code = 'CLIENT_DOCUMENT_NOT_FOUND';
    throw error;
  }
  return { previousDocument: existing, document: updated };
};
