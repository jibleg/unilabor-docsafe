import pool from '../config/db';
import { invalidateUserPermissions } from './permission.service';

// -----------------------------------------------------------------------------
// Administracion RBAC (Fase 4): CRUD de roles, edicion de permisos por rol y
// asignacion M:N de roles a usuarios. Incluye salvaguarda de "ultimo admin"
// para evitar quedarse sin nadie que pueda gestionar roles (ADMIN.ROLES.MANAGE).
// -----------------------------------------------------------------------------

const GUARD_PERMISSION = 'ADMIN.ROLES.MANAGE';

type Client = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
};

export class RoleAdminError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'RoleAdminError';
  }
}

export interface RoleSummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  module_code: string | null;
  is_system: boolean;
  is_active: boolean;
  permission_count: number;
  user_count: number;
}

export interface RoleDetail extends RoleSummary {
  permissions: string[];
}

export interface PermissionItem {
  id: number;
  code: string;
  resource: string;
  action: string;
  description: string | null;
  module_code: string | null;
}

// Cuenta cuantos usuarios activos conservan el permiso guardian. Se usa dentro
// de la transaccion (tras aplicar cambios) para abortar si llegaria a cero.
const countUsersWithGuardPermission = async (client: Client): Promise<number> => {
  const result = await client.query(
    `
      SELECT COUNT(DISTINCT ur.user_id)::int AS total
      FROM public.user_roles ur
      INNER JOIN public.roles r ON r.id = ur.role_id AND r.is_active = TRUE
      INNER JOIN public.role_permissions rp ON rp.role_id = r.id
      INNER JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active = TRUE
      WHERE ur.is_active = TRUE
        AND UPPER(p.code) = $1;
    `,
    [GUARD_PERMISSION],
  );
  return Number(result.rows[0]?.total ?? 0);
};

const assertGuardStillPresent = async (client: Client): Promise<void> => {
  const remaining = await countUsersWithGuardPermission(client);
  if (remaining < 1) {
    throw new RoleAdminError(
      409,
      'La operacion dejaria al sistema sin ningun usuario con permiso para administrar roles',
    );
  }
};

const resolvePermissionIds = async (client: Client, codes: string[]): Promise<number[]> => {
  if (codes.length === 0) {
    return [];
  }
  const normalized = Array.from(new Set(codes.map((code) => code.trim().toUpperCase())));
  const result = await client.query(
    `SELECT id, UPPER(code) AS code FROM public.permissions WHERE UPPER(code) = ANY($1::text[]);`,
    [normalized],
  );
  const found = new Map<string, number>(result.rows.map((row) => [String(row.code), Number(row.id)]));
  const missing = normalized.filter((code) => !found.has(code));
  if (missing.length > 0) {
    throw new RoleAdminError(400, `Permisos inexistentes: ${missing.join(', ')}`);
  }
  return normalized.map((code) => found.get(code)!);
};

export const listRoles = async (): Promise<RoleSummary[]> => {
  const result = await pool.query(`
    SELECT
      r.id, r.code, r.name, r.description, r.is_system, r.is_active,
      m.code AS module_code,
      (SELECT COUNT(*)::int FROM public.role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
      (SELECT COUNT(*)::int FROM public.user_roles ur WHERE ur.role_id = r.id AND ur.is_active = TRUE) AS user_count
    FROM public.roles r
    LEFT JOIN public.modules m ON m.id = r.module_id
    ORDER BY r.is_system DESC, m.sort_order NULLS LAST, r.name ASC;
  `);
  return result.rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    module_code: row.module_code ? String(row.module_code) : null,
    is_system: Boolean(row.is_system),
    is_active: Boolean(row.is_active),
    permission_count: Number(row.permission_count ?? 0),
    user_count: Number(row.user_count ?? 0),
  }));
};

export const getRoleDetail = async (roleId: number): Promise<RoleDetail> => {
  const roleResult = await pool.query(
    `
      SELECT
        r.id, r.code, r.name, r.description, r.is_system, r.is_active,
        m.code AS module_code,
        (SELECT COUNT(*)::int FROM public.role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
        (SELECT COUNT(*)::int FROM public.user_roles ur WHERE ur.role_id = r.id AND ur.is_active = TRUE) AS user_count
      FROM public.roles r
      LEFT JOIN public.modules m ON m.id = r.module_id
      WHERE r.id = $1;
    `,
    [roleId],
  );
  const row = roleResult.rows[0];
  if (!row) {
    throw new RoleAdminError(404, 'Rol no encontrado');
  }
  const permsResult = await pool.query(
    `
      SELECT UPPER(p.code) AS code
      FROM public.role_permissions rp
      INNER JOIN public.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = $1
      ORDER BY code;
    `,
    [roleId],
  );
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    module_code: row.module_code ? String(row.module_code) : null,
    is_system: Boolean(row.is_system),
    is_active: Boolean(row.is_active),
    permission_count: Number(row.permission_count ?? 0),
    user_count: Number(row.user_count ?? 0),
    permissions: permsResult.rows.map((permRow) => String(permRow.code)),
  };
};

