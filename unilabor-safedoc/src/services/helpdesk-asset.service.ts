import pool from '../config/db';

export interface HelpdeskCatalogItem {
  id: number;
  code?: string | undefined;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order?: number;
}

export interface HelpdeskAssetPayload {
  asset_code: string;
  name: string;
  description?: string | null;
  category_id?: number | null;
  unit_id?: number | null;
  area_id?: number | null;
  location_id?: number | null;
  brand_id?: number | null;
  brand_name?: string | null;
  model?: string | null;
  serial_number?: string | null;
  complementary_info?: string | null;
  purchase_modality_id?: number | null;
  purchase_condition_id?: number | null;
  assigned_employee_id?: number | null;
  responsible_employee_id?: number | null;
  criticality_id?: number | null;
  operational_status_id?: number | null;
  acquired_on?: string | null;
  warranty_expires_on?: string | null;
  inventory_legacy_code?: string | null;
  legacy_consecutive?: string | null;
  legacy_component_consecutive?: string | null;
  notes?: string | null;
}

export interface HelpdeskAssetRecord extends HelpdeskAssetPayload {
  id: number;
  is_active: boolean;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  category?: HelpdeskCatalogItem | null;
  unit?: HelpdeskCatalogItem | null;
  area?: HelpdeskCatalogItem | null;
  location?: HelpdeskCatalogItem | null;
  brand?: HelpdeskCatalogItem | null;
  purchase_modality?: HelpdeskCatalogItem | null;
  purchase_condition?: HelpdeskCatalogItem | null;
  criticality?: HelpdeskCatalogItem | null;
  operational_status?: HelpdeskCatalogItem | null;
  assigned_employee?: {
    id: number;
    employee_code: string;
    full_name: string;
    area: string | null;
    position: string | null;
  } | null;
  responsible_employee?: {
    id: number;
    employee_code: string;
    full_name: string;
    area: string | null;
    position: string | null;
  } | null;
}

export interface HelpdeskAssetSummary {
  assets: number;
  open_tickets: number;
  preventive_due: number;
  out_of_service: number;
}

export interface HelpdeskCatalogs {
  categories: HelpdeskCatalogItem[];
  units: HelpdeskCatalogItem[];
  areas: HelpdeskCatalogItem[];
  locations: HelpdeskCatalogItem[];
  brands: HelpdeskCatalogItem[];
  purchase_modalities: HelpdeskCatalogItem[];
  purchase_conditions: HelpdeskCatalogItem[];
  criticalities: HelpdeskCatalogItem[];
  operational_statuses: HelpdeskCatalogItem[];
}

const helpdeskAssetsTableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.helpdesk_assets') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const assertHelpdeskAssetsTable = async () => {
  const exists = await helpdeskAssetsTableExists();
  if (!exists) {
    const error = new Error('HELPDESK_ASSETS_TABLE_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_ASSETS_TABLE_NOT_AVAILABLE';
    throw error;
  }
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const mapCatalog = (
  id: unknown,
  name: unknown,
  code?: unknown,
  description?: unknown,
): HelpdeskCatalogItem | null => {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0 || typeof name !== 'string') {
    return null;
  }

  return {
    id: numericId,
    code: typeof code === 'string' ? code : undefined,
    name,
    description: typeof description === 'string' ? description : null,
    is_active: true,
  };
};

const mapEmployee = (row: any, prefix: 'assigned' | 'responsible') => {
  const id = Number(row[`${prefix}_employee_id`]);
  const fullName = row[`${prefix}_employee_name`];

  if (!Number.isFinite(id) || id <= 0 || typeof fullName !== 'string') {
    return null;
  }

  return {
    id,
    employee_code: String(row[`${prefix}_employee_code`] ?? ''),
    full_name: fullName,
    area: row[`${prefix}_employee_area`] ? String(row[`${prefix}_employee_area`]) : null,
    position: row[`${prefix}_employee_position`] ? String(row[`${prefix}_employee_position`]) : null,
  };
};

