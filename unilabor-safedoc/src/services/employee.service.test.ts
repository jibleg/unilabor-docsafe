import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
vi.mock('../config/db', () => ({ default: { query, connect: vi.fn(async () => ({ query: clientQuery, release })) } }));
const invalidateUserPermissions = vi.fn();
vi.mock('./permission.service', () => ({ getUserAccessibleModules: vi.fn(), invalidateUserPermissions }));
vi.mock('./employee-document-access.service', () => ({ initializeDefaultEmployeeDocumentAccess: vi.fn() }));
vi.mock('./rh-employee-area.service', () => ({ resolveEmployeeAreaName: vi.fn() }));
vi.mock('./rh-supervision-signers.service', () => ({ resyncDraftSignersQuietly: vi.fn() }));

const { deactivateEmployee, getEmployeeById, getEmployeeDetail, listEmployees, updateEmployee } = await import('./employee.service');

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

describe('listEmployees e inactivos', () => {
  const listSql = () => String(query.mock.calls.find(([text]) => String(text).includes('ORDER BY e.full_name'))?.[0]);

  it('por defecto solo lista activos', async () => {
    await listEmployees();
    expect(listSql()).toContain('e.is_active = TRUE');
  });

  it('con includeInactive tambien lista a los inactivos', async () => {
    await listEmployees({ includeInactive: true });
    expect(listSql()).not.toContain('e.is_active = TRUE');
  });
});

describe('getEmployeeDetail', () => {
  it('informa si el colaborador esta vinculado a XLab', async () => {
    expect((await getEmployeeDetail(1))?.xlab_linked).toBe(true);
  });

  it('getEmployeeById no consulta el vinculo: lo usa toda la app', async () => {
    await getEmployeeById(1);
    expect(query.mock.calls.some(([text]) => String(text).includes('xlab_user_links'))).toBe(false);
  });
});

describe('vinculo con XLab al editar o dar de baja', () => {
  const deleteLinkCalls = () => clientQuery.mock.calls.filter(([text]) => String(text).startsWith('DELETE FROM public.xlab_user_links'));
  const statements = () => clientQuery.mock.calls.map(([text]) => String(text));
  const fakeClient = (onDeleteLink: () => Promise<{ rows: unknown[] }>, employee: ReturnType<typeof row> = row(1, 'u-1'), accountUpdate: { rows: unknown[] } = { rows: [{ id: employee.user_id }] }) =>
    clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('SELECT * FROM public.employees')) return { rows: [employee] };
      if (text.includes('UPDATE public.users')) return accountUpdate;
      if (text.includes('SET is_active = FALSE')) return { rows: [{ id: employee.id, user_id: employee.user_id }] };
      if (/FROM public\.users\s+WHERE id/.test(text)) return { rows: [{ id: 'u-9', is_active: true }] };
      if (text.startsWith('DELETE FROM public.xlab_user_links')) return onDeleteLink();
      return { rows: [] };
    });
  const removedLink = { employee_id: 1, user_id: 'u-1', cve_usuario: 101, previous_cve_usuario: 101 };

  beforeEach(() => {
    clientQuery.mockReset();
    fakeClient(async () => ({ rows: [{ cve_usuario: 101 }] }));
  });

  describe('updateEmployee', () => {
    it.each([
      ['cambia', 'u-9'],
      ['se quita', null],
    ])('borra el vinculo de la cuenta anterior y lo reporta cuando el usuario %s', async (_caso, nuevo) => {
      const result = await updateEmployee(1, { user_id: nuevo });

      expect(deleteLinkCalls().map(([, params]) => params)).toEqual([['u-1']]);
      expect(result?.removedXlabLink).toEqual(removedLink);
      expect(statements().findIndex((text) => text.startsWith('DELETE'))).toBeLessThan(statements().indexOf('COMMIT'));
    });

    it.each([
      ['otro campo', { full_name: 'Nuevo nombre' }],
      ['el mismo usuario', { user_id: 'u-1' }],
    ])('conserva el vinculo si se edita %s', async (_caso, payload) => {
      const result = await updateEmployee(1, payload);

      expect(deleteLinkCalls()).toHaveLength(0);
      expect(result?.removedXlabLink).toBeNull();
    });

    it('no reporta nada si la cuenta anterior no tenia vinculo', async () => {
      fakeClient(async () => ({ rows: [] }));
      const result = await updateEmployee(1, { user_id: 'u-9' });

      expect(deleteLinkCalls()).toHaveLength(1);
      expect(result?.removedXlabLink).toBeNull();
    });

    it('si falla el borrado se revierte el cambio de usuario', async () => {
      fakeClient(async () => {
        throw new Error('fallo');
      });

      await expect(updateEmployee(1, { user_id: 'u-9' })).rejects.toThrow('fallo');
      expect(statements()).toContain('ROLLBACK');
      expect(statements()).not.toContain('COMMIT');
    });
  });

  describe('deactivateEmployee', () => {
    it('desactiva la cuenta y borra el vinculo en la misma transaccion', async () => {
      const result = await deactivateEmployee(1, 'rh');

      expect(deleteLinkCalls().map(([, params]) => params)).toEqual([['u-1']]);
      expect(result?.removedXlabLink).toEqual(removedLink);
      expect(result?.deactivatedUserId).toBe('u-1');
      expect(invalidateUserPermissions).toHaveBeenCalledWith('u-1');
      expect(statements().findIndex((text) => text.includes('UPDATE public.users'))).toBeLessThan(statements().indexOf('COMMIT'));
      expect(statements().findIndex((text) => text.startsWith('DELETE'))).toBeLessThan(statements().indexOf('COMMIT'));
    });

    it('un colaborador sin usuario no toca vinculos', async () => {
      fakeClient(async () => ({ rows: [] }), row(3, null));
      const result = await deactivateEmployee(3, 'rh');

      expect(deleteLinkCalls()).toHaveLength(0);
      expect(statements().some((text) => text.includes('UPDATE public.users'))).toBe(false);
      expect(result?.removedXlabLink).toBeNull();
      expect(result?.deactivatedUserId).toBeNull();
    });

    it('una cuenta que ya estaba inactiva no se reporta como desactivada', async () => {
      fakeClient(async () => ({ rows: [] }), row(1, 'u-1'), { rows: [] });
      const result = await deactivateEmployee(1, 'rh');

      expect(result?.deactivatedUserId).toBeNull();
    });

    it('nadie puede darse de baja a si mismo', async () => {
      await expect(deactivateEmployee(1, 'u-1')).rejects.toMatchObject({ code: 'EMPLOYEE_SELF_DEACTIVATION' });
      expect(statements()).toContain('ROLLBACK');
      expect(statements()).not.toContain('COMMIT');
      expect(statements().some((text) => text.includes('UPDATE public.users'))).toBe(false);
    });

    it('colaborador inexistente: revierte y responde null', async () => {
      clientQuery.mockImplementation(async () => ({ rows: [] }));

      expect(await deactivateEmployee(99, 'rh')).toBeNull();
      expect(statements()).toContain('ROLLBACK');
      expect(deleteLinkCalls()).toHaveLength(0);
    });

    it('si falla el borrado no se da de baja', async () => {
      fakeClient(async () => {
        throw new Error('fallo');
      });

      await expect(deactivateEmployee(1, 'rh')).rejects.toThrow('fallo');
      expect(statements()).toContain('ROLLBACK');
      expect(statements()).not.toContain('COMMIT');
    });
  });
});
