import pool from '../config/db';
import type {
  DocumentSectionRecord,
  DocumentTypeRecord,
  EmployeeDocumentRecord,
  EmployeeExpedientSection,
  EmployeeExpedientSummary,
  EmployeeRecord,
  EmployeeExpedientTypeItem,
  UserRole,
} from '../types';
import { registerAuditEvent } from './audit.service';
import { getEmployeeById, getEmployeeByUserId } from './employee.service';
import { resolveStoredDocumentPath } from './document.service';
import { initializeDefaultEmployeeDocumentAccess } from './employee-document-access.service';

export interface EmployeeDocumentPayload {
  document_type_id: number;
  title: string;
  description?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
}

export interface EmployeeDocumentFilters {
  section_id?: number;
  document_type_id?: number;
  current_only?: boolean;
  expiry_status?: 'valid' | 'expiring' | 'expired';
}

const EXPIRING_WINDOW_DAYS = 30;

const employeeDocumentsTableExists = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.employee_documents') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertEmployeeDocumentsTable = async () => {
  const exists = await employeeDocumentsTableExists();
  if (!exists) {
    const error = new Error('EMPLOYEE_DOCUMENTS_TABLE_NOT_AVAILABLE');
    (error as any).code = 'EMPLOYEE_DOCUMENTS_TABLE_NOT_AVAILABLE';
    throw error;
  }
};

const parseIsoDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const calculateItemStatus = (
  documentType: DocumentTypeRecord,
  currentDocument: EmployeeDocumentRecord | null,
): EmployeeExpedientTypeItem['status'] => {
  if (!currentDocument) {
    return 'missing';
  }

  if (!documentType.has_expiry) {
    return 'uploaded';
  }

  const expiryDate = parseIsoDate(currentDocument.expiry_date ?? null);
  if (!expiryDate) {
    return 'valid';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = expiryDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'expired';
  }

  if (diffDays <= EXPIRING_WINDOW_DAYS) {
    return 'expiring';
  }

  return 'valid';
};

const calculateDocumentExpiryStatus = (
  hasExpiry: boolean,
  expiryDateValue: string | null,
): 'uploaded' | 'valid' | 'expiring' | 'expired' => {
  if (!hasExpiry) {
    return 'uploaded';
  }

  const expiryDate = parseIsoDate(expiryDateValue);
  if (!expiryDate) {
    return 'valid';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = expiryDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'expired';
  }

  if (diffDays <= EXPIRING_WINDOW_DAYS) {
    return 'expiring';
  }

  return 'valid';
};

const mapSectionRow = (row: any): DocumentSectionRecord => {
  const section: DocumentSectionRecord = {
    id: Number(row.section_id ?? row.id),
    code: String(row.section_code ?? row.code),
    name: String(row.section_name ?? row.name),
    description: row.section_description ? String(row.section_description) : null,
    is_active: Boolean(row.section_is_active ?? row.is_active),
    is_system_defined: Boolean(row.section_is_system_defined ?? row.is_system_defined),
    sort_order: Number(row.section_sort_order ?? row.sort_order ?? 0),
  };

  if (row.section_created_at) {
    section.created_at = String(row.section_created_at);
  }

  if (row.section_updated_at) {
    section.updated_at = String(row.section_updated_at);
  }

  return section;
};

const mapDocumentTypeRow = (row: any): DocumentTypeRecord => {
  const documentType: DocumentTypeRecord = {
    id: Number(row.document_type_id ?? row.id),
    section_id: Number(row.section_id),
    code: row.document_type_code ? String(row.document_type_code) : row.code ? String(row.code) : null,
    name: String(row.document_type_name ?? row.name),
    description: row.document_type_description
      ? String(row.document_type_description)
      : row.description
        ? String(row.description)
        : null,
    is_required: Boolean(row.document_type_is_required ?? row.is_required),
    is_sensitive: Boolean(row.document_type_is_sensitive ?? row.is_sensitive),
    has_expiry: Boolean(row.document_type_has_expiry ?? row.has_expiry),
    is_system_defined: Boolean(row.document_type_is_system_defined ?? row.is_system_defined),
    is_active: Boolean(row.document_type_is_active ?? row.is_active),
    sort_order: Number(row.document_type_sort_order ?? row.sort_order ?? 0),
  };

  if (row.document_type_created_at) {
    documentType.created_at = String(row.document_type_created_at);
  }

  if (row.document_type_updated_at) {
    documentType.updated_at = String(row.document_type_updated_at);
  }

  return documentType;
};

