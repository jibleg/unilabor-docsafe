import axios from 'axios';
import api, { API_BASE_URL } from './axios';
import type {
  AuditLog,
  Category,
  Document,
  DocumentStatus,
  Employee,
  EmployeeSummary,
  LinkableUser,
  ManagedUser,
  ModuleAccess,
  ModuleCode,
  User,
} from '../types/models';
import { tokenRequiresPasswordChange } from '../utils/auth';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  availableModules: ModuleAccess[];
}

export interface CreateUserPayload {
  email: string;
  full_name: string;
  role: string;
  category_ids?: number[];
  module_codes?: ModuleCode[];
}

export interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  role?: string;
  module_codes?: ModuleCode[];
}

export interface EmployeePayload {
  employee_code?: string;
  user_id?: string | null;
  full_name: string;
  email: string;
  area?: string;
  position?: string;
}

export interface UpdateDocumentPayload {
  title: string;
  category_id: string | number;
  description?: string;
  publish_date?: string;
  expiry_date?: string;
  file?: File | null;
  status?: Exclude<DocumentStatus, 'superseded'>;
}

export interface ListDocumentsOptions {
  includeInactive?: boolean;
  category_id?: number | null;
  title?: string;
  description?: string;
  publish_date?: string;
  expiry_date?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const getString = (
  source: Record<string, unknown>,
  keys: string[],
  fallback = '',
): string => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
};

const getNumber = (
  source: Record<string, unknown>,
  keys: string[],
  fallback = 0,
): number => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
};

const getBoolean = (
  source: Record<string, unknown>,
  keys: string[],
  fallback = false,
): boolean => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
  }
  return fallback;
};

const getIdValue = (
  source: Record<string, unknown>,
  keys: string[],
): string | number | null => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

const unwrapPayload = (payload: unknown): unknown => {
  const record = asRecord(payload);
  if (!record) {
    return payload;
  }
  if ('data' in record && record.data !== undefined && record.data !== null) {
    return record.data;
  }
  return payload;
};

const getArrayFromPayload = (payload: unknown, keys: string[]): unknown[] => {
  const unwrapped = unwrapPayload(payload);
  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  const record = asRecord(unwrapped);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
};

const normalizeUser = (input: unknown): User => {
  const source = asRecord(input);
  if (!source) {
    throw new Error('Formato de usuario invalido');
  }

  return {
    id: String(source.id ?? ''),
    name: getString(source, ['name']),
    full_name: getString(source, ['full_name', 'fullName']),
    role: getString(source, ['role'], 'USER'),
    mustChangePassword: getBoolean(source, ['mustChangePassword', 'must_change_password']),
    email: getString(source, ['email']),
    avatar_path: getString(source, ['avatar_path', 'avatarPath']),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
  };
};

const normalizeManagedUser = (input: unknown): ManagedUser | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const rawId = source.id ?? source.user_id ?? source.uuid;
  const id =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? String(rawId)
      : typeof rawId === 'string' && rawId.trim().length > 0
        ? rawId.trim()
        : '';

  const email = getString(source, ['email']);
  const fullName = getString(source, ['full_name', 'fullName', 'name']);
  const role = getString(source, ['role']);

  if (!id || !email || !fullName || !role) {
    return null;
  }

  return {
    id,
    email,
    full_name: fullName,
    role,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    must_change_password: getBoolean(
      source,
      ['must_change_password', 'mustChangePassword'],
      false,
    ),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    modules: getArrayFromPayload(source, ['modules'])
      .map(normalizeModuleAccess)
      .filter((moduleAccess): moduleAccess is ModuleAccess => moduleAccess !== null),
  };
};

const normalizeModuleAccess = (input: unknown): ModuleAccess | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const code = getString(source, ['code']).toUpperCase();
  const role = getString(source, ['role']).toUpperCase();
  const name = getString(source, ['name']);

  if ((code !== 'QUALITY' && code !== 'RH') || !name || !role) {
    return null;
  }

  return {
    code,
    name,
    description: getString(source, ['description']) || null,
    icon: getString(source, ['icon']) || null,
    role,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    sort_order: getNumber(source, ['sort_order', 'sortOrder'], 0),
  };
};

