import pool from '../config/db';
import { lisText, xlabQuery, XlabUnavailableError } from '../config/xlab-db';

/**
 * Vinculo 1 a 1 usuario de DocSafe <-> usuario de XLab (RH, ficha del colaborador).
 * De public.usuarios solo se leen clave, nombre, estado y tipo: el rol de `xlab` no
 * tiene acceso a ninguna otra columna (contrasenas, firmas).
 */
export interface XlabUser {
  cve_usuario: number;
  nombre: string;
  activo: boolean;
  tipo: number | null;
}

export interface EmployeeXlabLink {
  user_id: string | null;
  cve_usuario: number | null;
  linked_at: string | null;
  linked_by_name: string | null;
  xlab_user: XlabUser | null;
  xlab_available: boolean;
}

export interface XlabLinkMutation {
  employee_id: number;
  user_id: string;
  cve_usuario: number;
  previous_cve_usuario: number | null;
}

interface XlabUserRow {
  cve_usuario: number;
  nombre: string | null;
  activo_usuario: number | null;
  cve_tipo_usuario: number | null;
}

const USER_COLUMNS = `cve_usuario, ${lisText('nombre')} AS nombre, activo_usuario, cve_tipo_usuario`;
const COMBINING_MARKS = /[̀-ͯ]/g;
const CVE_UNIQUE_CONSTRAINT = 'ux_xlab_user_links_cve_usuario';

const codedError = (code: string, publicMessage: string) => Object.assign(new Error(code), { code, publicMessage });

const normalize = (value: string): string => value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();

const toXlabUser = (row: XlabUserRow): XlabUser => ({
  cve_usuario: row.cve_usuario,
  nombre: (row.nombre ?? '').trim() || `Usuario ${row.cve_usuario}`,
  activo: row.activo_usuario === 1,
  tipo: row.cve_tipo_usuario,
});

const getEmployeeUserId = async (employeeId: number): Promise<string | null> => {
  const { rows } = await pool.query<{ user_id: string | null }>('SELECT user_id FROM public.employees WHERE id = $1', [employeeId]);
  if (rows.length === 0) {
    throw codedError('XLAB_LINK_EMPLOYEE_NOT_FOUND', 'Colaborador no encontrado.');
  }
  return rows[0]!.user_id;
};

const requireEmployeeUserId = async (employeeId: number): Promise<string> => {
  const userId = await getEmployeeUserId(employeeId);
  if (!userId) {
    throw codedError('XLAB_LINK_NO_DOCSAFE_USER', 'El colaborador aun no tiene usuario de DocSafe; asignale uno antes de vincular XLab.');
  }
  return userId;
};

const getXlabUser = async (cveUsuario: number): Promise<XlabUser | null> => {
  const { rows } = await xlabQuery<XlabUserRow>(`SELECT ${USER_COLUMNS} FROM public.usuarios WHERE cve_usuario = $1`, [cveUsuario]);
  return rows[0] ? toXlabUser(rows[0]) : null;
};

/** Valida que la clave exista y siga activa en XLab antes de ocuparla. */
const requireActiveXlabUser = async (cveUsuario: number): Promise<XlabUser> => {
  const user = await getXlabUser(cveUsuario);
  if (!user) {
    throw codedError('XLAB_LINK_USER_NOT_FOUND', `No existe el usuario ${cveUsuario} en XLab.`);
  }
  if (!user.activo) {
    throw codedError('XLAB_LINK_USER_INACTIVE', `El usuario ${user.nombre} esta inactivo en XLab.`);
  }
  return user;
};

/** Traduce el choque de UNIQUE a un mensaje que dice quien ocupa esa clave. */
const toConflictError = async (error: unknown, cveUsuario: number): Promise<unknown> => {
  const pgError = error as { code?: string; constraint?: string };
  if (pgError?.code !== '23505') {
    return error;
  }
  if (pgError.constraint !== CVE_UNIQUE_CONSTRAINT) {
    return codedError('XLAB_LINK_ALREADY_LINKED', 'Este colaborador ya esta vinculado a un usuario de XLab. Usa Cambiar.');
  }
  const { rows } = await pool.query<{ full_name: string | null }>(
    `SELECT COALESCE(e.full_name, u.full_name) AS full_name
       FROM public.xlab_user_links l
       JOIN public.users u ON u.id = l.user_id
       LEFT JOIN public.employees e ON e.user_id = l.user_id
      WHERE l.cve_usuario = $1`,
    [cveUsuario],
  );
  const holder = rows[0]?.full_name;
  return codedError(
    'XLAB_LINK_USER_TAKEN',
    holder ? `Ese usuario de XLab ya esta vinculado a ${holder}.` : 'Ese usuario de XLab ya esta vinculado a otro colaborador.',
  );
};

