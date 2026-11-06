import { beforeEach, describe, expect, it, vi } from 'vitest';

type Link = { user_id: string; cve_usuario: number };
let links: Link[] = [];
let xlabDown = false;

const EMPLOYEES: Record<number, string | null> = { 1: 'user-maria', 2: 'user-jose', 3: null };
const XLAB = [
  { cve_usuario: 101, nombre: 'MARÍA PEÑA', activo_usuario: 1, cve_tipo_usuario: 2 },
  { cve_usuario: 102, nombre: 'JOSÉ NÚÑEZ', activo_usuario: 1, cve_tipo_usuario: 4 },
  { cve_usuario: 103, nombre: 'LUCÍA GÓMEZ', activo_usuario: 0, cve_tipo_usuario: 2 },
  { cve_usuario: 105, nombre: 'SOFÍA IBÁÑEZ', activo_usuario: 1, cve_tipo_usuario: 2 },
];

const uniqueViolation = (constraint: string) => Object.assign(new Error('duplicate key'), { code: '23505', constraint });

// Doble de la BD de DocSafe con las dos restricciones UNIQUE de la tabla real.
vi.mock('../config/db', () => ({
  default: {
    query: vi.fn(async (text: string, params: any[]) => {
      if (text.includes('FROM public.employees WHERE id')) {
        return { rows: params[0] in EMPLOYEES ? [{ user_id: EMPLOYEES[params[0]] }] : [] };
      }
      if (text.startsWith('INSERT INTO public.xlab_user_links')) {
        if (links.some((link) => link.user_id === params[0])) throw uniqueViolation('xlab_user_links_pkey');
        if (links.some((link) => link.cve_usuario === params[1])) throw uniqueViolation('ux_xlab_user_links_cve_usuario');
        links.push({ user_id: params[0], cve_usuario: params[1] });
        return { rows: [] };
      }
      if (text.includes('UPDATE public.xlab_user_links')) {
        const current = links.find((link) => link.user_id === params[0]);
        if (!current) return { rows: [] };
        if (links.some((link) => link !== current && link.cve_usuario === params[1])) throw uniqueViolation('ux_xlab_user_links_cve_usuario');
        const previous = current.cve_usuario;
        current.cve_usuario = params[1];
        return { rows: [{ previous_cve_usuario: previous }] };
      }
      if (text.startsWith('DELETE')) {
        const current = links.find((link) => link.user_id === params[0]);
        links = links.filter((link) => link !== current);
        return { rows: current ? [{ cve_usuario: current.cve_usuario }] : [] };
      }
      if (text.includes('full_name AS linked_by_name')) {
        const current = links.find((link) => link.user_id === params[0]);
        return { rows: current ? [{ cve_usuario: current.cve_usuario, linked_at: 'hoy', linked_by_name: 'RH' }] : [] };
      }
      if (text.includes('COALESCE(e.full_name')) {
        return { rows: [{ full_name: 'María Peña' }] };
      }
      return { rows: links.map((link) => ({ cve_usuario: link.cve_usuario })) };
    }),
  },
}));

vi.mock('../config/xlab-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/xlab-db')>();
  return {
    ...actual,
    xlabQuery: vi.fn(async (text: string, params: any[]) => {
      if (xlabDown) throw new actual.XlabUnavailableError();
      if (text.includes('WHERE cve_usuario = $1')) {
        return { rows: XLAB.filter((row) => row.cve_usuario === params[0]) };
      }
      return { rows: XLAB.filter((row) => row.activo_usuario === 1 && !params[0].includes(row.cve_usuario)) };
    }),
  };
});

const { createEmployeeXlabLink, deleteEmployeeXlabLink, getEmployeeXlabLink, listAvailableXlabUsers, updateEmployeeXlabLink } = await import(
  './xlab-user-link.service'
);
const { XlabUnavailableError } = await import('../config/xlab-db');

beforeEach(() => {
  links = [];
  xlabDown = false;
});

