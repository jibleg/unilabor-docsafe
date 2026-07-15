import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/db', () => ({
  default: { query: vi.fn() },
}));

import pool from '../config/db';
import { listSystemModules, syncUserModuleAccess } from './module-access.service';
import type { ModuleCode } from '../types';

const mockedQuery = vi.mocked(pool.query);

/**
 * Filas de `public.modules` tal como quedan en produccion: los 3 modulos de
 * acceso mas 'ADMIN', que sembro la migracion RBAC 20260714_01 y que no se
 * asigna por esta via.
 */
const MODULE_ROWS = [
  { id: 1, code: 'QUALITY', name: 'Documentos de Calidad', description: null, icon: null, is_active: true, sort_order: 10 },
  { id: 2, code: 'RH', name: 'Recursos Humanos', description: null, icon: null, is_active: true, sort_order: 20 },
  { id: 3, code: 'HELPDESK', name: 'Mesa de Ayuda', description: null, icon: null, is_active: true, sort_order: 30 },
  { id: 4, code: 'ADMIN', name: 'Administracion', description: null, icon: null, is_active: true, sort_order: 90 },
];

const buildClient = () => ({
  query: vi.fn(async (text: string) => {
    if (/FROM public\.modules/i.test(text)) {
      return { rows: MODULE_ROWS };
    }
    return { rows: [] };
  }),
});

const syncCodes = (codes: ModuleCode[]) =>
  syncUserModuleAccess(buildClient() as any, 'user-1', codes, 'ADMIN');

describe('module-access service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Todas las tablas existen (chequeo to_regclass).
    mockedQuery.mockResolvedValue({ rows: [{ exists: true }] } as any);
  });

  describe('syncUserModuleAccess', () => {
    it('asigna QUALITY aunque exista el modulo ADMIN del RBAC', async () => {
      // Regresion: 'ADMIN' se normalizaba a 'QUALITY' y duplicaba la coincidencia,
      // lo que hacia fallar el conteo con INVALID_MODULE_CODES.
      const result = await syncCodes(['QUALITY']);

      expect(result.map((moduleAccess) => moduleAccess.code)).toEqual(['QUALITY']);
    });

    it('asigna los tres modulos de acceso a la vez', async () => {
      const result = await syncCodes(['QUALITY', 'RH', 'HELPDESK']);

      expect(result.map((moduleAccess) => moduleAccess.code)).toEqual(['QUALITY', 'RH', 'HELPDESK']);
    });

    it('ignora codigos que no son modulos de acceso en vez de tratarlos como QUALITY', async () => {
      const result = await syncCodes(['ADMIN' as ModuleCode]);

      expect(result).toEqual([]);
    });

    it('falla cuando el modulo pedido no esta activo', async () => {
      const client = {
        query: vi.fn(async (text: string) => {
          if (/FROM public\.modules/i.test(text)) {
            return { rows: MODULE_ROWS.filter((row) => row.code !== 'RH') };
          }
          return { rows: [] };
        }),
      };

      await expect(syncUserModuleAccess(client as any, 'user-1', ['RH'], 'ADMIN')).rejects.toMatchObject({
        code: 'INVALID_MODULE_CODES',
      });
    });
  });

  describe('listSystemModules', () => {
    it('expone solo los modulos de acceso, sin ADMIN', async () => {
      // El servicio memoriza la existencia de tablas, asi que la unica consulta
      // que llega al pool aqui es el SELECT de modulos.
      mockedQuery.mockImplementation(async (text: string) =>
        (/to_regclass/i.test(text) ? { rows: [{ exists: true }] } : { rows: MODULE_ROWS }) as any,
      );

      const result = await listSystemModules();

      expect(result.map((moduleAccess) => moduleAccess.code)).toEqual(['QUALITY', 'RH', 'HELPDESK']);
    });
  });
});