const normalizeLinkableUser = (input: unknown): LinkableUser | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getString(source, ['id']);
  const email = getString(source, ['email']);
  const fullName = getString(source, ['full_name', 'fullName', 'name']);
  const role = getString(source, ['role']).toUpperCase();

  if (!id || !email || !fullName || !role) {
    return null;
  }

  return {
    id,
    email,
    full_name: fullName,
    role,
    modules: getArrayFromPayload(source, ['modules'])
      .map(normalizeModuleAccess)
      .filter((moduleAccess): moduleAccess is ModuleAccess => moduleAccess !== null),
  };
};

const normalizeEmployee = (input: unknown): Employee | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const id = getNumber(source, ['id']);
  const employeeCode = getString(source, ['employee_code', 'employeeCode']);
  const fullName = getString(source, ['full_name', 'fullName']);
  const email = getString(source, ['email']);

  if (!id || !employeeCode || !fullName || !email) {
    return null;
  }

  return {
    id,
    employee_code: employeeCode,
    user_id: getString(source, ['user_id', 'userId']) || null,
    full_name: fullName,
    email,
    area: getString(source, ['area']) || null,
    position: getString(source, ['position']) || null,
    is_active: getBoolean(source, ['is_active', 'isActive'], true),
    created_at: getString(source, ['created_at', 'createdAt']),
    updated_at: getString(source, ['updated_at', 'updatedAt']),
    linked_user: normalizeLinkableUser(source.linked_user ?? source.linkedUser),
  };
};

const normalizeEmployeeSummary = (input: unknown): EmployeeSummary => {
  const source = asRecord(input);
  if (!source) {
    return {
      total: 0,
      active: 0,
      linked_users: 0,
      unlinked_users: 0,
    };
  }

  return {
    total: getNumber(source, ['total']),
    active: getNumber(source, ['active']),
    linked_users: getNumber(source, ['linked_users', 'linkedUsers']),
    unlinked_users: getNumber(source, ['unlinked_users', 'unlinkedUsers']),
  };
};

const extractUserFromPayload = (payload: unknown): User => {
  const unwrapped = unwrapPayload(payload);
  const source = asRecord(unwrapped);

  if (!source) {
    throw new Error('Formato de usuario invalido');
  }

  const userInput = source.user ?? source.profile ?? unwrapped;
  return normalizeUser(userInput);
};

const normalizeDocument = (input: unknown): Document | null => {
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

const normalizeAuditLog = (input: unknown): AuditLog | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const accessedAt = getString(source, ['accessed_at', 'accessedAt', 'created_at']);
  const action = getString(source, ['action']);
  const ipAddress = getString(source, ['ip_address', 'ipAddress']);

  if (!accessedAt || !action || !ipAddress) {
    return null;
  }

  const documentValue = source.document;
  return {
    accessed_at: accessedAt,
    full_name: getString(source, ['full_name', 'fullName', 'name'], 'Sin nombre'),
    email: getString(source, ['email'], 'sin-correo@local'),
    document: typeof documentValue === 'string' ? documentValue : null,
    action,
    ip_address: ipAddress,
  };
};

const normalizeCategory = (input: unknown): Category | null => {
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

const normalizeTextErrorMessage = (value: string): string => {
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

export const login = async (payload: LoginRequest): Promise<LoginResponse> => {
  const response = await api.post('/auth/login', payload);
  const body = unwrapPayload(response.data);
  const source = asRecord(body);

  if (!source) {
    throw new Error('Respuesta de login invalida');
  }

  const token = getString(source, ['token', 'access_token']);
  const userInput = source.user ?? source.account ?? source.profile;

  if (!token || userInput === undefined) {
    throw new Error('Login incompleto en respuesta del backend');
  }

  const user = normalizeUser(userInput);
  if (tokenRequiresPasswordChange(token) && !user.mustChangePassword) {
    user.mustChangePassword = true;
  }

  const availableModules = getArrayFromPayload(source, ['availableModules', 'available_modules'])
    .map(normalizeModuleAccess)
    .filter((moduleAccess): moduleAccess is ModuleAccess => moduleAccess !== null);

  return {
    token,
    user,
    availableModules,
  };
};

export const changePassword = async (newPassword: string): Promise<unknown> => {
  const response = await api.patch('/users/change-password', { newPassword });
  return unwrapPayload(response.data);
};

export const requestTemporaryPasswordByEmail = async (email: string): Promise<unknown> => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('El correo es obligatorio');
  }

  const publicApi = axios.create({
    baseURL: API_BASE_URL,
  });
  const response = await publicApi.post('/auth/recover-password', {
    email: normalizedEmail,
  });

  return unwrapPayload(response.data);
};

