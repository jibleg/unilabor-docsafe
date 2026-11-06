import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getXlabDbConfig } from '../config/env';
import { xlabQuery, XlabUnavailableError } from '../config/xlab-db';
import { listMyNotifications, markMyNotificationRead } from '../services/my-notifications.service';

vi.mock('../middlewares/auth.middleware', () => ({
  verifyToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-sesion', role: 'VIEWER', mustChangePassword: false };
    next();
  },
}));

vi.mock('../services/my-notifications.service', () => ({
  listMyNotifications: vi.fn(async () => ({ linked: true, available: true, rows: [], total: 0, unread: 0 })),
  countMyUnreadNotifications: vi.fn(async () => 3),
  markMyNotificationRead: vi.fn(async () => true),
  markAllMyNotificationsRead: vi.fn(async () => 0),
}));

const { default: routes } = await import('./my-notifications.routes');

const ID = '3f2b8a6e-2d4c-4b1a-9e77-0a1b2c3d4e5f';
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/my/notifications', routes);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/my/notifications`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/api/my/notifications', () => {
  it('la identidad sale de la sesion aunque el cliente mande otra clave', async () => {
    await fetch(`${baseUrl}?cve_usuario=999&user_id=otro&limit=5`);
    expect(listMyNotifications).toHaveBeenCalledWith('user-sesion', 5, 0);
    await fetch(`${baseUrl}/${ID}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cve_usuario: 999 }),
    });
    expect(markMyNotificationRead).toHaveBeenCalledWith('user-sesion', ID);
  });

  it('acota el limite', async () => {
    await fetch(`${baseUrl}?limit=100000&offset=-3`);
    expect(listMyNotifications).toHaveBeenCalledWith('user-sesion', 100, 0);
  });

  it('expone el contador', async () => {
    expect(await (await fetch(`${baseUrl}/count`)).json()).toEqual({ count: 3 });
  });

  it('rechaza ids que no son uuid sin llegar a la consulta', async () => {
    expect((await fetch(`${baseUrl}/1%20OR%201=1/read`, { method: 'POST' })).status).toBe(400);
    expect(markMyNotificationRead).not.toHaveBeenCalled();
  });

  it('404 si no es suya o no existe', async () => {
    vi.mocked(markMyNotificationRead).mockResolvedValueOnce(false);
    expect((await fetch(`${baseUrl}/${ID}/read`, { method: 'POST' })).status).toBe(404);
  });

  it('503 al marcar con xlab caido', async () => {
    vi.mocked(markMyNotificationRead).mockRejectedValueOnce(new XlabUnavailableError());
    expect((await fetch(`${baseUrl}/${ID}/read`, { method: 'POST' })).status).toBe(503);
  });
});

describe('pool de xlab', () => {
  it('sin configuracion responde "no disponible" en vez de intentar conectar', async () => {
    delete process.env.XLAB_DB_HOST;
    expect(getXlabDbConfig()).toBeNull();
    await expect(xlabQuery('SELECT 1')).rejects.toBeInstanceOf(XlabUnavailableError);
  });

  it('un servidor que no responde se reporta como "no disponible"', async () => {
    process.env.XLAB_DB_HOST = '127.0.0.1';
    process.env.XLAB_DB_PORT = '1';
    process.env.XLAB_DB_NAME = 'xlab';
    process.env.XLAB_DB_USER = 'nadie';
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(xlabQuery('SELECT 1')).rejects.toBeInstanceOf(XlabUnavailableError);
    errorLog.mockRestore();
    delete process.env.XLAB_DB_HOST;
    delete process.env.XLAB_DB_PORT;
    delete process.env.XLAB_DB_NAME;
    delete process.env.XLAB_DB_USER;
  });
});

describe('getXlabDbConfig', () => {
  it('SSL apagado por defecto; encendido valida el certificado salvo que se indique', () => {
    process.env.XLAB_DB_HOST = 'h';
    process.env.XLAB_DB_NAME = 'xlab';
    process.env.XLAB_DB_USER = 'u';
    expect(getXlabDbConfig()).toMatchObject({ port: 5432, ssl: false });
    process.env.XLAB_DB_SSL = 'true';
    expect(getXlabDbConfig()?.ssl).toEqual({ rejectUnauthorized: true });
    process.env.XLAB_DB_SSL_REJECT_UNAUTHORIZED = 'false';
    expect(getXlabDbConfig()?.ssl).toEqual({ rejectUnauthorized: false });
    for (const key of ['XLAB_DB_HOST', 'XLAB_DB_NAME', 'XLAB_DB_USER', 'XLAB_DB_SSL', 'XLAB_DB_SSL_REJECT_UNAUTHORIZED']) {
      delete process.env[key];
    }
  });
});
