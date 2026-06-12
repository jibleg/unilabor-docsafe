import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// El middleware consulta el acceso por modulo via este service (que toca la BD);
// lo mockeamos para aislar la logica de autorizacion.
vi.mock('../services/module-access.service', () => ({
  listUserModuleAccess: vi.fn(),
}));

import { listUserModuleAccess } from '../services/module-access.service';
import { authorize, authorizeModuleAccess, authorizeModuleRole, verifyToken } from './auth.middleware';

const mockedListAccess = vi.mocked(listUserModuleAccess);

type ResMock = {
  statusCode?: number;
  body?: unknown;
  status: (code: number) => ResMock;
  json: (payload: unknown) => ResMock;
};

const buildRes = (): ResMock => {
  const res: ResMock = {
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const moduleAccess = (code: string, role: string) => ({
  code,
  name: code,
  description: null,
  icon: null,
  role,
  is_active: true,
  sort_order: 0,
});

beforeEach(() => {
  mockedListAccess.mockReset();
});

describe('verifyToken', () => {
  const secret = 'test-secret';
  const baseReq = () => ({ method: 'GET', originalUrl: '/api/documents', path: '/' });

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });

  it('responde 401 si no hay token', () => {
    const res = buildRes();
    const next = vi.fn();
    verifyToken({ headers: {}, ...baseReq() } as any, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 401 ante un token expirado (sesion invalida)', () => {
    const expired = jwt.sign({ id: 'u1', role: 'ADMIN', mustChangePassword: false }, secret, {
      expiresIn: '-1s',
    });
    const res = buildRes();
    const next = vi.fn();
    verifyToken({ headers: { authorization: `Bearer ${expired}` }, ...baseReq() } as any, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('llama next y setea req.user con un token valido', () => {
    const token = jwt.sign({ id: 'u1', role: 'ADMIN', mustChangePassword: false }, secret, {
      expiresIn: '8h',
    });
    const req: any = { headers: { authorization: `Bearer ${token}` }, ...baseReq() };
    const res = buildRes();
    const next = vi.fn();
    verifyToken(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: 'u1', role: 'ADMIN' });
  });

  it('responde 428 si el usuario debe cambiar su contrasena temporal', () => {
    const token = jwt.sign({ id: 'u1', role: 'VIEWER', mustChangePassword: true }, secret, {
      expiresIn: '8h',
    });
    const res = buildRes();
    const next = vi.fn();
    verifyToken({ headers: { authorization: `Bearer ${token}` }, ...baseReq() } as any, res as any, next);
    expect(res.statusCode).toBe(428);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authorize (rol global)', () => {
  it('llama next cuando el rol esta permitido', () => {
    const next = vi.fn();
    const res = buildRes();
    authorize(['ADMIN', 'EDITOR'])({ user: { role: 'ADMIN' } } as any, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it('responde 403 cuando el rol no esta permitido', () => {
    const next = vi.fn();
    const res = buildRes();
    authorize(['ADMIN'])({ user: { role: 'VIEWER' } } as any, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe('authorizeModuleAccess', () => {
  it('responde 401 sin usuario en la sesion', async () => {
    const next = vi.fn();
    const res = buildRes();
    await authorizeModuleAccess('HELPDESK')({} as any, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('llama next cuando el usuario tiene acceso al modulo', async () => {
    mockedListAccess.mockResolvedValue([moduleAccess('HELPDESK', 'VIEWER')] as any);
    const next = vi.fn();
    const res = buildRes();
    await authorizeModuleAccess('HELPDESK')({ user: { id: 'u1', role: 'VIEWER' } } as any, res as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('responde 403 cuando el modulo no esta entre los accesos', async () => {
    mockedListAccess.mockResolvedValue([moduleAccess('QUALITY', 'ADMIN')] as any);
    const next = vi.fn();
    const res = buildRes();
    await authorizeModuleAccess('HELPDESK')({ user: { id: 'u1', role: 'ADMIN' } } as any, res as any, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authorizeModuleRole', () => {
  it('llama next cuando el rol del modulo esta permitido', async () => {
    mockedListAccess.mockResolvedValue([moduleAccess('HELPDESK', 'ADMIN')] as any);
    const next = vi.fn();
    const res = buildRes();
    await authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR'])(
      { user: { id: 'u1', role: 'ADMIN' } } as any,
      res as any,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('responde 403 cuando el rol del modulo es insuficiente', async () => {
    mockedListAccess.mockResolvedValue([moduleAccess('HELPDESK', 'VIEWER')] as any);
    const next = vi.fn();
    const res = buildRes();
    await authorizeModuleRole('HELPDESK', ['ADMIN', 'EDITOR'])(
      { user: { id: 'u1', role: 'VIEWER' } } as any,
      res as any,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
