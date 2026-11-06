import { beforeEach, describe, expect, it, vi } from 'vitest';

const LINKS = new Map<string, number>([
  ['user-maria', 101],
  ['user-jose', 102],
]);

const seed = () => [
  { id: 'n-maria-1', cve_usuario: 101, read_at: null as string | null },
  { id: 'n-maria-2', cve_usuario: 101, read_at: null as string | null },
  { id: 'n-jose-1', cve_usuario: 102, read_at: null as string | null },
];
let notifications = seed();
let xlabDown = false;

// Doble de la BD de DocSafe: solo el vinculo de cada usuario.
vi.mock('../config/db', () => ({
  default: {
    query: vi.fn(async (_text: string, params: unknown[]) => {
      const cve = LINKS.get(String(params[0]));
      return { rows: cve === undefined ? [] : [{ cve_usuario: cve }] };
    }),
  },
}));

// Doble de `xlab`: aplica el mismo filtro que el SQL real, segun los parametros recibidos.
vi.mock('../config/xlab-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/xlab-db')>();
  return {
    ...actual,
    xlabQuery: vi.fn(async (text: string, params: unknown[]) => {
      if (xlabDown) throw new actual.XlabUnavailableError();
      if (text.includes('count(*) AS total')) {
        const own = notifications.filter((row) => row.cve_usuario === params[0]);
        return { rows: [{ total: String(own.length), unread: String(own.filter((row) => !row.read_at).length) }] };
      }
      if (text.includes('count(*) AS n')) {
        return { rows: [{ n: String(notifications.filter((row) => row.cve_usuario === params[0] && !row.read_at).length) }] };
      }
      if (text.startsWith('SELECT')) {
        return { rows: notifications.filter((row) => row.cve_usuario === params[0]) };
      }
      if (text.includes('WHERE id = $1')) {
        const hits = notifications.filter((row) => row.id === params[0] && row.cve_usuario === params[1]);
        hits.forEach((row) => (row.read_at = 'ahora'));
        return { rowCount: hits.length };
      }
      const hits = notifications.filter((row) => row.cve_usuario === params[0] && !row.read_at);
      hits.forEach((row) => (row.read_at = 'ahora'));
      return { rowCount: hits.length };
    }),
  };
});

const { countMyUnreadNotifications, listMyNotifications, markAllMyNotificationsRead, markMyNotificationRead } = await import(
  './my-notifications.service'
);
const { XlabUnavailableError } = await import('../config/xlab-db');

beforeEach(() => {
  notifications = seed();
  xlabDown = false;
});

describe('mis notificaciones: aislamiento', () => {
  it('cada usuario solo ve las suyas', async () => {
    const page = await listMyNotifications('user-maria', 20, 0);
    expect(page.rows.map((row) => row.id)).toEqual(['n-maria-1', 'n-maria-2']);
    expect(page).toMatchObject({ linked: true, available: true, total: 2, unread: 2 });
  });

  it('no puede marcar como leida la de otro: no se toca y responde false', async () => {
    expect(await markMyNotificationRead('user-maria', 'n-jose-1')).toBe(false);
    expect(notifications.find((row) => row.id === 'n-jose-1')?.read_at).toBeNull();
  });

  it('marca la propia', async () => {
    expect(await markMyNotificationRead('user-maria', 'n-maria-1')).toBe(true);
    expect(await countMyUnreadNotifications('user-maria')).toBe(1);
  });

  it('marcar todas solo alcanza las propias', async () => {
    expect(await markAllMyNotificationsRead('user-maria')).toBe(2);
    expect(notifications.find((row) => row.id === 'n-jose-1')?.read_at).toBeNull();
  });
});

describe('mis notificaciones: sin vinculo', () => {
  it('lista vacia, contador en cero y nada que marcar, sin consultar xlab', async () => {
    xlabDown = true;
    expect(await listMyNotifications('user-sin-vinculo', 20, 0)).toEqual({ linked: false, available: true, rows: [], total: 0, unread: 0 });
    expect(await countMyUnreadNotifications('user-sin-vinculo')).toBe(0);
    expect(await markMyNotificationRead('user-sin-vinculo', 'n-maria-1')).toBe(false);
    expect(await markAllMyNotificationsRead('user-sin-vinculo')).toBe(0);
  });
});

describe('mis notificaciones: xlab caido', () => {
  beforeEach(() => {
    xlabDown = true;
  });

  it('la lista queda vacia y lo avisa, sin error', async () => {
    expect(await listMyNotifications('user-maria', 20, 0)).toEqual({ linked: true, available: false, rows: [], total: 0, unread: 0 });
  });

  it('el contador queda en cero', async () => {
    expect(await countMyUnreadNotifications('user-maria')).toBe(0);
  });

  it('marcar si propaga el error: el usuario debe saber que no se guardo', async () => {
    await expect(markMyNotificationRead('user-maria', 'n-maria-1')).rejects.toBeInstanceOf(XlabUnavailableError);
  });
});
