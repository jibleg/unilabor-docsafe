import pool from '../config/db';
import type { AuditLogRecord, ModuleCode } from '../types';

interface AuditColumnsSupport {
  module_code: boolean;
  entity_type: boolean;
  entity_id: boolean;
  employee_id: boolean;
  metadata: boolean;
}

interface RegisterAuditEventInput {
  user_id?: string | null;
  action: string;
  ip_address?: string | null;
  module_code?: ModuleCode;
  entity_type?: string | null;
  entity_id?: number | null;
  employee_id?: number | null;
  document_id?: number | string | null;
  metadata?: Record<string, unknown> | null;
}

interface AuditFilters {
  module_code?: ModuleCode;
  employee_id?: number;
  limit?: number;
}

let cachedAccessLogColumns: AuditColumnsSupport | null = null;

const getAccessLogColumnsSupport = async (): Promise<AuditColumnsSupport> => {
  if (cachedAccessLogColumns) {
    return cachedAccessLogColumns;
  }

  const result = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'access_logs'
        AND column_name IN ('module_code', 'entity_type', 'entity_id', 'employee_id', 'metadata');
    `,
  );

  const availableColumns = new Set(result.rows.map((row) => String(row.column_name)));

  cachedAccessLogColumns = {
    module_code: availableColumns.has('module_code'),
    entity_type: availableColumns.has('entity_type'),
    entity_id: availableColumns.has('entity_id'),
    employee_id: availableColumns.has('employee_id'),
    metadata: availableColumns.has('metadata'),
  };

  return cachedAccessLogColumns;
};

const parseAuditEntityId = (action: string): number | null => {
  const match = action.match(/:(\d+)$/);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const inferModuleCode = (action: string, documentId: number | null): ModuleCode => {
  if (action.startsWith('RH_')) {
    return 'RH';
  }

  if (documentId) {
    return 'QUALITY';
  }

  return 'QUALITY';
};

export const registerAuditEvent = async ({
  user_id,
  action,
  ip_address,
  module_code,
  entity_type,
  entity_id,
  employee_id,
  document_id,
  metadata,
}: RegisterAuditEventInput): Promise<void> => {
  if (!user_id) {
    return;
  }

  try {
    const support = await getAccessLogColumnsSupport();
    const columns = ['user_id'];
    const values: unknown[] = [user_id];

    if (document_id !== undefined) {
      columns.push('document_id');
      values.push(document_id);
    }

    columns.push('action');
    values.push(action);

    columns.push('ip_address');
    values.push(ip_address ?? null);

    if (support.module_code) {
      columns.push('module_code');
      values.push(module_code ?? inferModuleCode(action, document_id ? Number(document_id) : null));
    }

    if (support.entity_type) {
      columns.push('entity_type');
      values.push(entity_type ?? null);
    }

    if (support.entity_id) {
      columns.push('entity_id');
      values.push(entity_id ?? parseAuditEntityId(action));
    }

    if (support.employee_id) {
      columns.push('employee_id');
      values.push(employee_id ?? null);
    }

    if (support.metadata) {
      columns.push('metadata');
      values.push(metadata ? JSON.stringify(metadata) : null);
    }

    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    await pool.query(
      `INSERT INTO access_logs (${columns.join(', ')}) VALUES (${placeholders})`,
      values,
    );
  } catch (error) {
    console.error('No se pudo registrar auditoria:', error);
  }
};

const mapActionToLabel = (action: string): string => {
  const normalized = action.split(':')[0] ?? action;

  switch (normalized) {
    case 'VIEW':
    case 'RH_DOCUMENT_VIEW':
      return 'VIEW';
    case 'DELETE':
    case 'RH_EMPLOYEE_DELETE':
      return 'DELETE';
    case 'UPDATE':
    case 'RH_EMPLOYEE_UPDATE':
      return 'UPDATE';
    case 'ENABLE':
      return 'ENABLE';
    case 'DISABLE':
      return 'DISABLE';
    case 'RH_DOCUMENT_UPLOAD':
      return 'UPLOAD';
    case 'RH_EMPLOYEE_CREATE':
      return 'CREATE';
    default:
      return normalized;
  }
};

export const listAuditLogs = async (
  filters: AuditFilters = {},
): Promise<AuditLogRecord[]> => {
  const requestedLimit =
    typeof filters.limit === 'number' && Number.isFinite(filters.limit) && filters.limit > 0
      ? Math.min(filters.limit, 300)
      : 200;

  const result = await pool.query(
    `
      SELECT
        l.accessed_at,
        l.user_id,
        l.action,
        l.ip_address,
        l.document_id,
        u.full_name,
        u.email,
        d.title AS quality_document
      FROM public.access_logs l
      LEFT JOIN public.users u ON u.id = l.user_id
      LEFT JOIN public.documents d ON d.id = l.document_id
      ORDER BY l.accessed_at DESC
      LIMIT $1;
    `,
    [requestedLimit],
  );

  const rows = result.rows;
  const rhDocumentIds = new Set<number>();
  const rhEmployeeIds = new Set<number>();

  for (const row of rows) {
    const action = String(row.action ?? '');
    const entityId = parseAuditEntityId(action);

    if (action.startsWith('RH_DOCUMENT_') && entityId) {
      rhDocumentIds.add(entityId);
    }

    if (action.startsWith('RH_EMPLOYEE_') && entityId) {
      rhEmployeeIds.add(entityId);
    }
  }

  const employeeDocumentMap = new Map<number, {
    employee_id: number;
    employee_code: string | null;
    employee_name: string | null;
    document_type_id: number | null;
    document_type_name: string | null;
    document_title: string | null;
  }>();

  if (rhDocumentIds.size > 0) {
    const ids = Array.from(rhDocumentIds);
    const docResult = await pool.query(
      `
        SELECT
          ed.id,
          ed.employee_id,
          ed.title,
          e.employee_code,
          e.full_name AS employee_name,
          dt.id AS document_type_id,
          dt.name AS document_type_name
        FROM public.employee_documents ed
        INNER JOIN public.employees e ON e.id = ed.employee_id
        INNER JOIN public.document_types dt ON dt.id = ed.document_type_id
        WHERE ed.id = ANY($1::bigint[]);
      `,
      [ids],
    );

    for (const row of docResult.rows) {
      employeeDocumentMap.set(Number(row.id), {
        employee_id: Number(row.employee_id),
        employee_code: row.employee_code ? String(row.employee_code) : null,
        employee_name: row.employee_name ? String(row.employee_name) : null,
        document_type_id: row.document_type_id ? Number(row.document_type_id) : null,
        document_type_name: row.document_type_name ? String(row.document_type_name) : null,
        document_title: row.title ? String(row.title) : null,
      });
    }
  }

  const employeeMap = new Map<number, { employee_code: string | null; employee_name: string | null }>();

  if (rhEmployeeIds.size > 0) {
    const ids = Array.from(rhEmployeeIds);
    const employeeResult = await pool.query(
      `
        SELECT id, employee_code, full_name
        FROM public.employees
        WHERE id = ANY($1::int[]);
      `,
      [ids],
    );

    for (const row of employeeResult.rows) {
      employeeMap.set(Number(row.id), {
        employee_code: row.employee_code ? String(row.employee_code) : null,
        employee_name: row.full_name ? String(row.full_name) : null,
      });
    }
  }

  const mapped = rows.map((row): AuditLogRecord => {
    const action = String(row.action ?? '');
    const actionEntityId = parseAuditEntityId(action);
    const module_code = inferModuleCode(action, row.document_id ? Number(row.document_id) : null);
    const rhDocument = actionEntityId ? employeeDocumentMap.get(actionEntityId) : undefined;
    const rhEmployee = actionEntityId ? employeeMap.get(actionEntityId) : undefined;

    const employeeId = rhDocument?.employee_id ?? (action.startsWith('RH_EMPLOYEE_') ? actionEntityId : null);

    return {
      accessed_at: String(row.accessed_at),
      module_code,
      action: mapActionToLabel(action),
      ip_address: row.ip_address ? String(row.ip_address) : null,
      user_id: row.user_id ? String(row.user_id) : null,
      full_name: row.full_name ? String(row.full_name) : null,
      email: row.email ? String(row.email) : null,
      document:
        row.quality_document
          ? String(row.quality_document)
          : rhDocument?.document_title ?? null,
      document_id:
        row.document_id !== null && row.document_id !== undefined ? Number(row.document_id) : null,
      employee_id: employeeId ?? null,
      employee_code: rhDocument?.employee_code ?? rhEmployee?.employee_code ?? null,
      employee_name: rhDocument?.employee_name ?? rhEmployee?.employee_name ?? null,
      document_type_id: rhDocument?.document_type_id ?? null,
      document_type_name: rhDocument?.document_type_name ?? null,
      entity_type: action.startsWith('RH_DOCUMENT_')
        ? 'employee_document'
        : action.startsWith('RH_EMPLOYEE_')
          ? 'employee'
          : row.document_id
            ? 'document'
            : null,
      entity_id: actionEntityId,
    };
  });

  return mapped
    .filter((log) => !filters.module_code || log.module_code === filters.module_code)
    .filter((log) => !filters.employee_id || log.employee_id === filters.employee_id)
    .slice(0, requestedLimit);
};