const mapEmployeeDocumentRow = (row: any): EmployeeDocumentRecord => {
  const hasExpiry = Boolean(row.document_type_has_expiry ?? row.has_expiry);
  const document: EmployeeDocumentRecord = {
    id: Number(row.employee_document_id ?? row.id),
    employee_id: Number(row.employee_id),
    document_type_id: Number(row.document_type_id),
    title: String(row.document_title ?? row.title),
    description: row.document_description
      ? String(row.document_description)
      : row.description
        ? String(row.description)
        : null,
    file_path: String(row.file_path),
    file_size: Number(row.file_size ?? 0),
    mime_type: String(row.mime_type ?? 'application/pdf'),
    uploaded_by_user_id: String(row.uploaded_by_user_id),
    issue_date: row.issue_date ? String(row.issue_date) : null,
    expiry_date: row.expiry_date ? String(row.expiry_date) : null,
    status: String(row.document_status ?? row.status) as EmployeeDocumentRecord['status'],
    version: Number(row.version ?? 1),
    is_current: Boolean(row.is_current),
    replaces_document_id: row.replaces_document_id ? Number(row.replaces_document_id) : null,
    uploaded_by_name: row.uploaded_by_name ? String(row.uploaded_by_name) : null,
    is_sensitive: Boolean(row.document_type_is_sensitive ?? row.is_sensitive),
    has_expiry: hasExpiry,
    expiry_status: calculateDocumentExpiryStatus(
      hasExpiry,
      row.expiry_date ? String(row.expiry_date) : null,
    ),
  };

  if (row.document_created_at) {
    document.created_at = String(row.document_created_at);
  }

  if (row.document_updated_at) {
    document.updated_at = String(row.document_updated_at);
  }

  return document;
};

const ensureEmployeeExists = async (employeeId: number): Promise<EmployeeRecord> => {
  const employee = await getEmployeeById(employeeId);
  if (!employee || !employee.is_active) {
    const error = new Error('EMPLOYEE_NOT_FOUND');
    (error as any).code = 'EMPLOYEE_NOT_FOUND';
    throw error;
  }

  return employee;
};

const ensureDocumentTypeExists = async (documentTypeId: number): Promise<DocumentTypeRecord> => {
  const result = await pool.query(
    `
      SELECT
        dt.id AS document_type_id,
        dt.section_id,
        dt.code AS document_type_code,
        dt.name AS document_type_name,
        dt.description AS document_type_description,
        dt.is_required AS document_type_is_required,
        dt.is_sensitive AS document_type_is_sensitive,
        dt.has_expiry AS document_type_has_expiry,
        dt.is_system_defined AS document_type_is_system_defined,
        dt.is_active AS document_type_is_active,
        dt.sort_order AS document_type_sort_order,
        dt.created_at AS document_type_created_at,
        dt.updated_at AS document_type_updated_at
      FROM public.document_types dt
      WHERE dt.id = $1
      LIMIT 1;
    `,
    [documentTypeId],
  );

  if (result.rows.length === 0 || result.rows[0]?.document_type_is_active === false) {
    const error = new Error('DOCUMENT_TYPE_NOT_FOUND');
    (error as any).code = 'DOCUMENT_TYPE_NOT_FOUND';
    throw error;
  }

  return mapDocumentTypeRow(result.rows[0]);
};

