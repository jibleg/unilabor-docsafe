import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../config/db', () => ({ default: { query } }));
vi.mock('./permission.service', () => ({ getUserAccessibleModules: vi.fn(), invalidateUserPermissions: vi.fn() }));
vi.mock('./employee-document-access.service', () => ({ initializeDefaultEmployeeDocumentAccess: vi.fn() }));
vi.mock('./rh-employee-area.service', () => ({ resolveEmployeeAreaName: vi.fn() }));
vi.mock('./rh-supervision-signers.service', () => ({ resyncDraftSignersQuietly: vi.fn() }));

const { listEmployees } = await import('./employee.service');

const row = (id: number, user_id: string | null) => ({ id, employee_code: `COL-${id}`, user_id, full_name: `C${id}`, email: `c${id}@x.mx`, is_active: true });

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (text: string) => {
    if (text.includes('to_regclass')) return { rows: [{ exists: true }] };
    if (text.includes('xlab_user_links')) return { rows: [{ user_id: 'u-1' }] };
    return { rows: [row(1, 'u-1'), row(2, 'u-2'), row(3, null)] };
  });
});

describe('listEmployees', () => {
  it('marca solo a los colaboradores vinculados a XLab', async () => {
    const { data } = await listEmployees();
    expect(data.map((employee) => employee.xlab_linked)).toEqual([true, false, false]);
  });
});
