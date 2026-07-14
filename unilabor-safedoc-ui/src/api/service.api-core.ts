import type {
  CreateUserPayload,
  UpdateUserPayload,
  EmployeePayload,
  LoginRequest,
  LoginResponse,
  PageQuery,
  PageResult,
  UserAccess,
} from './service.shared';
import api from './axios';
import axios from 'axios';
import { API_BASE_URL } from './axios';
import { tokenRequiresPasswordChange } from '../utils/auth';
import type {
  Category,
  Employee,
  EmployeeSummary,
  ManagedUser,
  ModuleAccess,
  User,
} from '../types/models';
import {
  asRecord,
  getString,
  unwrapPayload,
  getArrayFromPayload,
  extractPagination,
  buildPageParams,
} from './service.shared';
import {
  normalizeUser,
  normalizeManagedUser,
  normalizeModuleAccess,
  normalizeEmployee,
  normalizeEmployeeSummary,
} from './service.normalizers';
import {
  extractUserFromPayload,
  normalizeCategory,
} from './service.parsers';

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

  const permissions = normalizePermissions(source);

  return {
    token,
    user,
    availableModules,
    permissions,
  };
};

// Normaliza el arreglo de permisos (codigos MODULO.RECURSO.ACCION) del backend.
const normalizePermissions = (source: Record<string, unknown>): string[] =>
  getArrayFromPayload(source, ['permissions'])
    .map((value) => String(value ?? '').trim().toUpperCase())
    .filter((code) => code.length > 0);

// GET /auth/me/access - refresca modulos + permisos sin re-login.
export const getMyAccess = async (): Promise<UserAccess> => {
  const response = await api.get('/auth/me/access');
  const source = asRecord(unwrapPayload(response.data)) ?? {};

  const availableModules = getArrayFromPayload(source, ['availableModules', 'available_modules'])
    .map(normalizeModuleAccess)
    .filter((moduleAccess): moduleAccess is ModuleAccess => moduleAccess !== null);

  return {
    availableModules,
    permissions: normalizePermissions(source),
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

export const listUsersPaginated = async (query: PageQuery = {}): Promise<PageResult<ManagedUser>> => {
  const response = await api.get('/users', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['users', 'items', 'results'])
    .map(normalizeManagedUser)
    .filter((user): user is ManagedUser => user !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
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

export const listEmployeesPaginated = async (query: PageQuery = {}): Promise<PageResult<Employee>> => {
  const response = await api.get('/employees', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['employees', 'items', 'results'])
    .map(normalizeEmployee)
    .filter((employee): employee is Employee => employee !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
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

