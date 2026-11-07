import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// requirePermission consulta los permisos efectivos via este service (que toca
// la BD); lo mockeamos para aislar la logica de autorizacion.
vi.mock('../services/permission.service', () => ({
  getUserPermissionCodes: vi.fn(),
  isUserActive: vi.fn(),
}));

import { getUserPermissionCodes, isUserActive } from '../services/permission.service';
import { requirePermission, verifyToken } from './auth.middleware';

const mockedGetPermissions = vi.mocked(getUserPermissionCodes);
const mockedIsUserActive = vi.mocked(isUserActive);

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

beforeEach(() => {
  mockedGetPermissions.mockReset();
  mockedIsUserActive.mockReset();
  mockedIsUserActive.mockResolvedValue(true);
});

describe('verifyToken', () => {
  const secret = 'test-secret';
  const baseReq = () => ({ method: 'GET', originalUrl: '/api/documents', path: '/' });

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });

  it('responde 401 si no hay token', async () => {
    const res = buildRes();
    const next = vi.fn();
    await verifyToken({ headers: {}, ...baseReq() } as any, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 401 ante un token expirado (sesion invalida)', async () => {
    const expired = jwt.sign({ id: 'u1', role: 'ADMIN', mustChangePassword: false }, secret, {
      expiresIn: '-1s',
    });
    const res = buildRes();
    const next = vi.fn();
    await verifyToken({ headers: { authorization: `Bearer ${expired}` }, ...baseReq() } as any, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('llama next y setea req.user con un token valido', async () => {
    const token = jwt.sign({ id: 'u1', role: 'ADMIN', mustChangePassword: false }, secret, {
      expiresIn: '8h',
    });
    const req: any = { headers: { authorization: `Bearer ${token}` }, ...baseReq() };
    const res = buildRes();
    const next = vi.fn();
    await verifyToken(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: 'u1', role: 'ADMIN' });
  });

  it('responde 428 si el usuario debe cambiar su contrasena temporal', async () => {
    const token = jwt.sign({ id: 'u1', role: 'VIEWER', mustChangePassword: true }, secret, {
      expiresIn: '8h',
    });
    const res = buildRes();
    const next = vi.fn();
    await verifyToken({ headers: { authorization: `Bearer ${token}` }, ...baseReq() } as any, res as any, next);
    expect(res.statusCode).toBe(428);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 401 si la cuenta se desactivo aunque el token siga vigente', async () => {
    mockedIsUserActive.mockResolvedValue(false);
    const token = jwt.sign({ id: 'u1', role: 'VIEWER', mustChangePassword: false }, secret, { expiresIn: '8h' });
    const req: any = { headers: { authorization: `Bearer ${token}` }, ...baseReq() };
    const res = buildRes();
    const next = vi.fn();
    await verifyToken(req, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('no deja pasar si no se pudo validar la cuenta', async () => {
    mockedIsUserActive.mockRejectedValue(new Error('bd caida'));
    const token = jwt.sign({ id: 'u1', role: 'VIEWER', mustChangePassword: false }, secret, { expiresIn: '8h' });
    const res = buildRes();
    const next = vi.fn();
    await verifyToken({ headers: { authorization: `Bearer ${token}` }, ...baseReq() } as any, res as any, next);
    expect(res.statusCode).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requirePermission (RBAC por accion)', () => {
  it('responde 401 sin usuario en la sesion', async () => {
    const next = vi.fn();
    const res = buildRes();
    await requirePermission('HELPDESK.ASSETS.WRITE')({} as any, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('llama next cuando el usuario tiene el permiso requerido', async () => {
    mockedGetPermissions.mockResolvedValue(new Set(['HELPDESK.ASSETS.READ', 'HELPDESK.ASSETS.WRITE']));
    const next = vi.fn();
    const res = buildRes();
    await requirePermission('HELPDESK.ASSETS.WRITE')(
      { user: { id: 'u1', role: 'EDITOR' } } as any,
      res as any,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it('responde 403 cuando falta el permiso', async () => {
    mockedGetPermissions.mockResolvedValue(new Set(['HELPDESK.ASSETS.READ']));
    const next = vi.fn();
    const res = buildRes();
    await requirePermission('HELPDESK.ASSETS.WRITE')(
      { user: { id: 'u1', role: 'VIEWER' } } as any,
      res as any,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('autoriza con semantica OR si tiene al menos uno de varios permisos', async () => {
    mockedGetPermissions.mockResolvedValue(new Set(['HELPDESK.ASSETS.DELETE']));
    const next = vi.fn();
    const res = buildRes();
    await requirePermission(['HELPDESK.ASSETS.WRITE', 'HELPDESK.ASSETS.DELETE'])(
      { user: { id: 'u1', role: 'ADMIN' } } as any,
      res as any,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
