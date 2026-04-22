import pool from '../config/db';
import type { ModuleAccess, ModuleCode, UserRole } from '../types';

let modulesTableAvailable: boolean | null = null;
let userModuleRolesTableAvailable: boolean | null = null;

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

const normalizeModuleCode = (value: unknown): ModuleCode => {
  const normalizedValue = String(value ?? '').trim().toUpperCase();
  if (normalizedValue === 'RH' || normalizedValue === 'HELPDESK') {
    return normalizedValue;
  }

  return 'QUALITY';
};

const normalizeUserRole = (value: unknown): UserRole => {
  const normalizedValue = String(value ?? '').trim().toUpperCase();

  if (normalizedValue === 'ADMIN' || normalizedValue === 'EDITOR' || normalizedValue === 'VIEWER') {
    return normalizedValue;
  }

  return 'VIEWER';
};

const resolveTableAvailability = async (tableName: string): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS exists;`, [tableName]);
  return Boolean(result.rows[0]?.exists);
};

const resolveModulesTable = async (): Promise<boolean> => {
  if (modulesTableAvailable !== null) {
    return modulesTableAvailable;
  }

  modulesTableAvailable = await resolveTableAvailability('public.modules');
  return modulesTableAvailable;
};

const resolveUserModuleRolesTable = async (): Promise<boolean> => {
  if (userModuleRolesTableAvailable !== null) {
    return userModuleRolesTableAvailable;
  }

  userModuleRolesTableAvailable = await resolveTableAvailability('public.user_module_roles');
  return userModuleRolesTableAvailable;
};

const createLegacyQualityAccess = (role: unknown): ModuleAccess[] => [
  {
    code: 'QUALITY',
    name: 'Documentos de Calidad',
    description: 'Modulo institucional para gestion documental y control de calidad.',
    icon: 'shield-check',
    role: normalizeUserRole(role),
    is_active: true,
    sort_order: 10,
  },
];

export const listSystemModules = async (): Promise<ModuleAccess[]> => {
  const hasModulesTable = await resolveModulesTable();

  if (!hasModulesTable) {
    return createLegacyQualityAccess('ADMIN');
  }

  const query = `
    SELECT code, name, description, icon, is_active, sort_order
    FROM public.modules
    WHERE is_active = TRUE
    ORDER BY sort_order ASC, name ASC;
  `;

  const result = await pool.query(query);

  return result.rows.map((row) => ({
    code: normalizeModuleCode(row.code),
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    role: 'ADMIN',
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
  }));
};

export const listUserModuleAccess = async (
  userId: string,
  fallbackRole?: unknown,
): Promise<ModuleAccess[]> => {
  const [hasModulesTable, hasUserModuleRolesTable] = await Promise.all([
    resolveModulesTable(),
    resolveUserModuleRolesTable(),
  ]);

  if (!hasModulesTable || !hasUserModuleRolesTable) {
    return createLegacyQualityAccess(fallbackRole);
  }

  const query = `
    SELECT
      m.code,
      m.name,
      m.description,
      m.icon,
      m.is_active,
      m.sort_order,
      umr.role
    FROM public.user_module_roles umr
    INNER JOIN public.modules m ON m.id = umr.module_id
    WHERE umr.user_id = $1
      AND umr.is_active = TRUE
      AND m.is_active = TRUE
    ORDER BY m.sort_order ASC, m.name ASC;
  `;

  const result = await pool.query(query, [userId]);

  return result.rows.map((row) => ({
    code: normalizeModuleCode(row.code),
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    role: normalizeUserRole(row.role),
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
  }));
};

export const syncUserModuleAccess = async (
  client: Queryable,
  userId: string,
  moduleCodes: ModuleCode[],
  role: unknown,
): Promise<ModuleAccess[]> => {
  const [hasModulesTable, hasUserModuleRolesTable] = await Promise.all([
    resolveModulesTable(),
    resolveUserModuleRolesTable(),
  ]);

  if (!hasModulesTable || !hasUserModuleRolesTable) {
    return createLegacyQualityAccess(role);
  }

  const normalizedRole = normalizeUserRole(role);
  const normalizedCodes = Array.from(
    new Set(
      moduleCodes
        .map((moduleCode) => normalizeModuleCode(moduleCode))
        .filter((moduleCode): moduleCode is ModuleCode =>
          moduleCode === 'QUALITY' || moduleCode === 'RH' || moduleCode === 'HELPDESK',
        ),
    ),
  );

  const activeModulesResult = await client.query(
    `
      SELECT id, code, name, description, icon, is_active, sort_order
      FROM public.modules
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, name ASC;
    `,
  );

  const availableModules = activeModulesResult.rows.map((row) => ({
    id: Number(row.id),
    code: normalizeModuleCode(row.code),
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
  }));

  const selectedModules = availableModules.filter((moduleAccess) =>
    normalizedCodes.includes(moduleAccess.code),
  );

  if (selectedModules.length !== normalizedCodes.length) {
    const invalidModuleError = new Error('INVALID_MODULE_CODES');
    (invalidModuleError as any).code = 'INVALID_MODULE_CODES';
    throw invalidModuleError;
  }

  await client.query(
    `
      UPDATE public.user_module_roles
      SET is_active = FALSE, updated_at = NOW()
      WHERE user_id = $1;
    `,
    [userId],
  );

  if (selectedModules.length > 0) {
    const moduleIds = selectedModules.map((moduleAccess) => moduleAccess.id);

    await client.query(
      `
        INSERT INTO public.user_module_roles (user_id, module_id, role, is_active)
        SELECT $1, module_id, $3, TRUE
        FROM UNNEST($2::bigint[]) AS module_id
        ON CONFLICT (user_id, module_id) DO UPDATE
        SET role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW();
      `,
      [userId, moduleIds, normalizedRole],
    );
  }

  return selectedModules.map((moduleAccess) => ({
    code: moduleAccess.code,
    name: moduleAccess.name,
    description: moduleAccess.description,
    icon: moduleAccess.icon,
    role: normalizedRole,
    is_active: moduleAccess.is_active,
    sort_order: moduleAccess.sort_order,
  }));
};
