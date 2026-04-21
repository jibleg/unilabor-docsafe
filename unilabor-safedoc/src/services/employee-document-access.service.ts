import type { PoolClient } from 'pg';
import pool from '../config/db';
import type {
  DocumentSectionRecord,
  DocumentTypeRecord,
  EmployeeDocumentAccessMatrix,
  EmployeeDocumentAccessSection,
} from '../types';
import { registerAuditEvent } from './audit.service';

export interface EmployeeDocumentAccessPayload {
  section_ids: number[];
  document_type_ids: number[];
}

const accessTablesExist = async (): Promise<boolean> => {
  const result = await pool.query(`
    SELECT
      to_regclass('public.employee_document_section_access') IS NOT NULL AS has_section_access,
      to_regclass('public.employee_document_type_access') IS NOT NULL AS has_type_access;
  `);

  return Boolean(result.rows[0]?.has_section_access && result.rows[0]?.has_type_access);
};

const assertAccessTables = async () => {
  const exists = await accessTablesExist();
  if (!exists) {
    const error = new Error('EMPLOYEE_DOCUMENT_ACCESS_TABLES_NOT_AVAILABLE');
    (error as any).code = 'EMPLOYEE_DOCUMENT_ACCESS_TABLES_NOT_AVAILABLE';
    throw error;
  }
};

const mapSection = (row: any): DocumentSectionRecord => ({
  id: Number(row.section_id),
  code: String(row.section_code),
  name: String(row.section_name),
  description: row.section_description ? String(row.section_description) : null,
  is_active: Boolean(row.section_is_active),
  is_system_defined: Boolean(row.section_is_system_defined),
  sort_order: Number(row.section_sort_order ?? 0),
});

const mapDocumentType = (row: any): DocumentTypeRecord => ({
  id: Number(row.document_type_id),
  section_id: Number(row.section_id),
  code: row.document_type_code ? String(row.document_type_code) : null,
  name: String(row.document_type_name),
  description: row.document_type_description ? String(row.document_type_description) : null,
  is_required: Boolean(row.document_type_is_required),
  is_sensitive: Boolean(row.document_type_is_sensitive),
  has_expiry: Boolean(row.document_type_has_expiry),
  is_system_defined: Boolean(row.document_type_is_system_defined),
  is_active: Boolean(row.document_type_is_active),
  sort_order: Number(row.document_type_sort_order ?? 0),
});

const normalizeIds = (values: unknown[]): number[] =>
  [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  )];

export const initializeDefaultEmployeeDocumentAccess = async (
  employeeId: number,
  configuredByUserId?: string | null,
  client?: PoolClient,
): Promise<void> => {
  await assertAccessTables();

  const db = client ?? pool;

  await db.query(
    `
      INSERT INTO public.employee_document_section_access (
        employee_id,
        section_id,
        is_enabled,
        configured_by_user_id
      )
      SELECT $1, s.id, TRUE, $2
      FROM public.document_sections s
      WHERE s.is_active = TRUE
      ON CONFLICT (employee_id, section_id) DO NOTHING;
    `,
    [employeeId, configuredByUserId ?? null],
  );

  await db.query(
    `
      INSERT INTO public.employee_document_type_access (
        employee_id,
        document_type_id,
        is_enabled,
        configured_by_user_id
      )
      SELECT $1, dt.id, TRUE, $2
      FROM public.document_types dt
      INNER JOIN public.document_sections s ON s.id = dt.section_id
      WHERE dt.is_active = TRUE
        AND s.is_active = TRUE
      ON CONFLICT (employee_id, document_type_id) DO NOTHING;
    `,
    [employeeId, configuredByUserId ?? null],
  );
};

export const listEmployeeDocumentAccessMatrix = async (
  employeeId: number,
): Promise<EmployeeDocumentAccessMatrix> => {
  await assertAccessTables();
  await initializeDefaultEmployeeDocumentAccess(employeeId);

  const result = await pool.query(
    `
      SELECT
        s.id AS section_id,
        s.code AS section_code,
        s.name AS section_name,
        s.description AS section_description,
        s.is_active AS section_is_active,
        s.is_system_defined AS section_is_system_defined,
        s.sort_order AS section_sort_order,
        dt.id AS document_type_id,
        dt.code AS document_type_code,
        dt.name AS document_type_name,
        dt.description AS document_type_description,
        dt.is_required AS document_type_is_required,
        dt.is_sensitive AS document_type_is_sensitive,
        dt.has_expiry AS document_type_has_expiry,
        dt.is_system_defined AS document_type_is_system_defined,
        dt.is_active AS document_type_is_active,
        dt.sort_order AS document_type_sort_order,
        COALESCE(sa.is_enabled, TRUE) AS section_is_enabled,
        COALESCE(ta.is_enabled, TRUE) AS document_type_is_enabled
      FROM public.document_sections s
      INNER JOIN public.document_types dt
        ON dt.section_id = s.id
       AND dt.is_active = TRUE
      LEFT JOIN public.employee_document_section_access sa
        ON sa.employee_id = $1
       AND sa.section_id = s.id
      LEFT JOIN public.employee_document_type_access ta
        ON ta.employee_id = $1
       AND ta.document_type_id = dt.id
      WHERE s.is_active = TRUE
      ORDER BY s.sort_order ASC, s.name ASC, dt.sort_order ASC, dt.name ASC;
    `,
    [employeeId],
  );

  const sectionMap = new Map<number, EmployeeDocumentAccessSection>();

  for (const row of result.rows) {
    const section = sectionMap.get(Number(row.section_id)) ?? {
      section: mapSection(row),
      is_enabled: Boolean(row.section_is_enabled),
      document_types: [],
    };

    section.document_types.push({
      document_type: mapDocumentType(row),
      is_enabled: Boolean(row.section_is_enabled) && Boolean(row.document_type_is_enabled),
    });

    sectionMap.set(section.section.id, section);
  }

  const sections = Array.from(sectionMap.values());
  const enabledSectionIds = sections
    .filter((section) => section.is_enabled)
    .map((section) => section.section.id);
  const enabledDocumentTypeIds = sections.flatMap((section) =>
    section.document_types
      .filter((item) => item.is_enabled)
      .map((item) => item.document_type.id),
  );

  return {
    employee_id: employeeId,
    sections,
    enabled_section_ids: enabledSectionIds,
    enabled_document_type_ids: enabledDocumentTypeIds,
  };
};