describe('vinculo 1 a 1', () => {
  it('crea el vinculo con el usuario de DocSafe del colaborador', async () => {
    await createEmployeeXlabLink(1, 101, 'rh');
    expect(links).toEqual([{ user_id: 'user-maria', cve_usuario: 101 }]);
  });

  it('rechaza un segundo usuario de XLab para el mismo colaborador', async () => {
    await createEmployeeXlabLink(1, 101, 'rh');
    await expect(createEmployeeXlabLink(1, 102, 'rh')).rejects.toMatchObject({ code: 'XLAB_LINK_ALREADY_LINKED' });
    expect(links).toHaveLength(1);
  });

  it('rechaza un usuario de XLab ya ocupado por otro, y dice quien lo tiene', async () => {
    await createEmployeeXlabLink(1, 101, 'rh');
    await expect(createEmployeeXlabLink(2, 101, 'rh')).rejects.toMatchObject({
      code: 'XLAB_LINK_USER_TAKEN',
      publicMessage: 'Ese usuario de XLab ya esta vinculado a María Peña.',
    });
  });

  it('cambiar hacia una clave ocupada tambien se rechaza y no altera nada', async () => {
    await createEmployeeXlabLink(1, 101, 'rh');
    await createEmployeeXlabLink(2, 102, 'rh');
    await expect(updateEmployeeXlabLink(2, 101, 'rh')).rejects.toMatchObject({ code: 'XLAB_LINK_USER_TAKEN' });
    expect(links.find((link) => link.user_id === 'user-jose')?.cve_usuario).toBe(102);
  });

  it('cambia y quita, reportando el valor anterior para la auditoria', async () => {
    await createEmployeeXlabLink(1, 101, 'rh');
    expect(await updateEmployeeXlabLink(1, 105, 'rh')).toMatchObject({ cve_usuario: 105, previous_cve_usuario: 101 });
    expect(await deleteEmployeeXlabLink(1)).toMatchObject({ cve_usuario: 105 });
    expect(links).toEqual([]);
  });

  it('cambiar o quitar sin vinculo responde que no existe', async () => {
    await expect(updateEmployeeXlabLink(1, 101, 'rh')).rejects.toMatchObject({ code: 'XLAB_LINK_NOT_FOUND' });
    await expect(deleteEmployeeXlabLink(1)).rejects.toMatchObject({ code: 'XLAB_LINK_NOT_FOUND' });
  });
});

describe('validaciones al vincular', () => {
  it('exige que el colaborador tenga usuario de DocSafe', async () => {
    await expect(createEmployeeXlabLink(3, 101, 'rh')).rejects.toMatchObject({ code: 'XLAB_LINK_NO_DOCSAFE_USER' });
  });

  it('colaborador inexistente', async () => {
    await expect(createEmployeeXlabLink(99, 101, 'rh')).rejects.toMatchObject({ code: 'XLAB_LINK_EMPLOYEE_NOT_FOUND' });
  });

  it('rechaza claves inexistentes o inactivas en XLab', async () => {
    await expect(createEmployeeXlabLink(1, 999, 'rh')).rejects.toMatchObject({ code: 'XLAB_LINK_USER_NOT_FOUND' });
    await expect(createEmployeeXlabLink(1, 103, 'rh')).rejects.toMatchObject({ code: 'XLAB_LINK_USER_INACTIVE' });
  });
});

describe('busqueda de usuarios libres', () => {
  it('solo activos sin vinculo, con los campos permitidos', async () => {
    await createEmployeeXlabLink(1, 101, 'rh');
    const users = await listAvailableXlabUsers('');
    expect(users.map((user) => user.cve_usuario)).toEqual([102, 105]);
    expect(Object.keys(users[0]!).sort()).toEqual(['activo', 'cve_usuario', 'nombre', 'tipo']);
  });

  it('ignora acentos y mayusculas; tambien busca por clave', async () => {
    expect((await listAvailableXlabUsers('ibanez')).map((user) => user.cve_usuario)).toEqual([105]);
    expect((await listAvailableXlabUsers('102')).map((user) => user.nombre)).toEqual(['JOSÉ NÚÑEZ']);
  });
});

describe('xlab caido', () => {
  it('no se puede vincular ni buscar', async () => {
    xlabDown = true;
    await expect(createEmployeeXlabLink(1, 101, 'rh')).rejects.toBeInstanceOf(XlabUnavailableError);
    await expect(listAvailableXlabUsers('')).rejects.toBeInstanceOf(XlabUnavailableError);
  });

  it('el vinculo existente se sigue mostrando y se puede quitar', async () => {
    await createEmployeeXlabLink(1, 101, 'rh');
    xlabDown = true;
    expect(await getEmployeeXlabLink(1)).toMatchObject({ cve_usuario: 101, xlab_user: null, xlab_available: false });
    expect(await deleteEmployeeXlabLink(1)).toMatchObject({ cve_usuario: 101 });
  });
});
