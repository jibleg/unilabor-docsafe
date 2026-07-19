import pool from '../config/db';
import type { ModuleAccess, ModuleCode, UserRole } from '../types';

// -----------------------------------------------------------------------------
// Resolver RBAC. Lee las tablas roles/permissions/role_permissions/user_roles y
// calcula los permisos efectivos y los modulos accesibles (con rol efectivo
// derivado) de un usuario. Unica fuente de verdad de autorizacion tras la
// Fase 5: alimenta requirePermission, el login (permissions + availableModules)
// y GET /auth/me/access. El modelo legacy user_module_roles fue deprecado.
// -----------------------------------------------------------------------------

export interface UserAccessSnapshot {
  permissions: string[];
  modules: ModuleAccess[];
}

interface CachedSnapshot {
  snapshot: UserAccessSnapshot;
  expiresAt: number;
}

// Cache en memoria por usuario con TTL corto: evita golpear la BD en cada
// request sin dejar los permisos "stale" mas alla de unos segundos.
const SNAPSHOT_TTL_MS = 30_000;
const snapshotCache = new Map<string, CachedSnapshot>();

let rbacTablesAvailable: boolean | null = null;

const resolveRbacTables = async (): Promise<boolean> => {
  if (rbacTablesAvailable !== null) {
    return rbacTablesAvailable;
  }

  const result = await pool.query(
    `SELECT
       to_regclass('public.user_roles') IS NOT NULL
       AND to_regclass('public.role_permissions') IS NOT NULL
       AND to_regclass('public.permissions') IS NOT NULL
       AND to_regclass('public.roles') IS NOT NULL AS exists;`,
  );

  rbacTablesAvailable = Boolean(result.rows[0]?.exists);
  return rbacTablesAvailable;
};

// El frontend legacy consume ModuleAccess.role. Derivamos un rol efectivo por
// modulo desde las acciones concedidas para mantener compatibilidad mientras
// se migra a permisos por accion (Fase 2/3). Precedencia por accion:
//   MANAGE/DELETE -> ADMIN, WRITE -> EDITOR, resto (READ/SELF/...) -> VIEWER.
const deriveModuleRole = (actions: Set<string>): UserRole => {
  if (actions.has('MANAGE') || actions.has('DELETE')) {
    return 'ADMIN';
  }
  if (actions.has('WRITE')) {
    return 'EDITOR';
  }
  return 'VIEWER';
};

const buildSnapshot = async (userId: string): Promise<UserAccessSnapshot> => {
  const hasRbacTables = await resolveRbacTables();

  if (!hasRbacTables) {
    return { permissions: [], modules: [] };
  }

  const query = `
    SELECT
      p.code AS permission_code,
      p.action AS action,
      m.code AS module_code,
      m.name AS module_name,
      m.description AS module_description,
      m.icon AS module_icon,
      m.is_active AS module_is_active,
      m.sort_order AS module_sort_order
    FROM public.user_roles ur
    INNER JOIN public.roles r ON r.id = ur.role_id AND r.is_active = TRUE
    INNER JOIN public.role_permissions rp ON rp.role_id = r.id
    INNER JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active = TRUE
    LEFT JOIN public.modules m ON m.id = p.module_id
    WHERE ur.user_id = $1
      AND ur.is_active = TRUE;
  `;

  const result = await pool.query(query, [userId]);

  const permissions = new Set<string>();
  const moduleActions = new Map<string, Set<string>>();
  const moduleMeta = new Map<
    string,
    { name: string; description: string | null; icon: string | null; sort_order: number }
  >();

  for (const row of result.rows) {
    const code = String(row.permission_code ?? '').toUpperCase();
    if (code) {
      permissions.add(code);
    }

    // Solo derivamos modulos accesibles desde permisos con modulo activo.
    if (!row.module_code || row.module_is_active === false) {
      continue;
    }

    const moduleCode = String(row.module_code).toUpperCase();
    const action = String(row.action ?? '').toUpperCase();

    if (!moduleActions.has(moduleCode)) {
      moduleActions.set(moduleCode, new Set<string>());
    }
    if (action) {
      moduleActions.get(moduleCode)!.add(action);
    }

    if (!moduleMeta.has(moduleCode)) {
      moduleMeta.set(moduleCode, {
        name: String(row.module_name ?? ''),
        description: row.module_description ? String(row.module_description) : null,
        icon: row.module_icon ? String(row.module_icon) : null,
        sort_order: Number(row.module_sort_order ?? 0),
      });
    }
  }

  const modules: ModuleAccess[] = Array.from(moduleMeta.entries())
    .map(([moduleCode, meta]) => ({
      code: moduleCode as ModuleCode,
      name: meta.name,
      description: meta.description,
      icon: meta.icon,
      role: deriveModuleRole(moduleActions.get(moduleCode) ?? new Set<string>()),
      is_active: true,
      sort_order: meta.sort_order,
    }))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

  return { permissions: Array.from(permissions).sort(), modules };
};

export const getUserAccessSnapshot = async (userId: string): Promise<UserAccessSnapshot> => {
  const cached = snapshotCache.get(userId);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.snapshot;
  }

  const snapshot = await buildSnapshot(userId);
  snapshotCache.set(userId, { snapshot, expiresAt: now + SNAPSHOT_TTL_MS });
  return snapshot;
};

export const getUserPermissionCodes = async (userId: string): Promise<Set<string>> => {
  const snapshot = await getUserAccessSnapshot(userId);
  return new Set(snapshot.permissions);
};

export const getUserAccessibleModules = async (userId: string): Promise<ModuleAccess[]> => {
  const snapshot = await getUserAccessSnapshot(userId);
  return snapshot.modules;
};

// Invalida el cache de un usuario (o de todos). Debe llamarse al cambiar sus
// roles/permisos (Fase 4) para que el cambio aplique sin esperar el TTL.
export const invalidateUserPermissions = (userId?: string): void => {
  if (userId) {
    snapshotCache.delete(userId);
    return;
  }
  snapshotCache.clear();
};