export const updateEmployeeDocumentAccessMatrix = async (
  employeeId: number,
  payload: EmployeeDocumentAccessPayload,
  configuredByUserId?: string | null,
): Promise<EmployeeDocumentAccessMatrix> => {
  await assertAccessTables();

  const enabledSectionIds = normalizeIds(payload.section_ids);
  const enabledDocumentTypeIds = normalizeIds(payload.document_type_ids);
  const client = await pool.connect();
  let committed = false;

  try {
    await client.query('BEGIN');
    await initializeDefaultEmployeeDocumentAccess(employeeId, configuredByUserId, client);

    const activeTypesResult = await client.query(`
      SELECT dt.id, dt.section_id
      FROM public.document_types dt
      INNER JOIN public.document_sections s ON s.id = dt.section_id
      WHERE dt.is_active = TRUE
        AND s.is_active = TRUE;
    `);

    const activeTypeIds = new Set(activeTypesResult.rows.map((row) => Number(row.id)));
    const typeSectionMap = new Map<number, number>(
      activeTypesResult.rows.map((row) => [Number(row.id), Number(row.section_id)]),
    );

    const invalidTypeId = enabledDocumentTypeIds.find((typeId) => !activeTypeIds.has(typeId));
    if (invalidTypeId) {
      const error = new Error('DOCUMENT_TYPE_NOT_AVAILABLE_FOR_ACCESS');
      (error as any).code = 'DOCUMENT_TYPE_NOT_AVAILABLE_FOR_ACCESS';
      throw error;
    }

    const normalizedEnabledDocumentTypeIds = enabledDocumentTypeIds.filter((typeId) => {
      const sectionId = typeSectionMap.get(typeId);
      return sectionId ? enabledSectionIds.includes(sectionId) : false;
    });

    await client.query(
      `
        INSERT INTO public.employee_document_section_access (
          employee_id,
          section_id,
          is_enabled,
          configured_by_user_id
        )
        SELECT
          $1,
          s.id,
          s.id = ANY($2::bigint[]),
          $3
        FROM public.document_sections s
        WHERE s.is_active = TRUE
        ON CONFLICT (employee_id, section_id)
        DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled,
          configured_by_user_id = EXCLUDED.configured_by_user_id,
          updated_at = NOW();
      `,
      [employeeId, enabledSectionIds, configuredByUserId ?? null],
    );

    await client.query(
      `
        INSERT INTO public.employee_document_type_access (
          employee_id,
          document_type_id,
          is_enabled,
          configured_by_user_id
        )
        SELECT
          $1,
          dt.id,
          dt.id = ANY($2::bigint[]),
          $3
        FROM public.document_types dt
        INNER JOIN public.document_sections s ON s.id = dt.section_id
        WHERE dt.is_active = TRUE
          AND s.is_active = TRUE
        ON CONFLICT (employee_id, document_type_id)
        DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled,
          configured_by_user_id = EXCLUDED.configured_by_user_id,
          updated_at = NOW();
      `,
      [employeeId, normalizedEnabledDocumentTypeIds, configuredByUserId ?? null],
    );

    await client.query('COMMIT');
    committed = true;

    if (configuredByUserId) {
      await registerAuditEvent({
        user_id: configuredByUserId,
        action: `RH_EMPLOYEE_DOCUMENT_ACCESS_UPDATE:${employeeId}`,
        module_code: 'RH',
        entity_type: 'employee_document_access',
        entity_id: employeeId,
        employee_id: employeeId,
        metadata: {
          section_ids: enabledSectionIds,
          document_type_ids: normalizedEnabledDocumentTypeIds,
        },
      });
    }

    return listEmployeeDocumentAccessMatrix(employeeId);
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
};
