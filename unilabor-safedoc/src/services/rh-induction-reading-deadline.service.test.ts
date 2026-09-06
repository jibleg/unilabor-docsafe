import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/db', () => ({
  default: { query: vi.fn() },
}));

import pool from '../config/db';
import {
  INDUCTION_UNLIMITED_READING_HOURS,
  syncInductionReadingDeadlines,
} from './rh-induction-reading-deadline.service';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

describe('syncInductionReadingDeadlines', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('no consulta la BD si no recibe inscripcion ni fase', async () => {
    await expect(syncInductionReadingDeadlines({})).resolves.toBe(0);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('alinea los acuses de una inscripcion y regresa cuantos toco', async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 6, rows: [] });
    await expect(syncInductionReadingDeadlines({ enrollmentId: 42 })).resolves.toBe(6);
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toContain('UPDATE public.quality_reading_acknowledgements');
    expect(sql).toContain('deadline_at = COALESCE(e.reading_deadline_at');
    expect(sql).toContain("a.status = 'expired'");
    expect(params).toEqual([42, null, INDUCTION_UNLIMITED_READING_HOURS]);
  });

  it('acepta el filtro por fase completa', async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 516, rows: [] });
    await expect(syncInductionReadingDeadlines({ phaseId: 1 })).resolves.toBe(516);
    expect(mockedQuery.mock.calls[0][1]).toEqual([null, 1, INDUCTION_UNLIMITED_READING_HOURS]);
  });
});
