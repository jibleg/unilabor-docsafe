import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosError } from 'axios';
import { handleResponseError } from './axios';
import { useAuthStore } from '../store/useAuthStore';

const buildError = (status: number | undefined, url: string): AxiosError =>
  ({ response: status ? { status } : undefined, config: { url } }) as AxiosError;

let assignMock: ReturnType<typeof vi.fn>;
let logoutSpy: ReturnType<typeof vi.fn>;
let originalLocation: Location;

beforeEach(() => {
  assignMock = vi.fn();
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/quality/dashboard', assign: assignMock },
  });
  // noop para que logout no muta el store (evita que Zustand reemplace el objeto
  // de estado y propague el spy entre pruebas).
  logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout').mockImplementation(() => {}) as never;
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  vi.restoreAllMocks();
});

describe('handleResponseError (interceptor 401)', () => {
  it('ante 401 fuera de auth: cierra sesion y redirige a /login', async () => {
    const error = buildError(401, '/documents');
    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(logoutSpy).toHaveBeenCalledOnce();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it('ante 401 en /auth/login: NO cierra sesion ni redirige', async () => {
    const error = buildError(401, '/auth/login');
    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('ante errores no-401: no toca la sesion', async () => {
    const error = buildError(500, '/documents');
    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });
});
