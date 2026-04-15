import axios from 'axios';

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

export default api;
