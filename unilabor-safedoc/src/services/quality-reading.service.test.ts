import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/db', () => ({
  default: { query: vi.fn() },
}));

import pool from '../config/db';
import { buildDocumentInUseMessage, getDocumentReadingUsage } from './quality-reading.service';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const DOCUMENT_ID = '52b8a2fc-8be9-45e5-9c74-5369f7bb4b96';

describe('quality-reading.service', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('reporta cero uso cuando las tablas aun no existen', async () => {
    // Un entorno sin la migracion 20260722_01 no debe romper el borrado de
    // documentos, que es un flujo anterior e independiente.
    mockedQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });

    expect(await getDocumentReadingUsage(DOCUMENT_ID)).toEqual({ publications: 0, signed: 0 });
    // No se llega a consultar el uso: basta con saber que no hay tablas.
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('cuenta publicaciones y firmas del documento', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [{ publications: 2, signed: 7 }] });

    expect(await getDocumentReadingUsage(DOCUMENT_ID)).toEqual({ publications: 2, signed: 7 });
  });

  it('trata un documento sin publicaciones como sin uso', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [{ publications: 0, signed: 0 }] });

    const usage = await getDocumentReadingUsage(DOCUMENT_ID);
    expect(usage.publications).toBe(0);
  });

  it('el mensaje del 409 menciona las firmas solo si las hay', () => {
    expect(buildDocumentInUseMessage({ publications: 1, signed: 0 })).not.toContain('firma');
    expect(buildDocumentInUseMessage({ publications: 3, signed: 5 })).toContain('5 firma(s)');
  });
});
