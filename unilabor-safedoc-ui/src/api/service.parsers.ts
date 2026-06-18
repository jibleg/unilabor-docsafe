import axios from 'axios';
import type {
  AuditLog,
  Category,
  Document,
  DocumentSection,
  DocumentStatus,
  DocumentType,
  EmployeeAlert,
  EmployeeAlertsSummary,
  EmployeeAlertState,
  EmployeeDocument,
  EmployeeDocumentAccessMatrix,
  EmployeeDocumentAccessResponse,
  EmployeeDocumentAccessSection,
  EmployeeDocumentAccessTypeItem,
  EmployeeExpedient,
  EmployeeExpedientItem,
  EmployeeExpedientSection,
  EmployeeExpedientSummary,
  ExpedientItemStatus,
  User,
} from '../types/models';
import {
  asRecord,
  getString,
  getNumber,
  getBoolean,
  getIdValue,
  unwrapPayload,
  getArrayFromPayload,
} from './service.shared';
import {
  normalizeUser,
  normalizeEmployee,
} from './service.normalizers';

export const normalizeDocumentSection = (input: unknown): DocumentSection | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const code = getString(source, ['code']);
  const name = getString(source, ['name']);

  if (!id || !code || !name) {
    return null;
  }

  return {
    id,
    code,
    name,
    description: getString(source, ['description']) || null,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    is_system_defined: getBoolean(source, ['is_system_defined', 'isSystemDefined'], false),
    sort_order: getNumber(source, ['sort_order', 'sortOrder'], 0),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
  };
};

export const normalizeDocumentType = (input: unknown): DocumentType | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const sectionId = getNumber(source, ['section_id', 'sectionId']);
  const name = getString(source, ['name']);

  if (!id || !sectionId || !name) {
    return null;
  }

  return {
    id,
    section_id: sectionId,
    code: getString(source, ['code']) || null,
    name,
    description: getString(source, ['description']) || null,
    is_required: getBoolean(source, ['is_required', 'isRequired'], false),
    is_sensitive: getBoolean(source, ['is_sensitive', 'isSensitive'], false),
    has_expiry: getBoolean(source, ['has_expiry', 'hasExpiry'], false),
    is_system_defined: getBoolean(source, ['is_system_defined', 'isSystemDefined'], false),
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    sort_order: getNumber(source, ['sort_order', 'sortOrder'], 0),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    section: normalizeDocumentSection(source.section),
  };
};

export const normalizeEmployeeDocument = (input: unknown): EmployeeDocument | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const employeeId = getNumber(source, ['employee_id', 'employeeId']);
  const documentTypeId = getNumber(source, ['document_type_id', 'documentTypeId']);
  const title = getString(source, ['title']);
  const filePath = getString(source, ['file_path', 'filePath', 'filename']);
  const uploadedByUserId = getString(source, ['uploaded_by_user_id', 'uploadedByUserId']);

  if (!id || !employeeId || !documentTypeId || !title || !filePath || !uploadedByUserId) {
    return null;
  }

  return {
    id,
    employee_id: employeeId,
    document_type_id: documentTypeId,
    title,
    description: getString(source, ['description']) || null,
    file_path: filePath,
    file_size: getNumber(source, ['file_size', 'fileSize'], 0),
    mime_type: getString(source, ['mime_type', 'mimeType'], 'application/pdf'),
    uploaded_by_user_id: uploadedByUserId,
    issue_date: getString(source, ['issue_date', 'issueDate']) || null,
    expiry_date: getString(source, ['expiry_date', 'expiryDate']) || null,
    status: getString(source, ['status'], 'active') as DocumentStatus,
    version: getNumber(source, ['version'], 1),
    is_current: getBoolean(source, ['is_current', 'isCurrent'], true),
    replaces_document_id:
      getNumber(source, ['replaces_document_id', 'replacesDocumentId'], 0) > 0
        ? getNumber(source, ['replaces_document_id', 'replacesDocumentId'], 0)
        : null,
    reference_key: getString(source, ['reference_key', 'referenceKey']) || null,
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    uploaded_by_name: getString(source, ['uploaded_by_name', 'uploadedByName']) || null,
    is_sensitive: getBoolean(source, ['is_sensitive', 'isSensitive'], false),
    has_expiry: getBoolean(source, ['has_expiry', 'hasExpiry'], false),
    expiry_status:
      (() => {
        const normalized = typeof (source.expiry_status ?? source.expiryStatus) === 'string'
          ? String(source.expiry_status ?? source.expiryStatus).trim().toLowerCase()
          : '';

        switch (normalized) {
          case 'valid':
          case 'expiring':
          case 'expired':
            return normalized;
          case 'uploaded':
          default:
            return 'uploaded';
        }
      })(),
    };
  };

