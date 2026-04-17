import pool from '../config/db';
import type { ModuleAccess, ModuleCode, UserRole } from '../types';

let modulesTableAvailable: boolean | null = null;
let userModuleRolesTableAvailable: boolean | null = null;

const normalizeModuleCode = (value: unknown): ModuleCode => {
  const normalizedValue = String(value ?? '').trim().toUpperCase();
  return normalizedValue === 'RH' ? 'RH' : 'QUALITY';
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