const ensureDocumentTypeAssignedToEmployee = async (
  employeeId: number,
  documentTypeId: number,
): Promise<void> => {
  await initializeDefaultEmployeeDocumentAccess(employeeId);

  const result = await pool.query(
    `
      SELECT 1
      FROM public.document_types dt
      INNER JOIN public.document_sections s
        ON s.id = dt.section_id
       AND s.is_active = TRUE
      INNER JOIN public.employee_document_section_access sa
        ON sa.employee_id = $1
       AND sa.section_id = s.id
       AND sa.is_enabled = TRUE
      INNER JOIN public.employee_document_type_access ta
        ON ta.employee_id = $1
       AND ta.document_type_id = dt.id
       AND ta.is_enabled = TRUE
      WHERE dt.id = $2
        AND dt.is_active = TRUE
      LIMIT 1;
    `,
    [employeeId, documentTypeId],
  );

  if (result.rows.length === 0) {
    const error = new Error('DOCUMENT_TYPE_NOT_ASSIGNED_TO_EMPLOYEE');
    (error as any).code = 'DOCUMENT_TYPE_NOT_ASSIGNED_TO_EMPLOYEE';
    throw error;
  }
};

export const canUserAccessEmployeeExpedient = async (
  userId: string,
  role: UserRole,
  employeeId: number,
): Promise<boolean> => {
  if (role === 'ADMIN' || role === 'EDITOR') {
    return true;
  }

  const result = await pool.query(
    `
      SELECT 1
      FROM public.employees
      WHERE id = $1
        AND user_id = $2
        AND is_active = TRUE
      LIMIT 1;
    `,
    [employeeId, userId],
  );

  return result.rows.length > 0;
};

export const getEmployeeForAuthenticatedUser = async (
  userId: string,
): Promise<EmployeeRecord> => {
  const employee = await getEmployeeByUserId(userId);
  if (!employee) {
    const error = new Error('EMPLOYEE_PROFILE_NOT_FOUND');
    (error as any).code = 'EMPLOYEE_PROFILE_NOT_FOUND';
    throw error;
  }

  return employee;
};

export const listEmployeeDocuments = async (
  employeeId: number,
  filters: EmployeeDocumentFilters = {},
): Promise<EmployeeDocumentRecord[]> => {
  await assertEmployeeDocumentsTable();
  await initializeDefaultEmployeeDocumentAccess(employeeId);

  const values: unknown[] = [employeeId];
  const whereClauses = [
    'ed.employee_id = $1',
    's.is_active = TRUE',
    'dt.is_active = TRUE',
    'sa.is_enabled = TRUE',
    'ta.is_enabled = TRUE',
  ];

  if (filters.section_id) {
    values.push(filters.section_id);
    whereClauses.push(`dt.section_id = $${values.length}`);
  }

  if (filters.document_type_id) {
    values.push(filters.document_type_id);
    whereClauses.push(`ed.document_type_id = $${values.length}`);
  }

  if (filters.current_only !== false) {
    whereClauses.push(`ed.is_current = TRUE`);
  }

  const result = await pool.query(
    `
      SELECT
        ed.id AS employee_document_id,
        ed.employee_id,
        ed.document_type_id,
        ed.title AS document_title,
        ed.description AS document_description,
        ed.file_path,
        ed.file_size,
        ed.mime_type,
        ed.uploaded_by_user_id,
        ed.issue_date,
        ed.expiry_date,
        ed.status AS document_status,
        ed.version,
        ed.is_current,
        ed.replaces_document_id,
        ed.created_at AS document_created_at,
        ed.updated_at AS document_updated_at,
        u.full_name AS uploaded_by_name,
        dt.is_sensitive AS document_type_is_sensitive,
        dt.has_expiry AS document_type_has_expiry
      FROM public.employee_documents ed
      INNER JOIN public.document_types dt ON dt.id = ed.document_type_id
      INNER JOIN public.document_sections s ON s.id = dt.section_id
      INNER JOIN public.employee_document_section_access sa
        ON sa.employee_id = ed.employee_id
       AND sa.section_id = s.id
      INNER JOIN public.employee_document_type_access ta
        ON ta.employee_id = ed.employee_id
       AND ta.document_type_id = dt.id
      LEFT JOIN public.users u ON u.id = ed.uploaded_by_user_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ed.created_at DESC, ed.id DESC;
    `,
    values,
  );

  const documents = result.rows.map((row) => mapEmployeeDocumentRow(row));

  if (!filters.expiry_status) {
    return documents;
  }

  return documents.filter((document) => document.expiry_status === filters.expiry_status);
};