export const normalizeExpedientStatus = (value: unknown): ExpedientItemStatus => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  switch (normalized) {
    case 'uploaded':
    case 'valid':
    case 'expiring':
    case 'expired':
      return normalized;
    case 'missing':
    default:
      return 'missing';
  }
};

export const normalizeEmployeeExpedientSummary = (input: unknown): EmployeeExpedientSummary => {
  const source = asRecord(input);
  if (!source) {
    return {
      total_types: 0,
      required_types: 0,
      uploaded_types: 0,
      missing_types: 0,
      completion_percent: 0,
      expiring_count: 0,
      expired_count: 0,
    };
  }

  return {
    total_types: getNumber(source, ['total_types', 'totalTypes']),
    required_types: getNumber(source, ['required_types', 'requiredTypes']),
    uploaded_types: getNumber(source, ['uploaded_types', 'uploadedTypes']),
    missing_types: getNumber(source, ['missing_types', 'missingTypes']),
    completion_percent: getNumber(source, ['completion_percent', 'completionPercent']),
    expiring_count: getNumber(source, ['expiring_count', 'expiringCount']),
    expired_count: getNumber(source, ['expired_count', 'expiredCount']),
  };
};

export const normalizeEmployeeExpedientItem = (input: unknown): EmployeeExpedientItem | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const documentType = normalizeDocumentType(source.document_type ?? source.documentType);
  if (!documentType) {
    return null;
  }

  return {
    document_type: documentType,
    current_document: normalizeEmployeeDocument(source.current_document ?? source.currentDocument),
    status: normalizeExpedientStatus(source.status),
  };
};

export const normalizeEmployeeExpedientSection = (input: unknown): EmployeeExpedientSection | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const section = normalizeDocumentSection(source.section);
  if (!section) {
    return null;
  }

  return {
    section,
    items: getArrayFromPayload(source.items ?? source.types ?? [], ['items'])
      .map(normalizeEmployeeExpedientItem)
      .filter((item): item is EmployeeExpedientItem => item !== null),
  };
};

export const normalizeEmployeeExpedient = (input: unknown): EmployeeExpedient | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const employee = normalizeEmployee(source.employee);
  if (!employee) {
    return null;
  }

  return {
    employee,
    summary: normalizeEmployeeExpedientSummary(source.summary),
    sections: getArrayFromPayload(source.sections, ['sections'])
      .map(normalizeEmployeeExpedientSection)
      .filter((section): section is EmployeeExpedientSection => section !== null),
  };
};

export const normalizeEmployeeDocumentAccessTypeItem = (input: unknown): EmployeeDocumentAccessTypeItem | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const documentType = normalizeDocumentType(source.document_type ?? source.documentType);
  if (!documentType) {
    return null;
  }

  return {
    document_type: documentType,
    is_enabled: getBoolean(source, ['is_enabled', 'isEnabled'], false),
  };
};

export const normalizeEmployeeDocumentAccessSection = (input: unknown): EmployeeDocumentAccessSection | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const section = normalizeDocumentSection(source.section);
  if (!section) {
    return null;
  }

  return {
    section,
    is_enabled: getBoolean(source, ['is_enabled', 'isEnabled'], false),
    document_types: getArrayFromPayload(source.document_types ?? source.documentTypes ?? [], ['document_types', 'documentTypes'])
      .map(normalizeEmployeeDocumentAccessTypeItem)
      .filter((item): item is EmployeeDocumentAccessTypeItem => item !== null),
  };
};

export const normalizeNumericArray = (input: unknown): number[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  return [...new Set(
    input
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  )];
};

