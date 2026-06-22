import pool from '../config/db';
import { toIsoDate, toIsoDateTime } from '../utils/date-serialization';
import { withTransaction } from '../utils/transaction';
import { resolveStoredDocumentPath } from './document.service';

export interface HelpdeskAssetDocumentPayload {
  title: string;
  document_kind_id?: number | null;
  lifecycle_event_id?: number | null;
  reference_key?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
}

export interface HelpdeskAssetDocumentRecord {
  id: number;
  asset_id: number;
  title: string;
  document_kind_id: number | null;
  document_kind_code: string | null;
  document_kind_name: string | null;
  lifecycle_event_id: number | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  reference_key: string | null;
  version: number;
  is_current: boolean;
  issued_on: string | null;
  expires_on: string | null;
  uploaded_by_user_id: string | null;
  created_at?: string | undefined;
}

export interface UploadedAssetFile {
  path: string;
  size: number;
  mimetype: string;
}

const assetDocumentsTableReady = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.helpdesk_asset_documents') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertAssetDocumentsTable = async () => {
  if (!(await assetDocumentsTableReady())) {
    const error = new Error('HELPDESK_ASSET_DOCUMENTS_TABLE_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_ASSET_DOCUMENTS_TABLE_NOT_AVAILABLE';
    throw error;
  }
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const mapDocumentRow = (row: any): HelpdeskAssetDocumentRecord => ({
  id: Number(row.id),
  asset_id: Number(row.asset_id),
  title: String(row.title),
  document_kind_id: row.document_kind_id ? Number(row.document_kind_id) : null,
  document_kind_code: row.document_kind_code ? String(row.document_kind_code) : null,
  document_kind_name: row.document_kind_name ? String(row.document_kind_name) : null,
  lifecycle_event_id: row.lifecycle_event_id ? Number(row.lifecycle_event_id) : null,
  file_path: String(row.file_path),
  file_size: Number(row.file_size ?? 0),
  mime_type: String(row.mime_type ?? 'application/pdf'),
  reference_key: row.reference_key ? String(row.reference_key) : null,
  version: Number(row.version ?? 1),
  is_current: Boolean(row.is_current),
  issued_on: row.issued_on ? toIsoDate(row.issued_on) : null,
  expires_on: row.expires_on ? toIsoDate(row.expires_on) : null,
  uploaded_by_user_id: row.uploaded_by_user_id ? String(row.uploaded_by_user_id) : null,
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
});

const buildDocumentQuery = () => `
  SELECT d.*, k.code AS document_kind_code, k.name AS document_kind_name
  FROM public.helpdesk_asset_documents d
  LEFT JOIN public.helpdesk_document_kinds k ON k.id = d.document_kind_id
`;

export const getAssetDocumentById = async (
  documentId: number,
): Promise<HelpdeskAssetDocumentRecord | null> => {
  await assertAssetDocumentsTable();
  const result = await pool.query(`${buildDocumentQuery()} WHERE d.id = $1 LIMIT 1;`, [documentId]);
  return result.rows[0] ? mapDocumentRow(result.rows[0]) : null;
};

export interface ListAssetDocumentsOptions {
  lifecycleEventId?: number | null;
  documentKindId?: number | null;
  currentOnly?: boolean;
}

export const listAssetDocuments = async (
  assetId: number,
  options: ListAssetDocumentsOptions = {},
): Promise<HelpdeskAssetDocumentRecord[]> => {
  await assertAssetDocumentsTable();

  const filters: string[] = ['d.asset_id = $1'];
  const params: unknown[] = [assetId];

  if (options.lifecycleEventId) {
    params.push(options.lifecycleEventId);
    filters.push(`d.lifecycle_event_id = $${params.length}`);
  }
  if (options.documentKindId) {
    params.push(options.documentKindId);
    filters.push(`d.document_kind_id = $${params.length}`);
  }
  if (options.currentOnly) {
    filters.push('d.is_current = TRUE');
  }

  const result = await pool.query(
    `${buildDocumentQuery()} WHERE ${filters.join(' AND ')} ORDER BY d.created_at DESC, d.id DESC;`,
    params,
  );
  return result.rows.map(mapDocumentRow);
};

// Versionado opt-in: si se provee reference_key, la evidencia previa vigente con
// el mismo (asset, document_kind, reference_key) se marca como superseded.
export const uploadAssetDocument = async (
  assetId: number,
  file: UploadedAssetFile,
  payload: HelpdeskAssetDocumentPayload,
  userId?: string | null,
): Promise<HelpdeskAssetDocumentRecord> => {
  await assertAssetDocumentsTable();

  const referenceKey = normalizeOptionalText(payload.reference_key);

  const documentId = await withTransaction(async (client) => {
    const assetResult = await client.query(
      `SELECT id FROM public.helpdesk_assets WHERE id = $1 LIMIT 1;`,
      [assetId],
    );
    if (assetResult.rows.length === 0) {
      const error = new Error('HELPDESK_ASSET_NOT_FOUND');
      (error as any).code = 'HELPDESK_ASSET_NOT_FOUND';
      throw error;
    }

    let version = 1;
    let replacesId: number | null = null;

    if (referenceKey) {
      const prior = await client.query(
        `
          SELECT id, version FROM public.helpdesk_asset_documents
          WHERE asset_id = $1 AND reference_key = $2 AND is_current = TRUE
          ORDER BY version DESC LIMIT 1
          FOR UPDATE;
        `,
        [assetId, referenceKey],
      );
      if (prior.rows[0]) {
        version = Number(prior.rows[0].version) + 1;
        replacesId = Number(prior.rows[0].id);
        await client.query(
          `UPDATE public.helpdesk_asset_documents SET is_current = FALSE WHERE id = $1;`,
          [replacesId],
        );
      }
    }

    const result = await client.query(
      `
        INSERT INTO public.helpdesk_asset_documents (
          asset_id, title, document_kind, document_kind_id, lifecycle_event_id,
          file_path, file_size, mime_type, reference_key, version, is_current,
          replaces_document_id, issued_on, expires_on, uploaded_by_user_id
        )
        VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $12, $13)
        RETURNING id;
      `,
      [
        assetId,
        payload.title.trim(),
        payload.document_kind_id ?? null,
        payload.lifecycle_event_id ?? null,
        file.path,
        file.size ?? 0,
        file.mimetype ?? 'application/pdf',
        referenceKey,
        version,
        replacesId,
        normalizeOptionalText(payload.issued_on),
        normalizeOptionalText(payload.expires_on),
        userId ?? null,
      ],
    );

    return Number(result.rows[0]?.id);
  });

  const created = await getAssetDocumentById(documentId);
  if (!created) {
    const error = new Error('HELPDESK_ASSET_DOCUMENT_CREATION_FAILED');
    (error as any).code = 'HELPDESK_ASSET_DOCUMENT_CREATION_FAILED';
    throw error;
  }
  return created;
};

export const resolveAssetDocumentPath = async (
  documentId: number,
): Promise<{ document: HelpdeskAssetDocumentRecord; absolutePath: string }> => {
  const document = await getAssetDocumentById(documentId);
  if (!document) {
    const error = new Error('HELPDESK_ASSET_DOCUMENT_NOT_FOUND');
    (error as any).code = 'HELPDESK_ASSET_DOCUMENT_NOT_FOUND';
    throw error;
  }
  const absolutePath = resolveStoredDocumentPath(document.file_path);
  return { document, absolutePath };
};