const mapAssetRow = (row: any): HelpdeskAssetRecord => ({
  id: Number(row.id),
  asset_code: String(row.asset_code),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  category_id: row.category_id ? Number(row.category_id) : null,
  unit_id: row.unit_id ? Number(row.unit_id) : null,
  area_id: row.area_id ? Number(row.area_id) : null,
  location_id: row.location_id ? Number(row.location_id) : null,
  brand_id: row.brand_id ? Number(row.brand_id) : null,
  brand_name: row.brand_name ? String(row.brand_name) : null,
  model: row.model ? String(row.model) : null,
  serial_number: row.serial_number ? String(row.serial_number) : null,
  complementary_info: row.complementary_info ? String(row.complementary_info) : null,
  purchase_modality_id: row.purchase_modality_id ? Number(row.purchase_modality_id) : null,
  purchase_condition_id: row.purchase_condition_id ? Number(row.purchase_condition_id) : null,
  assigned_employee_id: row.assigned_employee_id ? Number(row.assigned_employee_id) : null,
  responsible_employee_id: row.responsible_employee_id ? Number(row.responsible_employee_id) : null,
  criticality_id: row.criticality_id ? Number(row.criticality_id) : null,
  operational_status_id: row.operational_status_id ? Number(row.operational_status_id) : null,
  acquired_on: row.acquired_on ? String(row.acquired_on) : null,
  warranty_expires_on: row.warranty_expires_on ? String(row.warranty_expires_on) : null,
  inventory_legacy_code: row.inventory_legacy_code ? String(row.inventory_legacy_code) : null,
  legacy_consecutive: row.legacy_consecutive ? String(row.legacy_consecutive) : null,
  legacy_component_consecutive: row.legacy_component_consecutive ? String(row.legacy_component_consecutive) : null,
  notes: row.notes ? String(row.notes) : null,
  is_active: Boolean(row.is_active),
  created_at: row.created_at ? String(row.created_at) : undefined,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
  category: mapCatalog(row.category_id, row.category_name, row.category_code, row.category_description),
  unit: mapCatalog(row.unit_id, row.unit_name, row.unit_code, row.unit_description),
  area: mapCatalog(row.area_id, row.area_name, row.area_code, row.area_description),
  location: mapCatalog(row.location_id, row.location_name, row.location_code, row.location_description),
  brand: mapCatalog(row.brand_id, row.brand_name),
  purchase_modality: mapCatalog(
    row.purchase_modality_id,
    row.purchase_modality_name,
    row.purchase_modality_code,
    row.purchase_modality_description,
  ),
  purchase_condition: mapCatalog(
    row.purchase_condition_id,
    row.purchase_condition_name,
    row.purchase_condition_code,
    row.purchase_condition_description,
  ),
  criticality: mapCatalog(row.criticality_id, row.criticality_name, row.criticality_code, row.criticality_description),
  operational_status: mapCatalog(
    row.operational_status_id,
    row.operational_status_name,
    row.operational_status_code,
    row.operational_status_description,
  ),
  assigned_employee: mapEmployee(row, 'assigned'),
  responsible_employee: mapEmployee(row, 'responsible'),
});

const buildAssetQuery = () => `
  SELECT
    a.*,
    c.code AS category_code,
    c.name AS category_name,
    c.description AS category_description,
    u.code AS unit_code,
    u.name AS unit_name,
    u.description AS unit_description,
    ar.code AS area_code,
    ar.name AS area_name,
    ar.description AS area_description,
    l.code AS location_code,
    l.name AS location_name,
    l.description AS location_description,
    b.name AS brand_name,
    pm.code AS purchase_modality_code,
    pm.name AS purchase_modality_name,
    pm.description AS purchase_modality_description,
    pc.code AS purchase_condition_code,
    pc.name AS purchase_condition_name,
    pc.description AS purchase_condition_description,
    cr.code AS criticality_code,
    cr.name AS criticality_name,
    cr.description AS criticality_description,
    os.code AS operational_status_code,
    os.name AS operational_status_name,
    os.description AS operational_status_description,
    ae.employee_code AS assigned_employee_code,
    ae.full_name AS assigned_employee_name,
    ae.area AS assigned_employee_area,
    ae.position AS assigned_employee_position,
    re.employee_code AS responsible_employee_code,
    re.full_name AS responsible_employee_name,
    re.area AS responsible_employee_area,
    re.position AS responsible_employee_position
  FROM public.helpdesk_assets a
  LEFT JOIN public.helpdesk_asset_categories c ON c.id = a.category_id
  LEFT JOIN public.helpdesk_asset_units u ON u.id = a.unit_id
  LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = a.area_id
  LEFT JOIN public.helpdesk_locations l ON l.id = a.location_id
  LEFT JOIN public.helpdesk_asset_brands b ON b.id = a.brand_id
  LEFT JOIN public.helpdesk_purchase_modalities pm ON pm.id = a.purchase_modality_id
  LEFT JOIN public.helpdesk_purchase_conditions pc ON pc.id = a.purchase_condition_id
  LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id
  LEFT JOIN public.helpdesk_operational_statuses os ON os.id = a.operational_status_id
  LEFT JOIN public.employees ae ON ae.id = a.assigned_employee_id
  LEFT JOIN public.employees re ON re.id = a.responsible_employee_id
`;