export const getEmployeeXlabLink = async (employeeId: number): Promise<EmployeeXlabLink> => {
  const userId = await getEmployeeUserId(employeeId);
  const empty: EmployeeXlabLink = { user_id: userId, cve_usuario: null, linked_at: null, linked_by_name: null, xlab_user: null, xlab_available: true };
  if (!userId) {
    return empty;
  }
  const { rows } = await pool.query<{ cve_usuario: number; linked_at: string; linked_by_name: string | null }>(
    `SELECT l.cve_usuario, l.linked_at, u.full_name AS linked_by_name
       FROM public.xlab_user_links l
       LEFT JOIN public.users u ON u.id = l.linked_by
      WHERE l.user_id = $1`,
    [userId],
  );
  const link = rows[0];
  if (!link) {
    return empty;
  }
  try {
    return { ...empty, ...link, xlab_user: await getXlabUser(link.cve_usuario) };
  } catch (error) {
    // El vinculo vive en DocSafe: se muestra aunque `xlab` no responda.
    if (error instanceof XlabUnavailableError) {
      return { ...empty, ...link, xlab_available: false };
    }
    throw error;
  }
};

/** Usuarios activos de XLab sin vinculo. Se filtra aqui porque la BD SQL_ASCII no compara acentos. */
export const listAvailableXlabUsers = async (search: string): Promise<XlabUser[]> => {
  const taken = await pool.query<{ cve_usuario: number }>('SELECT cve_usuario FROM public.xlab_user_links');
  const { rows } = await xlabQuery<XlabUserRow>(
    `SELECT ${USER_COLUMNS}
       FROM public.usuarios
      WHERE activo_usuario = 1 AND cve_usuario <> ALL($1::int[])`,
    [taken.rows.map((row) => row.cve_usuario)],
  );
  const needle = normalize(search);
  return rows
    .map(toXlabUser)
    .filter((user) => !needle || normalize(user.nombre).includes(needle) || String(user.cve_usuario) === needle)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
};

export const createEmployeeXlabLink = async (employeeId: number, cveUsuario: number, actorId: string): Promise<XlabLinkMutation> => {
  const userId = await requireEmployeeUserId(employeeId);
  await requireActiveXlabUser(cveUsuario);
  try {
    await pool.query('INSERT INTO public.xlab_user_links (user_id, cve_usuario, linked_by) VALUES ($1, $2, $3)', [userId, cveUsuario, actorId]);
  } catch (error) {
    throw await toConflictError(error, cveUsuario);
  }
  return { employee_id: employeeId, user_id: userId, cve_usuario: cveUsuario, previous_cve_usuario: null };
};

export const updateEmployeeXlabLink = async (employeeId: number, cveUsuario: number, actorId: string): Promise<XlabLinkMutation> => {
  const userId = await requireEmployeeUserId(employeeId);
  await requireActiveXlabUser(cveUsuario);
  try {
    const { rows } = await pool.query<{ previous_cve_usuario: number }>(
      `UPDATE public.xlab_user_links l
          SET cve_usuario = $2, linked_by = $3, linked_at = now()
         FROM (SELECT user_id, cve_usuario FROM public.xlab_user_links WHERE user_id = $1 FOR UPDATE) old
        WHERE l.user_id = old.user_id
        RETURNING old.cve_usuario AS previous_cve_usuario`,
      [userId, cveUsuario, actorId],
    );
    if (rows.length === 0) {
      throw codedError('XLAB_LINK_NOT_FOUND', 'Este colaborador no tiene vinculo con XLab.');
    }
    return { employee_id: employeeId, user_id: userId, cve_usuario: cveUsuario, previous_cve_usuario: rows[0]!.previous_cve_usuario };
  } catch (error) {
    throw await toConflictError(error, cveUsuario);
  }
};

export const deleteEmployeeXlabLink = async (employeeId: number): Promise<XlabLinkMutation> => {
  const userId = await requireEmployeeUserId(employeeId);
  const { rows } = await pool.query<{ cve_usuario: number }>(
    'DELETE FROM public.xlab_user_links WHERE user_id = $1 RETURNING cve_usuario',
    [userId],
  );
  if (rows.length === 0) {
    throw codedError('XLAB_LINK_NOT_FOUND', 'Este colaborador no tiene vinculo con XLab.');
  }
  return { employee_id: employeeId, user_id: userId, cve_usuario: rows[0]!.cve_usuario, previous_cve_usuario: rows[0]!.cve_usuario };
};
