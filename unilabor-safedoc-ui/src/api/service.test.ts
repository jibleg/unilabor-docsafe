import { beforeEach, describe, expect, it, vi } from 'vitest';

// El service usa la instancia axios de ./axios; la mockeamos para probar la
// normalizacion de respuestas sin red.
vi.mock('./axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  API_BASE_URL: '',
}));

import api from './axios';
import { listMaintenancePlans } from './service';

const mockedGet = vi.mocked(api.get);

const validPlan = {
  id: 7,
  plan_code: 'MP-000007',
  asset_id: 3,
  title: 'Plan trimestral',
  starts_on: '2026-06-12',
  next_due_on: '2026-09-12',
  tolerance_before_days: 3,
  tolerance_after_days: 3,
  tasks: [],
  orders: [],
};

beforeEach(() => {
  mockedGet.mockReset();
});

describe('listMaintenancePlans (normalizacion)', () => {
  it('normaliza planes validos desde la clave "plans"', async () => {
    mockedGet.mockResolvedValueOnce({ data: { plans: [validPlan] } } as any);
    const result = await listMaintenancePlans();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 7, plan_code: 'MP-000007', asset_id: 3, title: 'Plan trimestral' });
    expect(Array.isArray(result[0].tasks)).toBe(true);
  });

  it('descarta entradas a las que les faltan campos obligatorios', async () => {
    const invalidPlan = { ...validPlan, id: 8, title: '' };
    mockedGet.mockResolvedValueOnce({ data: { plans: [validPlan, invalidPlan] } } as any);
    const result = await listMaintenancePlans();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(7);
  });

  it('soporta arreglo plano sin clave envolvente', async () => {
    mockedGet.mockResolvedValueOnce({ data: [validPlan] } as any);
    const result = await listMaintenancePlans();
    expect(result).toHaveLength(1);
  });
});