const listCatalog = async (
  tableName: string,
  options?: { hasCode?: boolean; hasDescription?: boolean },
): Promise<HelpdeskCatalogItem[]> => {
  const hasCode = options?.hasCode ?? true;
  const hasDescription = options?.hasDescription ?? true;
  const codeProjection = hasCode ? 'code,' : 'NULL AS code,';
  const descriptionProjection = hasDescription ? 'description,' : 'NULL AS description,';
  const sortProjection = hasCode ? 'sort_order' : '0 AS sort_order';
  const result = await pool.query(`
    SELECT id, ${codeProjection} name, ${descriptionProjection} is_active, ${sortProjection}
    FROM public.${tableName}
    WHERE is_active = TRUE
    ORDER BY ${hasCode ? 'sort_order ASC,' : ''} name ASC;
  `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    code: row.code ? String(row.code) : undefined,
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
  }));
};

const ensureBrand = async (brandName: string | null | undefined): Promise<number | null> => {
  const normalizedName = normalizeOptionalText(brandName);
  if (!normalizedName) {
    return null;
  }

  const existingResult = await pool.query(
    `
      SELECT id
      FROM public.helpdesk_asset_brands
      WHERE UPPER(name) = UPPER($1)
      LIMIT 1;
    `,
    [normalizedName],
  );

  if (existingResult.rows[0]?.id) {
    await pool.query(
      `
        UPDATE public.helpdesk_asset_brands
        SET is_active = TRUE, updated_at = NOW()
        WHERE id = $1;
      `,
      [existingResult.rows[0].id],
    );

    return Number(existingResult.rows[0].id);
  }

  const result = await pool.query(
    `
      INSERT INTO public.helpdesk_asset_brands (name)
      VALUES ($1)
      RETURNING id;
    `,
    [normalizedName],
  );

  return Number(result.rows[0]?.id);
};

const recordAssetHistory = async (
  assetId: number,
  action: string,
  summary: string,
  userId?: string | null,
  previousValues?: unknown,
  newValues?: unknown,
) => {
  await pool.query(
    `
      INSERT INTO public.helpdesk_asset_history (
        asset_id,
        action,
        summary,
        previous_values,
        new_values,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6);
    `,
    [assetId, action, summary, previousValues ?? null, newValues ?? null, userId ?? null],
  );
};