export const getCurrentUserProfile = async (): Promise<User> => {
  const response = await api.get('/users/me');
  return extractUserFromPayload(response.data);
};

export const uploadMyAvatar = async (avatarFile: File): Promise<User> => {
  const formData = new FormData();
  formData.append('avatar', avatarFile);

  const response = await api.patch('/users/me/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return extractUserFromPayload(response.data);
};

export const getMyAvatarBlob = async (): Promise<Blob> => {
  const response = await api.get('/users/me/avatar', {
    responseType: 'blob',
  });

  return response.data as Blob;
};

export const deleteMyAvatar = async (): Promise<void> => {
  await api.delete('/users/me/avatar');
};

export const listUsers = async (): Promise<ManagedUser[]> => {
  const response = await api.get('/users');
  return getArrayFromPayload(response.data, ['users', 'items', 'results'])
    .map(normalizeManagedUser)
    .filter((user): user is ManagedUser => user !== null);
};

export const createUser = async (payload: CreateUserPayload): Promise<ManagedUser> => {
  const response = await api.post('/users', payload);
  const parsed =
    normalizeManagedUser(unwrapPayload(response.data)) ??
    normalizeManagedUser(asRecord(unwrapPayload(response.data))?.user);

  if (parsed) {
    return parsed;
  }

  return {
    id: '',
    email: payload.email.trim(),
    full_name: payload.full_name.trim(),
    role: payload.role.trim().toUpperCase(),
    is_active: true,
    must_change_password: true,
  };
};

export const fetchModuleCatalog = async (): Promise<ModuleAccess[]> => {
  const response = await api.get('/users/modules/catalog');
  return getArrayFromPayload(response.data, ['modules', 'items', 'results'])
    .map(normalizeModuleAccess)
    .filter((moduleAccess): moduleAccess is ModuleAccess => moduleAccess !== null);
};

export const updateUserById = async (
  userId: string,
  payload: UpdateUserPayload,
): Promise<ManagedUser | null> => {
  const encodedId = encodeURIComponent(userId);
  const response = await api.patch(`/users/${encodedId}`, payload);

  const unwrapped = unwrapPayload(response.data);
  return normalizeManagedUser(unwrapped) ?? normalizeManagedUser(asRecord(unwrapped)?.user);
};

export const deleteUserById = async (userId: string): Promise<void> => {
  const encodedId = encodeURIComponent(userId);
  await api.delete(`/users/${encodedId}`);
};

export const fetchUserCategories = async (userId: string): Promise<Category[]> => {
  const encodedId = encodeURIComponent(userId);
  const response = await api.get(`/users/${encodedId}/categories`);

  return getArrayFromPayload(response.data, ['categories', 'items', 'results'])
    .map(normalizeCategory)
    .filter((category): category is Category => category !== null);
};

export const updateUserCategories = async (
  userId: string,
  categoryIds: number[],
): Promise<void> => {
  const encodedId = encodeURIComponent(userId);
  const normalizedCategoryIds = [...new Set(categoryIds)]
    .map((categoryId) => Number(categoryId))
    .filter((categoryId) => Number.isFinite(categoryId) && categoryId > 0);

  await api.put(`/users/${encodedId}/categories`, {
    categoryIds: normalizedCategoryIds,
  });
};

export const resetUserPassword = async (userId: string): Promise<void> => {
  const encodedId = encodeURIComponent(userId);
  await api.patch(`/users/${encodedId}/reset-password`);
};

export const listEmployees = async (): Promise<Employee[]> => {
  const response = await api.get('/employees');
  return getArrayFromPayload(response.data, ['employees', 'items', 'results'])
    .map(normalizeEmployee)
    .filter((employee): employee is Employee => employee !== null);
};

export const getEmployeeSummary = async (): Promise<EmployeeSummary> => {
  const response = await api.get('/employees/summary');
  const payload = unwrapPayload(response.data);
  return normalizeEmployeeSummary(asRecord(payload)?.summary ?? payload);
};

export const fetchEmployeeById = async (employeeId: number): Promise<Employee | null> => {
  const response = await api.get(`/employees/${employeeId}`);
  const payload = unwrapPayload(response.data);
  return normalizeEmployee(asRecord(payload)?.employee ?? payload);
};

export const createEmployee = async (payload: EmployeePayload): Promise<Employee> => {
  const response = await api.post('/employees', payload);
  const parsed = normalizeEmployee(asRecord(unwrapPayload(response.data))?.employee ?? unwrapPayload(response.data));
  if (!parsed) {
    throw new Error('No se pudo interpretar el colaborador creado');
  }
  return parsed;
};

export const updateEmployeeById = async (employeeId: number, payload: Partial<EmployeePayload>): Promise<Employee | null> => {
  const response = await api.patch(`/employees/${employeeId}`, payload);
  const parsed = normalizeEmployee(asRecord(unwrapPayload(response.data))?.employee ?? unwrapPayload(response.data));
  return parsed;
};

export const deleteEmployeeById = async (employeeId: number): Promise<void> => {
  await api.delete(`/employees/${employeeId}`);
};

export const listLinkableUsers = async (): Promise<LinkableUser[]> => {
  const response = await api.get('/employees/linkable-users');
  return getArrayFromPayload(response.data, ['users', 'items', 'results'])
    .map(normalizeLinkableUser)
    .filter((user): user is LinkableUser => user !== null);
};

const createDocumentListParams = (options: ListDocumentsOptions) => {
  const params: Record<string, string | number | boolean> = {};

  if (options.includeInactive) {
    params.includeInactive = true;
  }

  if (typeof options.category_id === 'number' && Number.isFinite(options.category_id) && options.category_id > 0) {
    params.category_id = options.category_id;
  }

  const normalizedTitle = options.title?.trim();
  if (normalizedTitle) {
    params.title = normalizedTitle;
  }

  const normalizedDescription = options.description?.trim();
  if (normalizedDescription) {
    params.description = normalizedDescription;
  }

  const normalizedPublishDate = options.publish_date?.trim();
  if (normalizedPublishDate) {
    params.publish_date = normalizedPublishDate;
  }

  const normalizedExpiryDate = options.expiry_date?.trim();
  if (normalizedExpiryDate) {
    params.expiry_date = normalizedExpiryDate;
  }

  return Object.keys(params).length > 0 ? params : undefined;
};

const hasDocumentSearchFilters = (options: ListDocumentsOptions): boolean =>
  Boolean(
    (typeof options.category_id === 'number' &&
      Number.isFinite(options.category_id) &&
      options.category_id > 0) ||
      options.title?.trim() ||
      options.description?.trim() ||
      options.publish_date?.trim() ||
      options.expiry_date?.trim(),
  );

export const listDocuments = async (options: ListDocumentsOptions = {}): Promise<Document[]> => {
  const shouldUseSearchEndpoint = hasDocumentSearchFilters(options);
  const params = createDocumentListParams(options);
  const response = await api.get(shouldUseSearchEndpoint ? '/documents/search' : '/documents', {
    params,
  });

  return getArrayFromPayload(response.data, ['documents', 'items', 'results'])
    .map(normalizeDocument)
    .filter((doc): doc is Document => doc !== null);
};

export const deleteDocumentById = async (
  documentId: string | number,
): Promise<void> => {
  const encodedId = encodeURIComponent(String(documentId));
  await api.delete(`/documents/${encodedId}`);
};

const createDocumentMutationPayload = (payload: UpdateDocumentPayload) => {
  const normalizedTitle = payload.title.trim();
  const normalizedCategoryId = Number(String(payload.category_id).trim());
  const normalizedDescription = payload.description?.trim() ?? '';
  const normalizedPublishDate = payload.publish_date?.trim() ?? '';
  const normalizedExpiryDate = payload.expiry_date?.trim() ?? '';
  const normalizedStatus = payload.status?.trim() ?? '';

  const jsonPayload: Record<string, string | number | null> = {
    description: normalizedDescription,
    expiry_date: normalizedExpiryDate || null,
  };

  if (normalizedTitle) {
    jsonPayload.title = normalizedTitle;
  }

  if (Number.isFinite(normalizedCategoryId) && normalizedCategoryId > 0) {
    jsonPayload.category_id = normalizedCategoryId;
  }

  if (normalizedPublishDate) {
    jsonPayload.publish_date = normalizedPublishDate;
  }

  if (normalizedStatus === 'active' || normalizedStatus === 'inactive') {
    jsonPayload.status = normalizedStatus;
  }

  const formData = new FormData();

  if (normalizedTitle) {
    formData.append('title', normalizedTitle);
  }

  if (Number.isFinite(normalizedCategoryId) && normalizedCategoryId > 0) {
    formData.append('category_id', String(normalizedCategoryId));
  }

  formData.append('description', normalizedDescription);

  if (normalizedPublishDate) {
    formData.append('publish_date', normalizedPublishDate);
  }

  formData.append('expiry_date', normalizedExpiryDate || 'null');

  if (payload.file) {
    formData.append('file', payload.file);
  }

  return {
    jsonPayload,
    formData,
  };
};

export const updateDocumentById = async (
  documentId: string | number,
  payload: UpdateDocumentPayload,
): Promise<unknown> => {
  const encodedId = encodeURIComponent(String(documentId));
  const { jsonPayload, formData } = createDocumentMutationPayload(payload);
  const hasReplacementFile = Boolean(payload.file);

  const response = hasReplacementFile
    ? await api.patch(`/documents/${encodedId}/replace`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    : await api.patch(`/documents/${encodedId}`, jsonPayload);

  return unwrapPayload(response.data);
};

export const updateDocumentStatusById = async (
  documentId: string | number,
  status: Exclude<DocumentStatus, 'superseded'>,
): Promise<unknown> => {
  const encodedId = encodeURIComponent(String(documentId));
  const response = await api.patch(`/documents/status/${encodedId}`, { status });
  return unwrapPayload(response.data);
};

export const listAuditLogs = async (): Promise<AuditLog[]> => {
  const response = await api.get('/audit/logs');
  return getArrayFromPayload(response.data, ['logs', 'items', 'results'])
    .map(normalizeAuditLog)
    .filter((log): log is AuditLog => log !== null);
};

export const fetchCategories = async (token?: string): Promise<Category[]> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const requestConfig = {
    ...(token ? { headers } : {}),
    params: {
      page: 1,
      limit: 1000,
    },
  };

  const response = await api.get('/categories', requestConfig);

  return getArrayFromPayload(response.data, ['categories', 'items', 'results'])
    .map(normalizeCategory)
    .filter((category): category is Category => category !== null);
};

export const fetchDocumentCategories = async (token?: string): Promise<Category[]> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const requestConfig = token ? { headers } : undefined;
  const response = await api.get('/documents/categories', requestConfig);

  return getArrayFromPayload(response.data, ['categories', 'items', 'results'])
    .map(normalizeCategory)
    .filter((category): category is Category => category !== null);
};

export const updateCategory = async (
  categoryId: number,
  name: string,
): Promise<Category> => {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('El nombre de la categoria es obligatorio');
  }

  const response = await api.patch(`/categories/${categoryId}`, { name: normalizedName });

  const parsed = normalizeCategory(unwrapPayload(response.data));
  return parsed ?? { id: categoryId, name: normalizedName };
};

export const createCategory = async (name: string): Promise<void> => {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('El nombre de la categoria es obligatorio');
  }

  await api.post('/categories', { name: normalizedName });
};

export const deleteCategoryById = async (categoryId: number): Promise<void> => {
  await api.delete(`/categories/${categoryId}`);
};

export const uploadDocumentWithMetadata = async (
  formData: FormData,
  token?: string,
): Promise<unknown> => {
  const headers: Record<string, string> = {
    'Content-Type': 'multipart/form-data',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await api.post('/documents/upload', formData, { headers });
  return unwrapPayload(response.data);
};