export const normalizeEmployeeDocumentAccessMatrix = (input: unknown): EmployeeDocumentAccessMatrix | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const employeeId = getNumber(source, ['employee_id', 'employeeId']);
  if (!employeeId) {
    return null;
  }

  return {
    employee_id: employeeId,
    sections: getArrayFromPayload(source.sections, ['sections'])
      .map(normalizeEmployeeDocumentAccessSection)
      .filter((section): section is EmployeeDocumentAccessSection => section !== null),
    enabled_section_ids: normalizeNumericArray(source.enabled_section_ids ?? source.enabledSectionIds),
    enabled_document_type_ids: normalizeNumericArray(
      source.enabled_document_type_ids ?? source.enabledDocumentTypeIds,
    ),
  };
};

export const normalizeEmployeeDocumentAccessResponse = (input: unknown): EmployeeDocumentAccessResponse | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const employee = normalizeEmployee(source.employee);
  const access = normalizeEmployeeDocumentAccessMatrix(source.access);

  if (!employee || !access) {
    return null;
  }

  return {
    employee,
    access,
  };
};

export const normalizeEmployeeAlert = (input: unknown): EmployeeAlert | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const employeeId = getNumber(source, ['employee_id', 'employeeId']);
  const employeeCode = getString(source, ['employee_code', 'employeeCode']);
  const employeeName = getString(source, ['employee_name', 'employeeName']);
  const employeeEmail = getString(source, ['employee_email', 'employeeEmail']);
  const sectionId = getNumber(source, ['section_id', 'sectionId']);
  const sectionName = getString(source, ['section_name', 'sectionName']);
  const documentTypeId = getNumber(source, ['document_type_id', 'documentTypeId']);
  const documentTypeName = getString(source, ['document_type_name', 'documentTypeName']);
  const state = getString(source, ['state']).toLowerCase();

  if (
    !employeeId ||
    !employeeCode ||
    !employeeName ||
    !employeeEmail ||
    !sectionId ||
    !sectionName ||
    !documentTypeId ||
    !documentTypeName ||
    (state !== 'missing' && state !== 'expiring' && state !== 'expired')
  ) {
    return null;
  }

  return {
    employee_id: employeeId,
    employee_code: employeeCode,
    employee_name: employeeName,
    employee_email: employeeEmail,
    area: getString(source, ['area']) || null,
    position: getString(source, ['position']) || null,
    state: state as EmployeeAlertState,
    section_id: sectionId,
    section_name: sectionName,
    document_type_id: documentTypeId,
    document_type_name: documentTypeName,
    document_id:
      getNumber(source, ['document_id', 'documentId'], 0) > 0
        ? getNumber(source, ['document_id', 'documentId'], 0)
        : undefined,
    expiry_date: getString(source, ['expiry_date', 'expiryDate']) || null,
    days_remaining:
      source.days_remaining === null || source.days_remaining === undefined
        ? null
        : getNumber(source, ['days_remaining', 'daysRemaining'], 0),
  };
};

export const normalizeEmployeeAlertsSummary = (input: unknown): EmployeeAlertsSummary => {
  const source = asRecord(input);
  if (!source) {
    return {
      missing: 0,
      expiring: 0,
      expired: 0,
      total: 0,
    };
  }

  return {
    missing: getNumber(source, ['missing']),
    expiring: getNumber(source, ['expiring']),
    expired: getNumber(source, ['expired']),
    total: getNumber(source, ['total']),
  };
};

export const extractUserFromPayload = (payload: unknown): User => {
  const unwrapped = unwrapPayload(payload);
  const source = asRecord(unwrapped);

  if (!source) {
    throw new Error('Formato de usuario invalido');
  }

  const userInput = source.user ?? source.profile ?? unwrapped;
  return normalizeUser(userInput);
};

