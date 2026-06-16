import { beforeEach, describe, expect, it, vi } from 'vitest';

// El service usa la instancia axios de ./axios; la mockeamos para probar la
// normalizacion de respuestas sin red.
vi.mock('./axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  API_BASE_URL: '',
}));

import api from './axios';
import { listEmployeesPaginated, listMaintenancePlans } from './service';

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
    mockedGet.mockResolvedValueOnce({ data: { plans: [validPlan] } } as never);
    const result = await listMaintenancePlans();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 7, plan_code: 'MP-000007', asset_id: 3, title: 'Plan trimestral' });
    expect(Array.isArray(result[0].tasks)).toBe(true);
  });

  it('descarta entradas a las que les faltan campos obligatorios', async () => {
    const invalidPlan = { ...validPlan, id: 8, title: '' };
    mockedGet.mockResolvedValueOnce({ data: { plans: [validPlan, invalidPlan] } } as never);
    const result = await listMaintenancePlans();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(7);
  });

  it('soporta arreglo plano sin clave envolvente', async () => {
    mockedGet.mockResolvedValueOnce({ data: [validPlan] } as never);
    const result = await listMaintenancePlans();
    expect(result).toHaveLength(1);
  });
});

const validEmployee = {
  id: 5,
  employee_code: 'COL-00005',
  full_name: 'Ana Lopez',
  email: 'ana@unilabor.mx',
  area: 'Calidad',
  position: 'Analista',
};

describe('listEmployeesPaginated (contrato de paginacion)', () => {
  it('extrae data y metadata del contrato {data, pagination}', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { data: [validEmployee], pagination: { page: 2, limit: 20, total: 45, totalPages: 3 } },
    } as never);

    const result = await listEmployeesPaginated({ page: 2, limit: 20, search: 'ana' });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 5, employee_code: 'COL-00005' });
    expect(result.pagination).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
    expect(mockedGet).toHaveBeenCalledWith('/employees', {
      params: { page: 2, limit: 20, search: 'ana' },
    });
  });

  it('infiere metadata por defecto cuando la respuesta no la trae', async () => {
    mockedGet.mockResolvedValueOnce({ data: [validEmployee] } as never);

    const result = await listEmployeesPaginated();

    expect(result.data).toHaveLength(1);
    expect(result.pagination).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 });
  });
});
