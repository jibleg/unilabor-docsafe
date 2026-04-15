import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { UserRole } from '../types';
import * as categoryService from './category.service';

type DocumentId = string | number;

interface CreateDocumentInput {
  title: string;
  file_path: string;
  file_size: number;
  uploaded_by: string | undefined;
  category_id: number;
  description: string;
  publish_date: string;
  expiry_date: string | null;
  ip: string | undefined;
}

interface ReplaceDocumentInput {
  previous_document_id: DocumentId;
  title: string;
  file_path: string;
  file_size: number;
  uploaded_by: string;
  category_id: number;
  description: string;
  publish_date: string;
  expiry_date: string | null;
  ip: string | undefined;
}

interface DocumentRecord {
  id: DocumentId;
  title: string;
  filename: string;
  created_at: string;
  uploaded_by: string;
  category_id: number;
  category_name: string | null;
  description: string | null;
  publish_date: string | null;
  expiry_date: string | null;
  status: string;
}

interface DocumentLookup {
  id: DocumentId;
  file_path: string;
  status: string;
  category_id: number;
}

export interface ManagedDocumentRecord {
  id: DocumentId;
  title: string;
  file_path: string;
  file_size: number;
  uploaded_by: string;
  category_id: number;
  description: string | null;
  publish_date: string | null;
  expiry_date: string | null;
  status: string;
  replaced_by_document_id: DocumentId | null;
  replaces_document_id: DocumentId | null;
}

export interface DocumentReplacementResult {
  previousDocument: {
    id: DocumentId;
    status: string;
    replaced_by_document_id: DocumentId;
    updated_at: string;
  };
  newDocument: {
    id: DocumentId;
    title: string;
    file_path: string;
    category_id: number;
    description: string | null;
    publish_date: string | null;
    expiry_date: string | null;
    status: string;
    replaces_document_id: DocumentId | null;
    created_at: string;
    updated_at: string;
  };
}

interface ListDocumentsOptions {
  includeInactive?: boolean;
}

export interface SearchDocumentsFilters {
  category_id?: number;
  title?: string;
  description?: string;
  publish_date?: string;
  expiry_date?: string;
}

interface SearchDocumentsOptions extends ListDocumentsOptions {
  filters: SearchDocumentsFilters;
}

let categoryStatusColumnAvailable: boolean | null = null;
let userCategoriesTableAvailable: boolean | null = null;
let documentVersioningColumnsAvailable: boolean | null = null;

const resolveCategoryStatusColumn = async (): Promise<boolean> => {
  if (categoryStatusColumnAvailable !== null) {
    return categoryStatusColumnAvailable;
  }

  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'categories'
        AND column_name = 'is_active'
    ) AS exists;
  `;

  const result = await pool.query(query);
  categoryStatusColumnAvailable = Boolean(result.rows[0]?.exists);
  return categoryStatusColumnAvailable;
};

const resolveUserCategoriesTable = async (): Promise<boolean> => {
  if (userCategoriesTableAvailable !== null) {
    return userCategoriesTableAvailable;
  }

  const result = await pool.query(`SELECT to_regclass('public.user_categories') IS NOT NULL AS exists;`);
  userCategoriesTableAvailable = Boolean(result.rows[0]?.exists);
  return userCategoriesTableAvailable;
};

export const resolveDocumentVersioningColumns = async (): Promise<boolean> => {
  if (documentVersioningColumnsAvailable === true) {
    return documentVersioningColumnsAvailable;
  }

  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'documents'
        AND column_name IN ('replaces_document_id', 'replaced_by_document_id');
    `
  );

  const columnsAvailable = Number(result.rows[0]?.total ?? 0) === 2;
  documentVersioningColumnsAvailable = columnsAvailable ? true : null;
  return columnsAvailable;
};

const getEditorAssignmentCount = async (userId: string): Promise<number> => {
  const hasTable = await resolveUserCategoriesTable();
  if (!hasTable) {
    return 0;
  }

  const result = await pool.query(
    'SELECT COUNT(*)::int AS total FROM user_categories WHERE user_id = $1',
    [userId]
  );
  return Number(result.rows[0]?.total ?? 0);
};