export const normalizeDocument = (input: unknown): Document | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const title = getString(source, ['title'], 'Documento sin titulo');
  const filename = getString(source, ['filename', 'file_path', 'filePath', 'file_name', 'path']);
  const createdAt = getString(source, [
    'created_at',
    'createdAt',
    'uploaded_at',
    'publish_date',
    'updated_at',
  ]);

  if (!filename || !createdAt) {
    return null;
  }

  const rawId = source.id ?? source.document_id ?? source.uuid;
  const normalizedId =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? rawId
      : typeof rawId === 'string' && rawId.trim().length > 0
        ? rawId.trim()
        : filename;

  return {
    id: normalizedId,
    title,
    filename,
    uploaded_by: getString(source, ['uploaded_by', 'uploadedBy', 'owner_name'], 'Sistema'),
    created_at: createdAt,
    description: getString(source, ['description']),
    category_name: getString(source, ['category_name', 'category']),
    category_id:
      getNumber(source, ['category_id', 'categoryId'], 0) > 0
        ? getNumber(source, ['category_id', 'categoryId'], 0)
        : null,
    publish_date: getString(source, ['publish_date', 'publishDate']),
    expiry_date: getString(source, ['expiry_date', 'expiryDate']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    path: getString(source, ['path', 'file_path', 'filePath'], filename),
    status: getString(source, ['status'], 'active') as DocumentStatus,
    replaced_by_document_id: getIdValue(source, ['replaced_by_document_id', 'replacedByDocumentId']),
    replaces_document_id: getIdValue(source, ['replaces_document_id', 'replacesDocumentId']),
  };
};

export const normalizeAuditLog = (input: unknown): AuditLog | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const accessedAt = getString(source, ['accessed_at', 'accessedAt', 'created_at']);
  const action = getString(source, ['action']);
  const ipAddress = getString(source, ['ip_address', 'ipAddress']);

  if (!accessedAt || !action) {
    return null;
  }

  const documentValue = source.document;
  return {
    accessed_at: accessedAt,
    module_code:
      (() => {
        const moduleCode = getString(source, ['module_code', 'moduleCode']).toUpperCase();
        return moduleCode === 'RH' || moduleCode === 'QUALITY' || moduleCode === 'HELPDESK'
          ? moduleCode
          : undefined;
      })(),
    full_name: getString(source, ['full_name', 'fullName', 'name'], 'Sin nombre'),
    email: getString(source, ['email'], 'sin-correo@local'),
    document: typeof documentValue === 'string' ? documentValue : null,
    action,
    ip_address: ipAddress || null,
    employee_id:
      getNumber(source, ['employee_id', 'employeeId'], 0) > 0
        ? getNumber(source, ['employee_id', 'employeeId'], 0)
        : null,
    employee_code: getString(source, ['employee_code', 'employeeCode']) || null,
    employee_name: getString(source, ['employee_name', 'employeeName']) || null,
    document_id:
      getNumber(source, ['document_id', 'documentId'], 0) > 0
        ? getNumber(source, ['document_id', 'documentId'], 0)
        : null,
    document_type_id:
      getNumber(source, ['document_type_id', 'documentTypeId'], 0) > 0
        ? getNumber(source, ['document_type_id', 'documentTypeId'], 0)
        : null,
    document_type_name: getString(source, ['document_type_name', 'documentTypeName']) || null,
    entity_type: getString(source, ['entity_type', 'entityType']) || null,
    entity_id:
      getNumber(source, ['entity_id', 'entityId'], 0) > 0
        ? getNumber(source, ['entity_id', 'entityId'], 0)
        : null,
  };
};

export const normalizeCategory = (input: unknown): Category | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const name = getString(source, ['name']);
  if (!id || !name) {
    return null;
  }

  return { id, name };
};

export const normalizeTextErrorMessage = (value: string): string => {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return '';
  }

  const lowerValue = normalizedValue.toLowerCase();
  if (
    lowerValue.startsWith('<!doctype html') ||
    lowerValue.startsWith('<html') ||
    lowerValue.includes('<body') ||
    lowerValue.includes('<pre>')
  ) {
    return '';
  }

  return normalizedValue;
};

export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Error de comunicacion con el servidor',
): string => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    if (typeof responseData === 'string') {
      const normalizedMessage = normalizeTextErrorMessage(responseData);
      if (normalizedMessage) {
        return normalizedMessage;
      }
    }

    const payload = asRecord(responseData);
    if (payload) {
      const message = getString(payload, ['message', 'error', 'detail', 'title']);
      if (message) {
        return message;
      }
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};
