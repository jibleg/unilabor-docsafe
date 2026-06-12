import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../config/db', () => ({
  default: { query: vi.fn() },
}));
vi.mock('bcrypt', () => ({
  default: { compare: vi.fn() },
}));
vi.mock('../services/module-access.service', () => ({
  listUserModuleAccess: vi.fn(),
}));

import pool from '../config/db';
import bcrypt from 'bcrypt';
import { listUserModuleAccess } from '../services/module-access.service';
import { login } from './auth.controller';

const mockedQuery = vi.mocked(pool.query);
const mockedCompare = vi.mocked(bcrypt.compare);
const mockedModules = vi.mocked(listUserModuleAccess);

const buildRes = () => {
  const res: any = {
    statusCode: undefined,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret';
  mockedQuery.mockReset();
  mockedCompare.mockReset();
  mockedModules.mockReset();
});

describe('login', () => {
  // La validacion de presencia de credenciales se cubre en validate.middleware
  // + auth.schema (ver validate.middleware.test.ts); aqui se prueba la logica
  // del controller asumiendo entrada ya validada.

  it('responde 401 si el usuario no existe', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] } as any);
    const res = buildRes();
    await login({ body: { email: 'x@y.z', password: 'p' } } as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('responde 401 si la contrasena es invalida', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'u1', password_hash: 'h', role: 'ADMIN' }] } as any);
    mockedCompare.mockResolvedValueOnce(false as any);
    const res = buildRes();
    await login({ body: { email: 'x@y.z', password: 'bad' } } as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('emite un JWT valido con los claims del usuario en login exitoso', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            full_name: 'Admin Test',
            email: 'admin@test.mx',
            password_hash: 'hash',
            role: 'ADMIN',
            must_change_password: false,
          },
        ],
      } as any)
      .mockResolvedValueOnce({ rows: [] } as any); // logAuthAudit insert
    mockedCompare.mockResolvedValueOnce(true as any);
    mockedModules.mockResolvedValueOnce([
      { code: 'HELPDESK', name: 'Mesa de Ayuda', description: null, icon: null, role: 'ADMIN', is_active: true, sort_order: 30 },
    ] as any);

    const res = buildRes();
    await login({ body: { email: 'admin@test.mx', password: 'good' }, ip: '127.0.0.1' } as any, res);

    expect(res.body.message).toBe('Ingreso exitoso');
    expect(res.body.user).toMatchObject({ id: 'user-123', role: 'ADMIN', mustChangePassword: false });
    expect(res.body.availableModules).toHaveLength(1);

    const decoded = jwt.verify(res.body.token, 'test-secret') as any;
    expect(decoded).toMatchObject({ id: 'user-123', role: 'ADMIN', mustChangePassword: false });
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });
});