export const resolveStoredDocumentPath = (storedPath: string): string => {
  if (!storedPath || typeof storedPath !== 'string') {
    throw new Error('INVALID_PATH');
  }

  const absolutePath = path.isAbsolute(storedPath)
    ? storedPath
    : path.resolve(process.cwd(), storedPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error('FILE_NOT_FOUND');
  }

  return absolutePath;
};

export const getDocumentPath = (fileName: string): string => {
  const safeFileName = path.basename(fileName);
  if (!safeFileName || safeFileName !== fileName) {
    throw new Error('INVALID_FILE_NAME');
  }

  const filePath = path.resolve(__dirname, '../../uploads/documents', safeFileName);

  if (!fs.existsSync(filePath)) {
    throw new Error('FILE_NOT_FOUND');
  }

  return filePath;
};

export const createDocumentWithMetadata = async (data: CreateDocumentInput): Promise<DocumentId> => {
  const {
    title,
    file_path,
    file_size,
    uploaded_by,
    category_id,
    description,
    publish_date,
    expiry_date,
    ip,
  } = data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const docQuery = `
      INSERT INTO documents (
        title, file_path, file_size, uploaded_by,
        category_id, description, publish_date, expiry_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;
    `;

    const response = await client.query(docQuery, [
      title,
      file_path,
      file_size,
      uploaded_by,
      category_id,
      description,
      publish_date,
      expiry_date,
    ]);

    const documentId = response.rows[0].id;

    await client.query(
      'INSERT INTO access_logs (user_id, document_id, action, ip_address) VALUES ($1, $2, $3, $4)',
      [uploaded_by, documentId, 'UPLOAD', ip]
    );

    await client.query('COMMIT');
    return documentId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const findDocumentForManagement = async (
  documentId: DocumentId
): Promise<ManagedDocumentRecord | null> => {
  const hasVersioningColumns = await resolveDocumentVersioningColumns();

  const query = hasVersioningColumns
    ? `
        SELECT
          id,
          title,
          file_path,
          file_size,
          uploaded_by,
          category_id,
          description,
          publish_date,
          expiry_date,
          status,
          replaced_by_document_id,
          replaces_document_id
        FROM documents
        WHERE id = $1
        LIMIT 1;
      `
    : `
        SELECT
          id,
          title,
          file_path,
          file_size,
          uploaded_by,
          category_id,
          description,
          publish_date,
          expiry_date,
          status,
          NULL AS replaced_by_document_id,
          NULL AS replaces_document_id
        FROM documents
        WHERE id = $1
        LIMIT 1;
      `;

  const result = await pool.query(query, [documentId]);
  return result.rows[0] ?? null;
};

export const replaceDocumentWithNewVersion = async (
  data: ReplaceDocumentInput
): Promise<DocumentReplacementResult> => {
  const hasVersioningColumns = await resolveDocumentVersioningColumns();
  if (!hasVersioningColumns) {
    const error = new Error('DOCUMENT_VERSIONING_NOT_AVAILABLE');
    (error as any).code = 'DOCUMENT_VERSIONING_NOT_AVAILABLE';
    throw error;
  }

  const {
    previous_document_id,
    title,
    file_path,
    file_size,
    uploaded_by,
    category_id,
    description,
    publish_date,
    expiry_date,
    ip,
  } = data;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const previousResult = await client.query(
      `
        SELECT id, status, replaced_by_document_id
        FROM documents
        WHERE id = $1
        LIMIT 1
        FOR UPDATE;
      `,
      [previous_document_id]
    );

    const previousDocument = previousResult.rows[0];
    if (!previousDocument) {
      const error = new Error('DOCUMENT_NOT_FOUND');
      (error as any).code = 'DOCUMENT_NOT_FOUND';
      throw error;
    }

    if (previousDocument.status !== 'active') {
      const error = new Error('DOCUMENT_NOT_ACTIVE');
      (error as any).code = 'DOCUMENT_NOT_ACTIVE';
      throw error;
    }

    if (previousDocument.replaced_by_document_id) {
      const error = new Error('DOCUMENT_ALREADY_SUPERSEDED');
      (error as any).code = 'DOCUMENT_ALREADY_SUPERSEDED';
      throw error;
    }

    const insertResult = await client.query(
      `
        INSERT INTO documents (
          title,
          file_path,
          file_size,
          uploaded_by,
          category_id,
          description,
          publish_date,
          expiry_date,
          status,
          replaces_document_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
        RETURNING
          id,
          title,
          file_path,
          category_id,
          description,
          publish_date,
          expiry_date,
          status,
          replaces_document_id,
          created_at,
          updated_at;
      `,
      [
        title,
        file_path,
        file_size,
        uploaded_by,
        category_id,
        description,
        publish_date,
        expiry_date,
        previous_document_id,
      ]
    );

    const newDocument = insertResult.rows[0];

    const updatePreviousResult = await client.query(
      `
        UPDATE documents
        SET
          status = 'superseded',
          replaced_by_document_id = $1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING id, status, replaced_by_document_id, updated_at;
      `,
      [newDocument.id, previous_document_id]
    );

    await client.query(
      'INSERT INTO access_logs (user_id, document_id, action, ip_address) VALUES ($1, $2, $3, $4)',
      [uploaded_by, previous_document_id, 'SUPERSEDE', ip]
    );

    await client.query(
      'INSERT INTO access_logs (user_id, document_id, action, ip_address) VALUES ($1, $2, $3, $4)',
      [uploaded_by, newDocument.id, 'REPLACE_UPLOAD', ip]
    );

    await client.query('COMMIT');

    return {
      previousDocument: updatePreviousResult.rows[0],
      newDocument,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getAllCategories = async (userId: string, role: UserRole) => {
  return categoryService.listCategoriesForUser(userId, role);
};

export const listDocumentsForUser = async (
  userId: string,
  role: UserRole,
  options: ListDocumentsOptions = {}
): Promise<DocumentRecord[]> => {
  const hasUserCategoriesTable = await resolveUserCategoriesTable();
  const hasCategoryStatusColumn = await resolveCategoryStatusColumn();
  const includeInactive = Boolean(options.includeInactive);

  const baseSelect = `
    SELECT
      d.id,
      d.title,
      d.file_path AS filename,
      d.created_at,
      u.full_name AS uploaded_by,
      d.category_id,
      c.name AS category_name,
      d.description,
      d.publish_date,
      d.expiry_date,
      d.status
    FROM documents d
    INNER JOIN users u ON d.uploaded_by = u.id
    LEFT JOIN categories c ON d.category_id = c.id
  `;

  if (role === 'ADMIN') {
    const query = `
      ${baseSelect}
      ${includeInactive ? '' : "WHERE d.status = 'active'"}
      ORDER BY d.created_at DESC;
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  if (role === 'EDITOR') {
    const assignmentCount = await getEditorAssignmentCount(userId);

    if (!hasUserCategoriesTable || assignmentCount === 0) {
      const query = `
        ${baseSelect}
        ${includeInactive ? '' : "WHERE d.status = 'active'"}
        ORDER BY d.created_at DESC;
      `;
      const result = await pool.query(query);
      return result.rows;
    }

    const query = `
      ${baseSelect}
      INNER JOIN user_categories uc
        ON uc.category_id = d.category_id
       AND uc.user_id = $1
      ${includeInactive ? '' : "WHERE d.status = 'active'"}
      ORDER BY d.created_at DESC;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  if (!hasUserCategoriesTable) {
    return [];
  }

  const query = `
    ${baseSelect}
    INNER JOIN user_categories uc
      ON uc.category_id = d.category_id
     AND uc.user_id = $1
    WHERE d.status = 'active'
      ${hasCategoryStatusColumn ? 'AND (c.is_active = TRUE OR c.is_active IS NULL)' : ''}
    ORDER BY d.created_at DESC;
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
};

export const searchDocumentsForUser = async (
  userId: string,
  role: UserRole,
  options: SearchDocumentsOptions
): Promise<DocumentRecord[]> => {
  const { filters } = options;
  const includeInactive = Boolean(options.includeInactive);
  const hasUserCategoriesTable = await resolveUserCategoriesTable();
  const hasCategoryStatusColumn = await resolveCategoryStatusColumn();

  const values: unknown[] = [];
  const whereClauses: string[] = [];

  if (!includeInactive) {
    whereClauses.push(`d.status = 'active'`);
  }

  if (filters.category_id !== undefined) {
    values.push(filters.category_id);
    whereClauses.push(`d.category_id = $${values.length}`);
  }

  if (filters.title) {
    values.push(`%${filters.title}%`);
    whereClauses.push(`d.title ILIKE $${values.length}`);
  }

  if (filters.description) {
    values.push(`%${filters.description}%`);
    whereClauses.push(`COALESCE(d.description, '') ILIKE $${values.length}`);
  }

  if (filters.publish_date) {
    values.push(filters.publish_date);
    whereClauses.push(`d.publish_date = $${values.length}`);
  }

  if (filters.expiry_date) {
    values.push(filters.expiry_date);
    whereClauses.push(`d.expiry_date = $${values.length}`);
  }

  const baseSelect = `
    SELECT
      d.id,
      d.title,
      d.file_path AS filename,
      d.created_at,
      u.full_name AS uploaded_by,
      d.category_id,
      c.name AS category_name,
      d.description,
      d.publish_date,
      d.expiry_date,
      d.status
    FROM documents d
    INNER JOIN users u ON d.uploaded_by = u.id
    LEFT JOIN categories c ON d.category_id = c.id
  `;

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  if (role === 'ADMIN') {
    const query = `
      ${baseSelect}
      ${whereSql}
      ORDER BY d.created_at DESC;
    `;
    const result = await pool.query(query, values);
    return result.rows;
  }

  if (role === 'EDITOR') {
    const assignmentCount = await getEditorAssignmentCount(userId);

    if (!hasUserCategoriesTable || assignmentCount === 0) {
      const query = `
        ${baseSelect}
        ${whereSql}
        ORDER BY d.created_at DESC;
      `;
      const result = await pool.query(query, values);
      return result.rows;
    }

    values.push(userId);
    const editorUserIdIndex = values.length;
    const editorWhereClauses = [
      ...whereClauses,
      `uc.user_id = $${editorUserIdIndex}`,
    ];

    const query = `
      ${baseSelect}
      INNER JOIN user_categories uc
        ON uc.category_id = d.category_id
      WHERE ${editorWhereClauses.join(' AND ')}
      ORDER BY d.created_at DESC;
    `;

    const result = await pool.query(query, values);
    return result.rows;
  }

  if (!hasUserCategoriesTable) {
    return [];
  }

  values.push(userId);
  const viewerUserIdIndex = values.length;
  const viewerWhereClauses = [
    ...whereClauses,
    `uc.user_id = $${viewerUserIdIndex}`,
  ];

  if (hasCategoryStatusColumn) {
    viewerWhereClauses.push('(c.is_active = TRUE OR c.is_active IS NULL)');
  }

  const query = `
    ${baseSelect}
    INNER JOIN user_categories uc
      ON uc.category_id = d.category_id
    WHERE ${viewerWhereClauses.join(' AND ')}
    ORDER BY d.created_at DESC;
  `;

  const result = await pool.query(query, values);
  return result.rows;
};

export const findDocumentByFilename = async (filename: string): Promise<DocumentLookup | null> => {
  const sanitizedFileName = path.basename(filename);
  if (!sanitizedFileName || sanitizedFileName !== filename) {
    return null;
  }

  const query = `
    SELECT d.id, d.file_path, d.status, d.category_id
    FROM documents d
    WHERE RIGHT(d.file_path, LENGTH($1)) = $1
    ORDER BY d.created_at DESC
    LIMIT 1;
  `;

  const result = await pool.query(query, [sanitizedFileName]);
  return result.rows[0] ?? null;
};

export const canUserAccessDocumentCategory = async (
  userId: string,
  role: UserRole,
  categoryId: number
): Promise<boolean> => {
  return categoryService.canUserAccessCategory(userId, role, categoryId);
};
