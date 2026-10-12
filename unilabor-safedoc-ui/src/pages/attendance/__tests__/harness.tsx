/* eslint-disable react-refresh/only-export-components */
import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { act, render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../../../store/useAuthStore';

// Harness compartido de las pruebas de humo e interaccion de Control de Asistencias.
// Reemplaza `src/api/axios` por un enrutador en memoria que responde con fixtures
// capturados del backend local (src/test/fixtures/attendance) o con escenarios sinteticos.

const fixtureModules = import.meta.glob('../../../test/fixtures/attendance/*.json', { eager: true, import: 'default' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fx = <T = Record<string, any>>(name: string): T => {
  const key = Object.keys(fixtureModules).find((k) => k.endsWith(`/${name}.json`));
  if (!key) throw new Error(`Fixture inexistente: ${name}`);
  return structuredClone(fixtureModules[key]) as T;
};

export const ATTENDANCE_ALL = [
  'ATTENDANCE.RECORDS.READ',
  'ATTENDANCE.SCHEDULES.WRITE',
  'ATTENDANCE.INCIDENTS.AUTHORIZE',
  'ATTENDANCE.DEVICES.MANAGE',
  'ATTENDANCE.SETTINGS.MANAGE',
];
export const ATTENDANCE_READONLY = ['ATTENDANCE.RECORDS.READ'];

export interface MockCall { method: string; url: string; params?: Record<string, unknown>; data?: unknown }
export type Handler = (call: MockCall) => unknown | Promise<unknown>;

export const httpError = (status: number, body: Record<string, unknown> = { message: 'Error de prueba' }): AxiosError => {
  const config = { headers: {} } as never;
  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', config, null, {
    status, statusText: String(status), data: body, headers: {}, config,
  });
};
export const networkError = (): AxiosError => new AxiosError('Network Error', 'ERR_NETWORK');

interface Route { method: string; test: RegExp; handler: Handler }
let routes: Route[] = [];
export const calls: MockCall[] = [];

/** Registra (o reemplaza con prioridad) una respuesta. `test` se compara contra la URL sin query. */
export const respond = (method: string, test: RegExp | string, handler: Handler | unknown) => {
  const re = typeof test === 'string' ? new RegExp(`^${test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : test;
  routes.unshift({ method: method.toUpperCase(), test: re, handler: typeof handler === 'function' ? (handler as Handler) : () => handler });
};
export const callsTo = (method: string, test: RegExp | string): MockCall[] =>
  calls.filter((c) => c.method === method.toUpperCase() && (typeof test === 'string' ? c.url === test : test.test(c.url)));

const dispatch = async (method: string, url: string, config: AxiosRequestConfig = {}, data?: unknown) => {
  const call: MockCall = { method: method.toUpperCase(), url, params: config.params as Record<string, unknown> | undefined, data };
  calls.push(call);
  const route = routes.find((r) => r.method === call.method && r.test.test(url));
  if (!route) throw httpError(404, { message: `Sin mock para ${call.method} ${url}` });
  const result = await route.handler(call);
  const headers = config.responseType === 'blob' ? { 'content-disposition': '' } : {};
  return { data: result, status: 200, headers, config };
};

export const apiMock = {
  get: vi.fn((url: string, config?: AxiosRequestConfig) => dispatch('GET', url, config)),
  post: vi.fn((url: string, data?: unknown, config?: AxiosRequestConfig) => dispatch('POST', url, config, data)),
  put: vi.fn((url: string, data?: unknown, config?: AxiosRequestConfig) => dispatch('PUT', url, config, data)),
  patch: vi.fn((url: string, data?: unknown, config?: AxiosRequestConfig) => dispatch('PATCH', url, config, data)),
  delete: vi.fn((url: string, config?: AxiosRequestConfig) => dispatch('DELETE', url, config)),
};
/** Factory para `vi.mock('../../../api/axios', ...)`. */
export const axiosModule = () => ({ default: apiMock, API_BASE_URL: '/api', handleResponseError: vi.fn() });

// Rutas de lectura comunes con fixtures reales.
const registerDefaults = () => {
  routes = [];
  const gets: Array<[RegExp, string | ((c: MockCall) => unknown)]> = [
    [/^\/attendance\/branches$/, 'branches'],
    [/^\/attendance\/board\/live$/, 'board-live'],
    [/^\/attendance\/board\/commitment$/, (c) => (c.params?.employee_id ? fx('board-commitment-employee') : fx(`board-commitment-${String(c.params?.period ?? 'month') === 'custom' ? 'month' : (c.params?.period ?? 'month')}`))],
    [/^\/attendance\/days$/, (c) => (c.params?.employee_id ? fx('days-employee') : fx('days'))],
    [/^\/attendance\/punches$/, (c) => (c.params?.review_status === 'pending' ? fx('punches-pending') : fx('punches'))],
    [/^\/attendance\/schedule$/, 'schedule'],
    [/^\/attendance\/schedule\/log$/, 'schedule-log'],
    [/^\/attendance\/schedule\/employee\/\d+$/, 'schedule-employee'],
    [/^\/attendance\/shifts$/, 'shifts'],
    [/^\/attendance\/incidents$/, 'incidents'],
    [/^\/attendance\/incidents\/\d+$/, 'incident-detail'],
    [/^\/attendance\/employees$/, 'employees'],
    [/^\/attendance\/employees\/summary$/, 'employees-summary'],
    [/^\/attendance\/employees\/\d+$/, 'employee-detail'],
    [/^\/attendance\/vacations\/employees\/\d+$/, 'vacations-employee'],
    [/^\/attendance\/devices\/overview$/, 'devices-overview'],
    [/^\/attendance\/devices\/orders$/, 'devices-orders'],
    [/^\/attendance\/settings$/, 'settings'],
    [/^\/attendance\/settings\/changes$/, 'settings-changes'],
    [/^\/attendance\/holidays$/, 'holidays'],
    [/^\/attendance\/incident-types$/, (c) => fx(c.params?.include_inactive ? 'incident-types-all' : 'incident-types')],
    [/^\/attendance\/vacation-policy$/, 'vacation-policy'],
  ];
  for (const [re, h] of gets) respond('GET', re, typeof h === 'string' ? () => fx(h) : h);
};

/** Escenarios sinteticos: toda lectura falla o llega vacia. */
export const failAllReads = (error: () => unknown) => {
  routes.unshift({ method: 'GET', test: /.*/, handler: () => { throw error(); } });
};
export const emptyAll = (overrides: Record<string, unknown>) => {
  for (const [re, body] of Object.entries(overrides)) respond('GET', new RegExp(re), () => structuredClone(body));
};
export const pending = () => new Promise<never>(() => undefined);

const PAGE = { page: 1, limit: 20, total: 0, totalPages: 0 };
export const emptyBodies: Record<string, unknown> = {
  '^/attendance/board/live$': { ...fx<object>('board-live'), kpis: { expected: 0, present: 0, late: 0, missing: 0, incident: 0, pending_review: 0 }, by_status: [], people: [], devices: [], month_ranking: [], absences_next_7_days: { total: 0, items: [] }, alerts: { without_schedule: 0, without_device_number: 0, pending_sync: 0 } },
  '^/attendance/days$': { data: [], pagination: PAGE, summary: fx<{ summary: unknown }>('days').summary, range: fx<{ range: unknown }>('days').range },
  '^/attendance/punches$': { data: [], pagination: PAGE, range: fx<{ range: unknown }>('punches').range },
  '^/attendance/schedule$': { ...fx<object>('schedule'), data: [], pagination: PAGE },
  '^/attendance/schedule/log$': { data: [], pagination: PAGE },
  '^/attendance/shifts$': { shifts: [] },
  '^/attendance/incidents$': { data: [], pagination: PAGE },
  '^/attendance/employees$': { data: [], pagination: PAGE },
  '^/attendance/devices/overview$': { agent_offline_min: 15, branches: [] },
  '^/attendance/devices/orders$': { orders: [], total: 0, page: 1, limit: 20 },
  '^/attendance/holidays$': { holidays: [] },
  '^/attendance/settings/changes$': { changes: [] },
};

export const setAuth = (permissions: string[]) => {
  useAuthStore.setState({
    token: 'tok',
    user: { id: 'u1', name: 'Admin Prueba', email: 'admin@example.com', role: 'ADMIN', mustChangePassword: false } as never,
    availableModules: [{ code: 'ATTENDANCE', name: 'Control de asistencias', description: null, icon: null, role: 'ADMIN', is_active: true, sort_order: 1 } as never],
    permissions,
    activeModule: 'ATTENDANCE',
  });
};

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

/** Instala los hooks comunes: rutas por defecto, auth completo y vigilancia de console.error/warn. */
export const installHarness = (options: { ignoreWarnings?: RegExp[] } = {}) => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    registerDefaults();
    setAuth(ATTENDANCE_ALL);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.open = vi.fn() as never;
  });
  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    const noisy = [...errorSpy.mock.calls, ...warnSpy.mock.calls].map((a) => a.map(String).join(' '));
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    vi.useRealTimers();
    // Cualquier warning de React (act, keys, hooks, propiedades invalidas) rompe la prueba.
    const ignore = options.ignoreWarnings ?? [];
    expect(noisy.filter((m) => /act\(|key|Warning|hook|Each child|unique|Invalid|not wrapped|Cannot update/i.test(m) && !ignore.some((re) => re.test(m)))).toEqual([]);
  });
};

export const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
};

export const renderPage = async (ui: ReactElement, path: string, routePath?: string): Promise<RenderResult> => {
  let view!: RenderResult;
  await act(async () => {
    view = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath ?? path.split('?')[0]} element={ui} />
          <Route path="*" element={<div>otra-ruta</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
  });
  return view;
};

/** Falla si el DOM muestra valores rotos tipicos. */
export const expectNoBrokenText = (container: HTMLElement = document.body) => {
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/undefined|NaN|\[object Object\]|null(?![a-zA-Zñ])/);
};

/** Factory para `vi.mock('../../../utils/notify', ...)`: permite verificar avisos sin ToastContainer. */
export const notifyModule = () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
  notifyInfo: vi.fn(),
});