export const listPermissions = async (): Promise<PermissionItem[]> => {
  const result = await pool.query(`
    SELECT p.id, UPPER(p.code) AS code, p.resource, p.action, p.description, m.code AS module_code
    FROM public.permissions p
    LEFT JOIN public.modules m ON m.id = p.module_id
    WHERE p.is_active = TRUE
    ORDER BY m.sort_order NULLS LAST, p.resource, p.action;
  `);
  return result.rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    resource: String(row.resource ?? ''),
    action: String(row.action ?? ''),
    description: row.description ? String(row.description) : null,
    module_code: row.module_code ? String(row.module_code) : null,
  }));
};

export const createRole = async (input: {
  code: string;
  name: string;
  description?: string | null;
  moduleCode?: string | null;
  permissionCodes: string[];
}): Promise<RoleDetail> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const code = input.code.trim().toUpperCase();
    const existing = await client.query(`SELECT 1 FROM public.roles WHERE UPPER(code) = $1;`, [code]);
    if ((existing.rowCount ?? 0) > 0) {
      throw new RoleAdminError(409, `Ya existe un rol con el codigo ${code}`);
    }

    let moduleId: number | null = null;
    if (input.moduleCode) {
      const moduleResult = await client.query(
        `SELECT id FROM public.modules WHERE UPPER(code) = $1;`,
        [input.moduleCode.trim().toUpperCase()],
      );
      if ((moduleResult.rowCount ?? 0) === 0) {
        throw new RoleAdminError(400, `Modulo inexistente: ${input.moduleCode}`);
      }
      moduleId = Number(moduleResult.rows[0].id);
    }

    const permissionIds = await resolvePermissionIds(client, input.permissionCodes);

    const inserted = await client.query(
      `
        INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
        VALUES ($1, $2, $3, $4, FALSE, TRUE)
        RETURNING id;
      `,
      [code, input.name.trim(), input.description?.trim() || null, moduleId],
    );
    const roleId = Number(inserted.rows[0].id);

    if (permissionIds.length > 0) {
      await client.query(
        `
          INSERT INTO public.role_permissions (role_id, permission_id)
          SELECT $1, permission_id FROM UNNEST($2::bigint[]) AS permission_id
          ON CONFLICT (role_id, permission_id) DO NOTHING;
        `,
        [roleId, permissionIds],
      );
    }

    await client.query('COMMIT');
    invalidateUserPermissions();
    return getRoleDetail(roleId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateRole = async (
  roleId: number,
  input: { name?: string; description?: string | null; isActive?: boolean },
): Promise<RoleDetail> => {
  const role = await pool.query(`SELECT id FROM public.roles WHERE id = $1;`, [roleId]);
  if ((role.rowCount ?? 0) === 0) {
    throw new RoleAdminError(404, 'Rol no encontrado');
  }
  await pool.query(
    `
      UPDATE public.roles
      SET name = COALESCE($2, name),
          description = CASE WHEN $3::boolean THEN $4 ELSE description END,
          is_active = COALESCE($5, is_active),
          updated_at = NOW()
      WHERE id = $1;
    `,
    [
      roleId,
      input.name?.trim() ?? null,
      input.description !== undefined,
      input.description?.trim() || null,
      input.isActive ?? null,
    ],
  );
  invalidateUserPermissions();
  return getRoleDetail(roleId);
};

export const setRolePermissions = async (
  roleId: number,
  permissionCodes: string[],
): Promise<RoleDetail> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const role = await client.query(`SELECT id FROM public.roles WHERE id = $1 FOR UPDATE;`, [roleId]);
    if ((role.rowCount ?? 0) === 0) {
      throw new RoleAdminError(404, 'Rol no encontrado');
    }

    const permissionIds = await resolvePermissionIds(client, permissionCodes);

    await client.query(`DELETE FROM public.role_permissions WHERE role_id = $1;`, [roleId]);
    if (permissionIds.length > 0) {
      await client.query(
        `
          INSERT INTO public.role_permissions (role_id, permission_id)
          SELECT $1, permission_id FROM UNNEST($2::bigint[]) AS permission_id;
        `,
        [roleId, permissionIds],
      );
    }

    await assertGuardStillPresent(client);
    await client.query('COMMIT');
    invalidateUserPermissions();
    return getRoleDetail(roleId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteRole = async (roleId: number): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const role = await client.query(
      `SELECT is_system FROM public.roles WHERE id = $1 FOR UPDATE;`,
      [roleId],
    );
    if ((role.rowCount ?? 0) === 0) {
      throw new RoleAdminError(404, 'Rol no encontrado');
    }
    if (Boolean(role.rows[0].is_system)) {
      throw new RoleAdminError(409, 'No se puede eliminar un rol de sistema');
    }

    await client.query(`DELETE FROM public.roles WHERE id = $1;`, [roleId]);

    await assertGuardStillPresent(client);
    await client.query('COMMIT');
    invalidateUserPermissions();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// --- Vista centrada en el rol: que usuarios lo tienen ---
export const listRoleUserIds = async (roleId: number): Promise<string[]> => {
  const result = await pool.query(
    `SELECT user_id FROM public.user_roles WHERE role_id = $1 AND is_active = TRUE;`,
    [roleId],
  );
  return result.rows.map((row) => String(row.user_id));
};

// Reemplaza el conjunto de usuarios que tienen este rol (solo afecta a este
// rol; conserva los demas roles de cada usuario). Con salvaguarda de ultimo admin.
export const setRoleUsers = async (roleId: number, userIds: string[]): Promise<string[]> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const role = await client.query(`SELECT id FROM public.roles WHERE id = $1 FOR UPDATE;`, [roleId]);
    if ((role.rowCount ?? 0) === 0) {
      throw new RoleAdminError(404, 'Rol no encontrado');
    }

    const uniqueUserIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueUserIds.length > 0) {
      const valid = await client.query(
        `SELECT id::text AS id FROM public.users WHERE id::text = ANY($1::text[]);`,
        [uniqueUserIds],
      );
      if ((valid.rowCount ?? 0) !== uniqueUserIds.length) {
        throw new RoleAdminError(400, 'Uno o mas usuarios no existen');
      }
    }

    await client.query(`DELETE FROM public.user_roles WHERE role_id = $1;`, [roleId]);
    // Insercion fila por fila: user_id va como parametro unico para que Postgres
    // lo castee al tipo real de users.id (uuid) sin asumirlo en SQL.
    for (const userId of uniqueUserIds) {
      await client.query(
        `
          INSERT INTO public.user_roles (user_id, role_id, is_active)
          VALUES ($1, $2, TRUE)
          ON CONFLICT (user_id, role_id) DO UPDATE
          SET is_active = TRUE, updated_at = NOW();
        `,
        [userId, roleId],
      );
    }

    await assertGuardStillPresent(client);
    await client.query('COMMIT');
    invalidateUserPermissions();
    return listRoleUserIds(roleId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getUserRoleIds = async (userId: string): Promise<number[]> => {
  const result = await pool.query(
    `SELECT role_id FROM public.user_roles WHERE user_id = $1 AND is_active = TRUE ORDER BY role_id;`,
    [userId],
  );
  return result.rows.map((row) => Number(row.role_id));
};

export const setUserRoles = async (userId: string, roleIds: number[]): Promise<number[]> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(`SELECT id FROM public.users WHERE id = $1;`, [userId]);
    if ((userResult.rowCount ?? 0) === 0) {
      throw new RoleAdminError(404, 'Usuario no encontrado');
    }

    const uniqueRoleIds = Array.from(new Set(roleIds));
    if (uniqueRoleIds.length > 0) {
      const validRoles = await client.query(
        `SELECT id FROM public.roles WHERE id = ANY($1::bigint[]);`,
        [uniqueRoleIds],
      );
      if ((validRoles.rowCount ?? 0) !== uniqueRoleIds.length) {
        throw new RoleAdminError(400, 'Uno o mas roles no existen');
      }
    }

    await client.query(`DELETE FROM public.user_roles WHERE user_id = $1;`, [userId]);
    if (uniqueRoleIds.length > 0) {
      await client.query(
        `
          INSERT INTO public.user_roles (user_id, role_id, is_active)
          SELECT $1, role_id, TRUE FROM UNNEST($2::bigint[]) AS role_id;
        `,
        [userId, uniqueRoleIds],
      );
    }

    await assertGuardStillPresent(client);
    await client.query('COMMIT');
    invalidateUserPermissions(userId);
    return getUserRoleIds(userId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