export const getEmployeeDocumentById = async (
  documentId: number,
): Promise<EmployeeDocumentRecord | null> => {
  await assertEmployeeDocumentsTable();

  const result = await pool.query(
    `
      SELECT
        ed.id AS employee_document_id,
        ed.employee_id,
        ed.document_type_id,
        ed.title AS document_title,
        ed.description AS document_description,
        ed.file_path,
        ed.file_size,
        ed.mime_type,
        ed.uploaded_by_user_id,
        ed.issue_date,
        ed.expiry_date,
        ed.status AS document_status,
        ed.version,
        ed.is_current,
        ed.replaces_document_id,
        ed.created_at AS document_created_at,
        ed.updated_at AS document_updated_at,
        u.full_name AS uploaded_by_name,
        dt.is_sensitive AS document_type_is_sensitive,
        dt.has_expiry AS document_type_has_expiry
      FROM public.employee_documents ed
      INNER JOIN public.document_types dt ON dt.id = ed.document_type_id
      LEFT JOIN public.users u ON u.id = ed.uploaded_by_user_id
      WHERE ed.id = $1
      LIMIT 1;
    `,
    [documentId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapEmployeeDocumentRow(result.rows[0]);
};

export const listEmployeeDocumentHistory = async (
  employeeId: number,
  documentTypeId: number,
): Promise<EmployeeDocumentRecord[]> => {
  await ensureEmployeeExists(employeeId);
  await ensureDocumentTypeAssignedToEmployee(employeeId, documentTypeId);
  return listEmployeeDocuments(employeeId, {
    document_type_id: documentTypeId,
    current_only: false,
  });
};

export const buildEmployeeExpedient = async (employeeId: number): Promise<{
  employee: EmployeeRecord;
  summary: EmployeeExpedientSummary;
  sections: EmployeeExpedientSection[];
}> => {
  await assertEmployeeDocumentsTable();

  const employee = await ensureEmployeeExists(employeeId);
  await initializeDefaultEmployeeDocumentAccess(employeeId);

  const result = await pool.query(
    `
      SELECT
        s.id AS section_id,
        s.code AS section_code,
        s.name AS section_name,
        s.description AS section_description,
        s.is_active AS section_is_active,
        s.is_system_defined AS section_is_system_defined,
        s.sort_order AS section_sort_order,
        s.created_at AS section_created_at,
        s.updated_at AS section_updated_at,
        dt.id AS document_type_id,
        dt.section_id,
        dt.code AS document_type_code,
        dt.name AS document_type_name,
        dt.description AS document_type_description,
        dt.is_required AS document_type_is_required,
        dt.is_sensitive AS document_type_is_sensitive,
        dt.has_expiry AS document_type_has_expiry,
        dt.is_system_defined AS document_type_is_system_defined,
        dt.is_active AS document_type_is_active,
        dt.sort_order AS document_type_sort_order,
        dt.created_at AS document_type_created_at,
        dt.updated_at AS document_type_updated_at,
        ed.id AS employee_document_id,
        ed.employee_id,
        ed.title AS document_title,
        ed.description AS document_description,
        ed.file_path,
        ed.file_size,
        ed.mime_type,
        ed.uploaded_by_user_id,
        ed.issue_date,
        ed.expiry_date,
        ed.status AS document_status,
        ed.version,
        ed.is_current,
        ed.replaces_document_id,
        ed.created_at AS document_created_at,
        ed.updated_at AS document_updated_at,
        u.full_name AS uploaded_by_name
      FROM public.document_sections s
      INNER JOIN public.document_types dt
        ON dt.section_id = s.id
       AND dt.is_active = TRUE
      INNER JOIN public.employee_document_section_access sa
        ON sa.employee_id = $1
       AND sa.section_id = s.id
       AND sa.is_enabled = TRUE
      INNER JOIN public.employee_document_type_access ta
        ON ta.employee_id = $1
       AND ta.document_type_id = dt.id
       AND ta.is_enabled = TRUE
      LEFT JOIN public.employee_documents ed
        ON ed.document_type_id = dt.id
       AND ed.employee_id = $1
       AND ed.is_current = TRUE
      LEFT JOIN public.users u ON u.id = ed.uploaded_by_user_id
      WHERE s.is_active = TRUE
      ORDER BY s.sort_order ASC, s.name ASC, dt.sort_order ASC, dt.name ASC;
    `,
    [employeeId],
  );

  const sectionMap = new Map<number, EmployeeExpedientSection>();

  let totalTypes = 0;
  let requiredTypes = 0;
  let uploadedTypes = 0;
  let expiringCount = 0;
  let expiredCount = 0;

  for (const row of result.rows) {
    const section = mapSectionRow(row);
    const documentType = mapDocumentTypeRow(row);
    const currentDocument =
      row.employee_document_id !== null && row.employee_document_id !== undefined
        ? mapEmployeeDocumentRow(row)
        : null;
    const itemStatus = calculateItemStatus(documentType, currentDocument);

    totalTypes += 1;
    if (documentType.is_required) {
      requiredTypes += 1;
    }
    if (currentDocument) {
      uploadedTypes += 1;
    }
    if (itemStatus === 'expiring') {
      expiringCount += 1;
    }
    if (itemStatus === 'expired') {
      expiredCount += 1;
    }

    const currentSection = sectionMap.get(section.id) ?? {
      section,
      items: [],
    };

    currentSection.items.push({
      document_type: documentType,
      current_document: currentDocument,
      status: itemStatus,
    });

    sectionMap.set(section.id, currentSection);
  }

  const missingTypes = Math.max(totalTypes - uploadedTypes, 0);
  const completionPercent = totalTypes > 0 ? Math.round((uploadedTypes / totalTypes) * 100) : 0;

  return {
    employee,
    summary: {
      total_types: totalTypes,
      required_types: requiredTypes,
      uploaded_types: uploadedTypes,
      missing_types: missingTypes,
      completion_percent: completionPercent,
      expiring_count: expiringCount,
      expired_count: expiredCount,
    },
    sections: Array.from(sectionMap.values()),
  };
};

export const uploadEmployeeDocument = async (
  employeeId: number,
  uploadedByUserId: string,
  file: Express.Multer.File,
  payload: EmployeeDocumentPayload,
): Promise<EmployeeDocumentRecord> => {
  await assertEmployeeDocumentsTable();

  await ensureEmployeeExists(employeeId);
  const documentType = await ensureDocumentTypeExists(payload.document_type_id);
  await ensureDocumentTypeAssignedToEmployee(employeeId, documentType.id);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (documentType.has_expiry) {
      if (!payload.issue_date || !payload.expiry_date) {
        const error = new Error('EXPIRY_DATES_REQUIRED');
        (error as any).code = 'EXPIRY_DATES_REQUIRED';
        throw error;
      }

      const issueDate = parseIsoDate(payload.issue_date);
      const expiryDate = parseIsoDate(payload.expiry_date);

      if (!issueDate || !expiryDate) {
        const error = new Error('EXPIRY_DATES_INVALID');
        (error as any).code = 'EXPIRY_DATES_INVALID';
        throw error;
      }

      if (expiryDate.getTime() <= issueDate.getTime()) {
        const error = new Error('EXPIRY_MUST_BE_AFTER_ISSUE');
        (error as any).code = 'EXPIRY_MUST_BE_AFTER_ISSUE';
        throw error;
      }
    }

    const currentResult = await client.query(
      `
        SELECT id, version
        FROM public.employee_documents
        WHERE employee_id = $1
          AND document_type_id = $2
          AND is_current = TRUE
        LIMIT 1
        FOR UPDATE;
      `,
      [employeeId, documentType.id],
    );

    const currentDocument = currentResult.rows[0] ?? null;
    const nextVersion = currentDocument ? Number(currentDocument.version) + 1 : 1;

    if (currentDocument) {
      await client.query(
        `
          UPDATE public.employee_documents
          SET
            status = 'superseded',
            is_current = FALSE,
            updated_at = NOW()
          WHERE id = $1;
        `,
        [currentDocument.id],
      );
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.employee_documents (
          employee_id,
          document_type_id,
          title,
          description,
          file_path,
          file_size,
          mime_type,
          uploaded_by_user_id,
          issue_date,
          expiry_date,
          status,
          version,
          is_current,
          replaces_document_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, TRUE, $12
        )
        RETURNING id;
      `,
      [
        employeeId,
        documentType.id,
        payload.title.trim(),
        payload.description?.trim() || null,
        file.path,
        file.size,
        file.mimetype || 'application/pdf',
        uploadedByUserId,
        payload.issue_date ?? null,
        payload.expiry_date ?? null,
        nextVersion,
        currentDocument ? Number(currentDocument.id) : null,
      ],
    );

    const documentId = Number(insertResult.rows[0]?.id);

    await client.query('COMMIT');

    await registerAuditEvent({
      user_id: uploadedByUserId,
      action: `RH_DOCUMENT_UPLOAD:${documentId}`,
      module_code: 'RH',
      entity_type: 'employee_document',
      entity_id: documentId,
      employee_id: employeeId,
      metadata: {
        document_type_id: documentType.id,
        version: nextVersion,
      },
    });

    const createdDocument = await getEmployeeDocumentById(documentId);
    if (!createdDocument) {
      const error = new Error('EMPLOYEE_DOCUMENT_CREATION_FAILED');
      (error as any).code = 'EMPLOYEE_DOCUMENT_CREATION_FAILED';
      throw error;
    }

    return createdDocument;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const resolveEmployeeDocumentPath = async (documentId: number): Promise<{
  document: EmployeeDocumentRecord;
  absolutePath: string;
}> => {
  const document = await getEmployeeDocumentById(documentId);
  if (!document) {
    const error = new Error('EMPLOYEE_DOCUMENT_NOT_FOUND');
    (error as any).code = 'EMPLOYEE_DOCUMENT_NOT_FOUND';
    throw error;
  }

  const absolutePath = resolveStoredDocumentPath(document.file_path);
  return {
    document,
    absolutePath,
  };
};

export const canUserAccessEmployeeDocument = async (
  userId: string,
  role: UserRole,
  documentId: number,
): Promise<boolean> => {
  const result = await pool.query(
    `
      SELECT
        ed.id,
        ed.employee_id,
        e.user_id,
        dt.is_sensitive,
        COALESCE(sa.is_enabled, TRUE) AS section_is_enabled,
        COALESCE(ta.is_enabled, TRUE) AS document_type_is_enabled
      FROM public.employee_documents ed
      INNER JOIN public.employees e ON e.id = ed.employee_id
      INNER JOIN public.document_types dt ON dt.id = ed.document_type_id
      INNER JOIN public.document_sections s ON s.id = dt.section_id
      LEFT JOIN public.employee_document_section_access sa
        ON sa.employee_id = ed.employee_id
       AND sa.section_id = s.id
      LEFT JOIN public.employee_document_type_access ta
        ON ta.employee_id = ed.employee_id
       AND ta.document_type_id = dt.id
      WHERE ed.id = $1
      LIMIT 1;
    `,
    [documentId],
  );

  if (result.rows.length === 0) {
    return false;
  }

  const row = result.rows[0];
  await initializeDefaultEmployeeDocumentAccess(Number(row.employee_id));
  if (!row.section_is_enabled || !row.document_type_is_enabled) {
    return false;
  }

  if (role === 'ADMIN' || role === 'EDITOR') {
    return true;
  }

  const isOwner = row.user_id && String(row.user_id) === userId;

  if (!isOwner) {
    return false;
  }

  return true;
};
