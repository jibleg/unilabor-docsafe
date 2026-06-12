import axios, { type AxiosError } from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = configuredApiBaseUrl && configuredApiBaseUrl.length > 0
  ? configuredApiBaseUrl
  : '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Este interceptor es VITAL para que todas las peticiones lleven el Token
api.interceptors.request.use((config) => {
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const { state } = JSON.parse(authStorage) as { state?: { token?: string } };
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    }
  } catch {
    // If storage is malformed we skip auth header and let backend reject request.
  }
  return config;
});

// Los endpoints de autenticacion pueden responder 401 por credenciales invalidas;
// ahi NO queremos cerrar sesion ni redirigir (el error se muestra en la pagina).
const isAuthEndpoint = (url?: string): boolean =>
  !!url && (url.includes('/auth/login') || url.includes('/auth/recover-password'));

/**
 * Manejo uniforme de sesion expirada / token invalido: ante un 401 (fuera de los
 * endpoints de auth) limpia la sesion y redirige a /login, evitando que el error
 * caiga por pagina en cada refetch.
 */
export const handleResponseError = (error: AxiosError): Promise<never> => {
  const status = error.response?.status;

  if (status === 401 && !isAuthEndpoint(error.config?.url)) {
    useAuthStore.getState().logout();

    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }

  return Promise.reject(error);
};

api.interceptors.response.use((response) => response, handleResponseError);

export default api;
