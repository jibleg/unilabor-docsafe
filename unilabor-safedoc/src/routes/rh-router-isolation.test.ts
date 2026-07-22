import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Permisos del usuario simulado: un colaborador de consulta, que NO es de
// alertas. Es el caso que estuvo roto en produccion.
const GRANTED = new Set(['RH.SELF.EVALUATIONS', 'RH.SELF.ACKNOWLEDGEMENTS']);

vi.mock('../middlewares/auth.middleware', () => ({
  verifyToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'VIEWER', mustChangePassword: false };
    next();
  },
  requirePermission: (required: string | string[]) => (_req: any, res: any, next: any) => {
    const codes = Array.isArray(required) ? required : [required];
    if (codes.some((code) => GRANTED.has(code))) {
      return next();
    }
    return res.status(403).json({ message: 'No tienes el permiso necesario' });
  },
}));

vi.mock('../controllers/employee-alert.controller', () => ({
  listRhAlertsController: (_req: any, res: any) => res.json({ ok: 'alerts' }),
  listEmployeeAlertsController: (_req: any, res: any) => res.json({ ok: 'employee-alerts' }),
}));

const { default: employeeAlertRoutes } = await import('./employee-alert.routes');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();

  // Se reproduce el montaje de index.ts: varios routers comparten /api/rh y el
  // de alertas va ANTES que los de autoservicio.
  app.use('/api/rh', employeeAlertRoutes);

  const selfServiceRouter = express.Router();
  selfServiceRouter.get('/me/acknowledgements', (_req, res) => res.json({ ok: 'acuses' }));
  selfServiceRouter.get('/me/evaluations', (_req, res) => res.json({ ok: 'evaluaciones' }));
  app.use('/api/rh', selfServiceRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('aislamiento de routers montados en /api/rh', () => {
  it('el router de alertas sigue exigiendo su permiso en sus propias rutas', async () => {
    expect((await fetch(`${baseUrl}/api/rh/alerts`)).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/rh/employees/7/alerts`)).status).toBe(403);
  });

  it('NO bloquea las rutas de los routers montados despues', async () => {
    // Regresion: un `router.use(requirePermission(...))` sin prefijo en el
    // router de alertas hacia que todo /api/rh pasara por ese permiso, dejando
    // a los colaboradores con 403 en sus acuses y evaluaciones.
    expect((await fetch(`${baseUrl}/api/rh/me/acknowledgements`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/rh/me/evaluations`)).status).toBe(200);
  });
});