const getActiveStatusId = async (): Promise<number | null> => {
  const result = await pool.query(`
    SELECT id
    FROM public.helpdesk_operational_statuses
    WHERE UPPER(code) = 'OPERATIONAL'
    LIMIT 1;
  `);

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

export const listHelpdeskCatalogs = async (): Promise<HelpdeskCatalogs> => {
  await assertHelpdeskAssetsTable();

  const [
    categories,
    units,
    areas,
    locations,
    brands,
    purchaseModalities,
    purchaseConditions,
    criticalities,
    operationalStatuses,
  ] = await Promise.all([
    listCatalog('helpdesk_asset_categories'),
    listCatalog('helpdesk_asset_units'),
    listCatalog('helpdesk_asset_areas'),
    listCatalog('helpdesk_locations'),
    listCatalog('helpdesk_asset_brands', { hasCode: false, hasDescription: false }),
    listCatalog('helpdesk_purchase_modalities'),
    listCatalog('helpdesk_purchase_conditions'),
    listCatalog('helpdesk_criticalities'),
    listCatalog('helpdesk_operational_statuses'),
  ]);

  return {
    categories,
    units,
    areas,
    locations,
    brands,
    purchase_modalities: purchaseModalities,
    purchase_conditions: purchaseConditions,
    criticalities,
    operational_statuses: operationalStatuses,
  };
};

export const getHelpdeskSummary = async (): Promise<HelpdeskAssetSummary> => {
  const exists = await helpdeskAssetsTableExists();
  if (!exists) {
    return {
      assets: 0,
      open_tickets: 0,
      preventive_due: 0,
      out_of_service: 0,
    };
  }

  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE a.is_active = TRUE)::int AS assets,
      COUNT(*) FILTER (
        WHERE a.is_active = TRUE AND UPPER(COALESCE(os.code, '')) = 'OUT_OF_SERVICE'
      )::int AS out_of_service
    FROM public.helpdesk_assets a
    LEFT JOIN public.helpdesk_operational_statuses os ON os.id = a.operational_status_id;
  `);

  return {
    assets: Number(result.rows[0]?.assets ?? 0),
    open_tickets: 0,
    preventive_due: 0,
    out_of_service: Number(result.rows[0]?.out_of_service ?? 0),
  };
};

export const listHelpdeskAssets = async (): Promise<HelpdeskAssetRecord[]> => {
  await assertHelpdeskAssetsTable();

  const result = await pool.query(`
    ${buildAssetQuery()}
    WHERE a.is_active = TRUE
    ORDER BY a.updated_at DESC, a.name ASC;
  `);

  return result.rows.map(mapAssetRow);
};

export const listHelpdeskAssetsByEmployee = async (employeeId: number): Promise<HelpdeskAssetRecord[]> => {
  await assertHelpdeskAssetsTable();

  const result = await pool.query(
    `
      ${buildAssetQuery()}
      WHERE a.is_active = TRUE
        AND (
          a.assigned_employee_id = $1
          OR a.responsible_employee_id = $1
        )
      ORDER BY a.updated_at DESC, a.name ASC;
    `,
    [employeeId],
  );

  return result.rows.map(mapAssetRow);
};

export const employeeCanAccessHelpdeskAsset = async (
  employeeId: number,
  assetId: number,
): Promise<boolean> => {
  await assertHelpdeskAssetsTable();

  const result = await pool.query(
    `
      SELECT 1
      FROM public.helpdesk_assets
      WHERE id = $1
        AND is_active = TRUE
        AND (
          assigned_employee_id = $2
          OR responsible_employee_id = $2
        )
      LIMIT 1;
    `,
    [assetId, employeeId],
  );

  return result.rows.length > 0;
};

export const getHelpdeskAssetById = async (assetId: number): Promise<HelpdeskAssetRecord | null> => {
  await assertHelpdeskAssetsTable();

  const result = await pool.query(
    `
      ${buildAssetQuery()}
      WHERE a.id = $1
      LIMIT 1;
    `,
    [assetId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapAssetRow(result.rows[0]);
};

export const createHelpdeskAsset = async (
  payload: HelpdeskAssetPayload,
  userId?: string | null,
): Promise<HelpdeskAssetRecord> => {
  await assertHelpdeskAssetsTable();

  const brandId = payload.brand_id ?? await ensureBrand(payload.brand_name);
  const defaultStatusId = payload.operational_status_id ?? await getActiveStatusId();

  const result = await pool.query(
    `
      INSERT INTO public.helpdesk_assets (
        asset_code,
        name,
        description,
        category_id,
        unit_id,
        area_id,
        location_id,
        brand_id,
        model,
        serial_number,
        complementary_info,
        purchase_modality_id,
        purchase_condition_id,
        assigned_employee_id,
        responsible_employee_id,
        criticality_id,
        operational_status_id,
        acquired_on,
        warranty_expires_on,
        inventory_legacy_code,
        legacy_consecutive,
        legacy_component_consecutive,
        notes,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $24
      )
      RETURNING id;
    `,
    [
      payload.asset_code.trim(),
      payload.name.trim(),
      normalizeOptionalText(payload.description),
      payload.category_id ?? null,
      payload.unit_id ?? null,
      payload.area_id ?? null,
      payload.location_id ?? null,
      brandId,
      normalizeOptionalText(payload.model),
      normalizeOptionalText(payload.serial_number),
      normalizeOptionalText(payload.complementary_info),
      payload.purchase_modality_id ?? null,
      payload.purchase_condition_id ?? null,
      payload.assigned_employee_id ?? null,
      payload.responsible_employee_id ?? null,
      payload.criticality_id ?? null,
      defaultStatusId,
      normalizeOptionalText(payload.acquired_on),
      normalizeOptionalText(payload.warranty_expires_on),
      normalizeOptionalText(payload.inventory_legacy_code),
      normalizeOptionalText(payload.legacy_consecutive),
      normalizeOptionalText(payload.legacy_component_consecutive),
      normalizeOptionalText(payload.notes),
      userId ?? null,
    ],
  );

  const assetId = Number(result.rows[0]?.id);
  await recordAssetHistory(assetId, 'CREATE', 'Activo creado en inventario tecnico.', userId, null, payload);

  const created = await getHelpdeskAssetById(assetId);
  if (!created) {
    const error = new Error('HELPDESK_ASSET_CREATION_FAILED');
    (error as any).code = 'HELPDESK_ASSET_CREATION_FAILED';
    throw error;
  }

  return created;
};

export const updateHelpdeskAsset = async (
  assetId: number,
  payload: HelpdeskAssetPayload,
  userId?: string | null,
): Promise<HelpdeskAssetRecord | null> => {
  await assertHelpdeskAssetsTable();

  const current = await getHelpdeskAssetById(assetId);
  if (!current) {
    return null;
  }

  const brandId = payload.brand_id ?? await ensureBrand(payload.brand_name);

  await pool.query(
    `
      UPDATE public.helpdesk_assets
      SET
        asset_code = $1,
        name = $2,
        description = $3,
        category_id = $4,
        unit_id = $5,
        area_id = $6,
        location_id = $7,
        brand_id = $8,
        model = $9,
        serial_number = $10,
        complementary_info = $11,
        purchase_modality_id = $12,
        purchase_condition_id = $13,
        assigned_employee_id = $14,
        responsible_employee_id = $15,
        criticality_id = $16,
        operational_status_id = $17,
        acquired_on = $18,
        warranty_expires_on = $19,
        inventory_legacy_code = $20,
        legacy_consecutive = $21,
        legacy_component_consecutive = $22,
        notes = $23,
        updated_by_user_id = $24,
        updated_at = NOW()
      WHERE id = $25;
    `,
    [
      payload.asset_code.trim(),
      payload.name.trim(),
      normalizeOptionalText(payload.description),
      payload.category_id ?? null,
      payload.unit_id ?? null,
      payload.area_id ?? null,
      payload.location_id ?? null,
      brandId,
      normalizeOptionalText(payload.model),
      normalizeOptionalText(payload.serial_number),
      normalizeOptionalText(payload.complementary_info),
      payload.purchase_modality_id ?? null,
      payload.purchase_condition_id ?? null,
      payload.assigned_employee_id ?? null,
      payload.responsible_employee_id ?? null,
      payload.criticality_id ?? null,
      payload.operational_status_id ?? null,
      normalizeOptionalText(payload.acquired_on),
      normalizeOptionalText(payload.warranty_expires_on),
      normalizeOptionalText(payload.inventory_legacy_code),
      normalizeOptionalText(payload.legacy_consecutive),
      normalizeOptionalText(payload.legacy_component_consecutive),
      normalizeOptionalText(payload.notes),
      userId ?? null,
      assetId,
    ],
  );

  await recordAssetHistory(assetId, 'UPDATE', 'Activo actualizado.', userId, current, payload);
  return getHelpdeskAssetById(assetId);
};

export const deactivateHelpdeskAsset = async (
  assetId: number,
  userId?: string | null,
): Promise<HelpdeskAssetRecord | null> => {
  await assertHelpdeskAssetsTable();

  const current = await getHelpdeskAssetById(assetId);
  if (!current) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.helpdesk_assets
      SET is_active = FALSE, updated_by_user_id = $1, updated_at = NOW()
      WHERE id = $2;
    `,
    [userId ?? null, assetId],
  );

  await recordAssetHistory(assetId, 'DEACTIVATE', 'Activo dado de baja logica.', userId, current, {
    is_active: false,
  });

  return getHelpdeskAssetById(assetId);
};
