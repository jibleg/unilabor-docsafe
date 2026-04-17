import pool from '../config/db';
import type { DocumentSectionRecord, DocumentTypeRecord } from '../types';

export interface DocumentSectionPayload {
  code?: string | null;
  name: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface DocumentTypePayload {
  section_id: number;
  code?: string | null;
  name: string;
  description?: string | null;
  is_required?: boolean;
  is_sensitive?: boolean;
  has_expiry?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

interface DocumentTypeFilters {
  sectionId?: number | null;
  isActive?: boolean | null;
}

const documentSectionsTableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.document_sections') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const documentTypesTableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.document_types') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const assertDocumentStructureTables = async () => {
  const [hasSections, hasTypes] = await Promise.all([
    documentSectionsTableExists(),
    documentTypesTableExists(),
  ]);

  if (!hasSections || !hasTypes) {
    const error = new Error('DOCUMENT_STRUCTURE_TABLES_NOT_AVAILABLE');
    (error as any).code = 'DOCUMENT_STRUCTURE_TABLES_NOT_AVAILABLE';
    throw error;
  }
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const normalizeCode = (value: unknown, fallbackBase: string): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (normalizedValue) {
    return normalizedValue.trim().toUpperCase().replace(/\s+/g, '_');
  }

  return fallbackBase.trim().toUpperCase().replace(/\s+/g, '_');
};

const mapSectionRow = (row: any): DocumentSectionRecord => {
  const section: DocumentSectionRecord = {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    is_active: Boolean(row.is_active),
    is_system_defined: Boolean(row.is_system_defined),
    sort_order: Number(row.sort_order ?? 0),
  };

  if (row.created_at) {
    section.created_at = String(row.created_at);
  }

  if (row.updated_at) {
    section.updated_at = String(row.updated_at);
  }

  return section;
};

const mapTypeRow = (row: any): DocumentTypeRecord => {
  const documentType: DocumentTypeRecord = {
    id: Number(row.id),
    section_id: Number(row.section_id),
    code: row.code ? String(row.code) : null,
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    is_required: Boolean(row.is_required),
    is_sensitive: Boolean(row.is_sensitive),
    has_expiry: Boolean(row.has_expiry),
    is_system_defined: Boolean(row.is_system_defined),
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
  };

  if (row.created_at) {
    documentType.created_at = String(row.created_at);
  }

  if (row.updated_at) {
    documentType.updated_at = String(row.updated_at);
  }

  if (row.section_name) {
    documentType.section = {
      id: Number(row.section_id),
      code: String(row.section_code),
      name: String(row.section_name),
      description: row.section_description ? String(row.section_description) : null,
      is_active: Boolean(row.section_is_active),
      is_system_defined: Boolean(row.section_is_system_defined),
      sort_order: Number(row.section_sort_order ?? 0),
    };
  }

  return documentType;
};

export const listDocumentSections = async (): Promise<DocumentSectionRecord[]> => {
  await assertDocumentStructureTables();

  const result = await pool.query(`
    SELECT id, code, name, description, is_active, is_system_defined, sort_order, created_at, updated_at
    FROM public.document_sections
    ORDER BY sort_order ASC, name ASC;
  `);

  return result.rows.map(mapSectionRow);
};

export const createDocumentSection = async (
  payload: DocumentSectionPayload,
): Promise<DocumentSectionRecord> => {
  await assertDocumentStructureTables();

  const result = await pool.query(
    `
      INSERT INTO public.document_sections (
        code,
        name,
        description,
        is_active,
        is_system_defined,
        sort_order
      )
      VALUES ($1, $2, $3, $4, FALSE, $5)
      RETURNING id, code, name, description, is_active, is_system_defined, sort_order, created_at, updated_at;
    `,
    [
      normalizeCode(payload.code, payload.name),
      payload.name.trim(),
      normalizeOptionalText(payload.description),
      payload.is_active ?? true,
      payload.sort_order ?? 0,
    ],
  );

  return mapSectionRow(result.rows[0]);
};

export const updateDocumentSection = async (
  sectionId: number,
  payload: Partial<DocumentSectionPayload>,
): Promise<DocumentSectionRecord | null> => {
  await assertDocumentStructureTables();

  const currentResult = await pool.query(
    `SELECT * FROM public.document_sections WHERE id = $1 LIMIT 1;`,
    [sectionId],
  );

  if (currentResult.rows.length === 0) {
    return null;
  }

  const currentSection = currentResult.rows[0];

  const result = await pool.query(
    `
      UPDATE public.document_sections
      SET
        code = $1,
        name = $2,
        description = $3,
        is_active = $4,
        sort_order = $5,
        updated_at = NOW()
      WHERE id = $6
      RETURNING id, code, name, description, is_active, is_system_defined, sort_order, created_at, updated_at;
    `,
    [
      normalizeCode(payload.code ?? currentSection.code, payload.name ?? currentSection.name),
      payload.name?.trim() ?? String(currentSection.name),
      payload.description !== undefined ? normalizeOptionalText(payload.description) : currentSection.description,
      payload.is_active ?? Boolean(currentSection.is_active),
      payload.sort_order ?? Number(currentSection.sort_order ?? 0),
      sectionId,
    ],
  );

  return mapSectionRow(result.rows[0]);
};

export const deleteDocumentSection = async (sectionId: number): Promise<DocumentSectionRecord | null> => {
  await assertDocumentStructureTables();

  const result = await pool.query(
    `
      UPDATE public.document_sections
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING id, code, name, description, is_active, is_system_defined, sort_order, created_at, updated_at;
    `,
    [sectionId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapSectionRow(result.rows[0]);
};

export const listDocumentTypes = async (
  filters: DocumentTypeFilters = {},
): Promise<DocumentTypeRecord[]> => {
  await assertDocumentStructureTables();

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (typeof filters.sectionId === 'number' && Number.isFinite(filters.sectionId) && filters.sectionId > 0) {
    values.push(filters.sectionId);
    conditions.push(`dt.section_id = $${values.length}`);
  }

  if (typeof filters.isActive === 'boolean') {
    values.push(filters.isActive);
    conditions.push(`dt.is_active = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `
      SELECT
        dt.id,
        dt.section_id,
        dt.code,
        dt.name,
        dt.description,
        dt.is_required,
        dt.is_sensitive,
        dt.has_expiry,
        dt.is_system_defined,
        dt.is_active,
        dt.sort_order,
        dt.created_at,
        dt.updated_at,
        ds.code AS section_code,
        ds.name AS section_name,
        ds.description AS section_description,
        ds.is_active AS section_is_active,
        ds.is_system_defined AS section_is_system_defined,
        ds.sort_order AS section_sort_order
      FROM public.document_types dt
      INNER JOIN public.document_sections ds ON ds.id = dt.section_id
      ${whereClause}
      ORDER BY ds.sort_order ASC, dt.sort_order ASC, dt.name ASC;
    `,
    values,
  );

  return result.rows.map(mapTypeRow);
};

export const createDocumentType = async (
  payload: DocumentTypePayload,
): Promise<DocumentTypeRecord> => {
  await assertDocumentStructureTables();

  const result = await pool.query(
    `
      INSERT INTO public.document_types (
        section_id,
        code,
        name,
        description,
        is_required,
        is_sensitive,
        has_expiry,
        is_system_defined,
        is_active,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9)
      RETURNING id, section_id, code, name, description, is_required, is_sensitive, has_expiry, is_system_defined, is_active, sort_order, created_at, updated_at;
    `,
    [
      payload.section_id,
      normalizeOptionalText(payload.code)
        ? normalizeCode(payload.code, payload.name)
        : null,
      payload.name.trim(),
      normalizeOptionalText(payload.description),
      payload.is_required ?? false,
      payload.is_sensitive ?? false,
      payload.has_expiry ?? false,
      payload.is_active ?? true,
      payload.sort_order ?? 0,
    ],
  );

  const createdTypeId = Number(result.rows[0]?.id);
  const createdType = await getDocumentTypeById(createdTypeId);
  if (!createdType) {
    throw new Error('DOCUMENT_TYPE_CREATION_FAILED');
  }
  return createdType;
};

export const getDocumentTypeById = async (typeId: number): Promise<DocumentTypeRecord | null> => {
  const records = await listDocumentTypes();
  return records.find((record) => record.id === typeId) ?? null;
};

export const updateDocumentType = async (
  typeId: number,
  payload: Partial<DocumentTypePayload>,
): Promise<DocumentTypeRecord | null> => {
  await assertDocumentStructureTables();

  const currentResult = await pool.query(
    `SELECT * FROM public.document_types WHERE id = $1 LIMIT 1;`,
    [typeId],
  );

  if (currentResult.rows.length === 0) {
    return null;
  }

  const currentType = currentResult.rows[0];

  await pool.query(
    `
      UPDATE public.document_types
      SET
        section_id = $1,
        code = $2,
        name = $3,
        description = $4,
        is_required = $5,
        is_sensitive = $6,
        has_expiry = $7,
        is_active = $8,
        sort_order = $9,
        updated_at = NOW()
      WHERE id = $10;
    `,
    [
      payload.section_id ?? Number(currentType.section_id),
      payload.code !== undefined
        ? (normalizeOptionalText(payload.code) ? normalizeCode(payload.code, payload.name ?? currentType.name) : null)
        : currentType.code,
      payload.name?.trim() ?? String(currentType.name),
      payload.description !== undefined ? normalizeOptionalText(payload.description) : currentType.description,
      payload.is_required ?? Boolean(currentType.is_required),
      payload.is_sensitive ?? Boolean(currentType.is_sensitive),
      payload.has_expiry ?? Boolean(currentType.has_expiry),
      payload.is_active ?? Boolean(currentType.is_active),
      payload.sort_order ?? Number(currentType.sort_order ?? 0),
      typeId,
    ],
  );

  return getDocumentTypeById(typeId);
};

export const deleteDocumentType = async (typeId: number): Promise<DocumentTypeRecord | null> => {
  await assertDocumentStructureTables();

  await pool.query(
    `
      UPDATE public.document_types
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1;
    `,
    [typeId],
  );

  return getDocumentTypeById(typeId);
};
