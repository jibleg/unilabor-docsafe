import pool from '../config/db';

/**
 * Catalogos del Listado de personal autorizado (REH-REG-026):
 *   - niveles organizacionales (los rige el puesto: Gerencial / Supervision / Operativo)
 *   - niveles de autorizacion (se eligen al autorizar el REH-REG-003 de cada puesto)
 * Los niveles en uso no se borran: se desactivan.
 */

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

export interface RhOrganizationalLevel {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface RhAuthorizationLevel {
  id: number;
  level_no: number;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface OrganizationalLevelPayload {
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

export interface AuthorizationLevelPayload {
  level_no: number;
  name: string;
  description?: string | null;
  is_active?: boolean;
}

const mapOrganizational = (row: any): RhOrganizationalLevel => ({
  id: Number(row.id),
  code: String(row.code),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  sort_order: Number(row.sort_order ?? 0),
  is_active: Boolean(row.is_active),
});

const mapAuthorization = (row: any): RhAuthorizationLevel => ({
  id: Number(row.id),
  level_no: Number(row.level_no),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  is_active: Boolean(row.is_active),
});

const isUniqueViolation = (error: any): boolean => error?.code === '23505';

// --- Niveles organizacionales ------------------------------------------------

export const listOrganizationalLevels = async (includeInactive = false): Promise<RhOrganizationalLevel[]> => {
  const result = await pool.query(
    `SELECT id, code, name, description, sort_order, is_active FROM public.rh_organizational_levels
      ${includeInactive ? '' : 'WHERE is_active = TRUE'}
      ORDER BY sort_order ASC, name ASC;`,
  );
  return result.rows.map(mapOrganizational);
};

export const createOrganizationalLevel = async (payload: OrganizationalLevelPayload): Promise<RhOrganizationalLevel> => {
  try {
    const result = await pool.query(
      `INSERT INTO public.rh_organizational_levels (code, name, description, sort_order, is_active)
       VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.rh_organizational_levels)), $5)
       RETURNING id, code, name, description, sort_order, is_active;`,
      [payload.code.trim().toUpperCase(), payload.name.trim(), payload.description?.trim() || null, payload.sort_order ?? null, payload.is_active ?? true],
    );
    return mapOrganizational(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) return throwCoded('RH_ORG_LEVEL_CODE_TAKEN', 'Ya existe un nivel organizacional con esa clave.');
    throw error;
  }
};

export const updateOrganizationalLevel = async (id: number, payload: OrganizationalLevelPayload): Promise<RhOrganizationalLevel> => {
  if (payload.is_active === false) {
    const inUse = await pool.query(`SELECT COUNT(*)::int AS total FROM public.rh_positions WHERE organizational_level_id = $1 AND is_active = TRUE;`, [id]);
    if (Number(inUse.rows[0]?.total ?? 0) > 0) {
      return throwCoded('RH_ORG_LEVEL_IN_USE', `Hay ${inUse.rows[0].total} puestos activos con este nivel; cámbialos antes de desactivarlo.`);
    }
  }
  try {
    const result = await pool.query(
      `UPDATE public.rh_organizational_levels
          SET code = $2, name = $3, description = $4, sort_order = COALESCE($5, sort_order),
              is_active = COALESCE($6, is_active), updated_at = NOW()
        WHERE id = $1
        RETURNING id, code, name, description, sort_order, is_active;`,
      [id, payload.code.trim().toUpperCase(), payload.name.trim(), payload.description?.trim() || null, payload.sort_order ?? null, payload.is_active ?? null],
    );
    if (result.rows.length === 0) return throwCoded('RH_LEVEL_NOT_FOUND', 'El nivel indicado no existe.');
    return mapOrganizational(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) return throwCoded('RH_ORG_LEVEL_CODE_TAKEN', 'Ya existe un nivel organizacional con esa clave.');
    throw error;
  }
};

// --- Niveles de autorizacion -------------------------------------------------

export const listAuthorizationLevels = async (includeInactive = false): Promise<RhAuthorizationLevel[]> => {
  const result = await pool.query(
    `SELECT id, level_no, name, description, is_active FROM public.rh_authorization_levels
      ${includeInactive ? '' : 'WHERE is_active = TRUE'}
      ORDER BY level_no ASC;`,
  );
  return result.rows.map(mapAuthorization);
};

export const createAuthorizationLevel = async (payload: AuthorizationLevelPayload): Promise<RhAuthorizationLevel> => {
  try {
    const result = await pool.query(
      `INSERT INTO public.rh_authorization_levels (level_no, name, description, is_active)
       VALUES ($1, $2, $3, $4) RETURNING id, level_no, name, description, is_active;`,
      [payload.level_no, payload.name.trim(), payload.description?.trim() || null, payload.is_active ?? true],
    );
    return mapAuthorization(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) return throwCoded('RH_AUTH_LEVEL_NO_TAKEN', 'Ya existe un nivel de autorización con ese número.');
    throw error;
  }
};

export const updateAuthorizationLevel = async (id: number, payload: AuthorizationLevelPayload): Promise<RhAuthorizationLevel> => {
  try {
    const result = await pool.query(
      `UPDATE public.rh_authorization_levels
          SET level_no = $2, name = $3, description = $4, is_active = COALESCE($5, is_active), updated_at = NOW()
        WHERE id = $1
        RETURNING id, level_no, name, description, is_active;`,
      [id, payload.level_no, payload.name.trim(), payload.description?.trim() || null, payload.is_active ?? null],
    );
    if (result.rows.length === 0) return throwCoded('RH_LEVEL_NOT_FOUND', 'El nivel indicado no existe.');
    return mapAuthorization(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) return throwCoded('RH_AUTH_LEVEL_NO_TAKEN', 'Ya existe un nivel de autorización con ese número.');
    throw error;
  }
};
