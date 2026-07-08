import pool from '../config/db';

// Estructura organizacional del inventario: relaciones muchos-a-muchos entre
// Unidades <-> Areas y Areas <-> Responsables (usuarios). Se apoya en las tablas
// puente helpdesk_unit_areas y helpdesk_area_responsibles (migracion 20260707_01).

export interface OrgUnit {
  id: number;
  code?: string | undefined;
  name: string;
}

export interface OrgArea {
  id: number;
  code?: string | undefined;
  name: string;
  unit_ids: number[];
  responsible_user_ids: string[];
}

export interface OrgUser {
  id: string;
  full_name: string;
  email: string;
}

export interface HelpdeskOrgStructure {
  units: OrgUnit[];
  areas: OrgArea[];
  users: OrgUser[];
}

const orgTablesExist = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.helpdesk_unit_areas') IS NOT NULL
        AND to_regclass('public.helpdesk_area_responsibles') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertOrgTables = async (): Promise<void> => {
  if (!(await orgTablesExist())) {
    const error = new Error('HELPDESK_ORG_TABLES_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_ORG_TABLES_NOT_AVAILABLE';
    throw error;
  }
};

const assertCatalogRow = async (
  table: 'helpdesk_asset_units' | 'helpdesk_asset_areas',
  id: number,
): Promise<void> => {
  const result = await pool.query(
    `SELECT 1 FROM public.${table} WHERE id = $1 AND is_active = TRUE LIMIT 1;`,
    [id],
  );
  if (result.rows.length === 0) {
    const error = new Error('HELPDESK_ORG_REFERENCE_NOT_FOUND');
    (error as any).code = 'HELPDESK_ORG_REFERENCE_NOT_FOUND';
    throw error;
  }
};

export const getHelpdeskOrgStructure = async (): Promise<HelpdeskOrgStructure> => {
  await assertOrgTables();

  const [unitsResult, areasResult, usersResult] = await Promise.all([
    pool.query(
      `SELECT id, code, name
         FROM public.helpdesk_asset_units
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, name ASC;`,
    ),
    pool.query(
      `SELECT
          ar.id,
          ar.code,
          ar.name,
          COALESCE(
            ARRAY(
              SELECT ua.unit_id FROM public.helpdesk_unit_areas ua WHERE ua.area_id = ar.id
            ),
            '{}'
          ) AS unit_ids,
          COALESCE(
            ARRAY(
              SELECT rp.user_id FROM public.helpdesk_area_responsibles rp WHERE rp.area_id = ar.id
            ),
            '{}'
          ) AS responsible_user_ids
         FROM public.helpdesk_asset_areas ar
        WHERE ar.is_active = TRUE
        ORDER BY ar.sort_order ASC, ar.name ASC;`,
    ),
    pool.query(
      `SELECT id, full_name, email
         FROM public.users
        WHERE is_active = TRUE
        ORDER BY full_name ASC;`,
    ),
  ]);

  return {
    units: unitsResult.rows.map((row) => ({
      id: Number(row.id),
      code: row.code ? String(row.code) : undefined,
      name: String(row.name),
    })),
    areas: areasResult.rows.map((row) => ({
      id: Number(row.id),
      code: row.code ? String(row.code) : undefined,
      name: String(row.name),
      unit_ids: (row.unit_ids ?? []).map((value: unknown) => Number(value)),
      responsible_user_ids: (row.responsible_user_ids ?? []).map((value: unknown) => String(value)),
    })),
    users: usersResult.rows.map((row) => ({
      id: String(row.id),
      full_name: String(row.full_name ?? ''),
      email: String(row.email ?? ''),
    })),
  };
};

// Reemplaza el conjunto de areas asociadas a una unidad (borra las previas e
// inserta las nuevas) en una sola transaccion.
export const setUnitAreas = async (unitId: number, areaIds: number[]): Promise<number[]> => {
  await assertOrgTables();
  await assertCatalogRow('helpdesk_asset_units', unitId);

  const uniqueAreaIds = [...new Set(areaIds)];
  for (const areaId of uniqueAreaIds) {
    await assertCatalogRow('helpdesk_asset_areas', areaId);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM public.helpdesk_unit_areas WHERE unit_id = $1;', [unitId]);
    for (const areaId of uniqueAreaIds) {
      await client.query(
        `INSERT INTO public.helpdesk_unit_areas (unit_id, area_id)
         VALUES ($1, $2)
         ON CONFLICT (unit_id, area_id) DO NOTHING;`,
        [unitId, areaId],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return uniqueAreaIds;
};

// Reemplaza el conjunto de usuarios responsables de un area.
export const setAreaResponsibles = async (areaId: number, userIds: string[]): Promise<string[]> => {
  await assertOrgTables();
  await assertCatalogRow('helpdesk_asset_areas', areaId);

  const uniqueUserIds = [...new Set(userIds)];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM public.helpdesk_area_responsibles WHERE area_id = $1;', [areaId]);
    for (const userId of uniqueUserIds) {
      await client.query(
        `INSERT INTO public.helpdesk_area_responsibles (area_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (area_id, user_id) DO NOTHING;`,
        [areaId, userId],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return uniqueUserIds;
};
