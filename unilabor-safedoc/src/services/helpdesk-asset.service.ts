import pool from '../config/db';
import { toIsoDate, toIsoDateTime } from '../utils/date-serialization';
import {
  PaginatedResult,
  PaginationInput,
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';

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
  // ISO 15189:2022 (6.4/6.5)
  supplier_id?: number | null;
  received_on?: string | null;
  placed_in_service_on?: string | null;
  receipt_condition_id?: number | null;
  decommissioned_on?: string | null;
  disposal_reason_id?: number | null;
  // Activo compuesto: el componente apunta a su activo "todo". NULL = whole (o plano).
  parent_asset_id?: number | null;
}

export interface HelpdeskAssetRecord extends HelpdeskAssetPayload {
  id: number;
  is_active: boolean;
  // Revision de carga masiva (eje independiente del estado operativo).
  review_status?: 'PENDING' | 'REVIEWED' | undefined;
  reviewed_at?: string | null | undefined;
  reviewed_by?: string | null | undefined;
  reviewed_by_name?: string | null | undefined;
  component_count?: number | undefined;
  parent?: { id: number; asset_code: string; name: string } | null | undefined;
  components?: HelpdeskAssetRecord[] | undefined;
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
  supplier?: HelpdeskCatalogItem | null;
  receipt_condition?: HelpdeskCatalogItem | null;
  disposal_reason?: HelpdeskCatalogItem | null;
  asset_code_overridden?: boolean;
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
  critical: number;
  assigned: number;
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
  suppliers: HelpdeskCatalogItem[];
  receipt_conditions: HelpdeskCatalogItem[];
  disposal_reasons: HelpdeskCatalogItem[];
  document_kinds: HelpdeskCatalogItem[];
  lifecycle_event_types: HelpdeskCatalogItem[];
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

export const mapAssetRow = (row: any): HelpdeskAssetRecord => ({
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
  acquired_on: row.acquired_on ? toIsoDate(row.acquired_on) : null,
  warranty_expires_on: row.warranty_expires_on ? toIsoDate(row.warranty_expires_on) : null,
  inventory_legacy_code: row.inventory_legacy_code ? String(row.inventory_legacy_code) : null,
  legacy_consecutive: row.legacy_consecutive ? String(row.legacy_consecutive) : null,
  legacy_component_consecutive: row.legacy_component_consecutive ? String(row.legacy_component_consecutive) : null,
  notes: row.notes ? String(row.notes) : null,
  supplier_id: row.supplier_id ? Number(row.supplier_id) : null,
  received_on: row.received_on ? toIsoDate(row.received_on) : null,
  placed_in_service_on: row.placed_in_service_on ? toIsoDate(row.placed_in_service_on) : null,
  receipt_condition_id: row.receipt_condition_id ? Number(row.receipt_condition_id) : null,
  decommissioned_on: row.decommissioned_on ? toIsoDate(row.decommissioned_on) : null,
  disposal_reason_id: row.disposal_reason_id ? Number(row.disposal_reason_id) : null,
  asset_code_overridden: Boolean(row.asset_code_overridden),
  review_status: String(row.review_status ?? 'PENDING') === 'REVIEWED' ? 'REVIEWED' : 'PENDING',
  reviewed_at: row.reviewed_at ? toIsoDateTime(row.reviewed_at) : null,
  reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
  reviewed_by_name: row.reviewed_by_name ? String(row.reviewed_by_name) : null,
  parent_asset_id: row.parent_asset_id ? Number(row.parent_asset_id) : null,
  component_count: row.component_count != null ? Number(row.component_count) : undefined,
  parent: row.parent_asset_id
    ? {
        id: Number(row.parent_asset_id),
        asset_code: String(row.parent_asset_code ?? ''),
        name: String(row.parent_asset_name ?? ''),
      }
    : null,
  is_active: Boolean(row.is_active),
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
  updated_at: row.updated_at ? toIsoDateTime(row.updated_at) : undefined,
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
  supplier: mapCatalog(row.supplier_id, row.supplier_name, undefined, row.supplier_description),
  receipt_condition: mapCatalog(
    row.receipt_condition_id,
    row.receipt_condition_name,
    row.receipt_condition_code,
    row.receipt_condition_description,
  ),
  disposal_reason: mapCatalog(
    row.disposal_reason_id,
    row.disposal_reason_name,
    row.disposal_reason_code,
    row.disposal_reason_description,
  ),
  assigned_employee: mapEmployee(row, 'assigned'),
  responsible_employee: mapEmployee(row, 'responsible'),
});

export const buildAssetQuery = () => `
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
    sup.name AS supplier_name,
    sup.description AS supplier_description,
    rc.code AS receipt_condition_code,
    rc.name AS receipt_condition_name,
    rc.description AS receipt_condition_description,
    dr.code AS disposal_reason_code,
    dr.name AS disposal_reason_name,
    dr.description AS disposal_reason_description,
    ae.employee_code AS assigned_employee_code,
    ae.full_name AS assigned_employee_name,
    ae.area AS assigned_employee_area,
    ae.position AS assigned_employee_position,
    re.employee_code AS responsible_employee_code,
    re.full_name AS responsible_employee_name,
    re.area AS responsible_employee_area,
    re.position AS responsible_employee_position,
    p.asset_code AS parent_asset_code,
    p.name AS parent_asset_name,
    rv.full_name AS reviewed_by_name,
    (SELECT COUNT(*)::int FROM public.helpdesk_assets ch
      WHERE ch.parent_asset_id = a.id AND ch.is_active = TRUE) AS component_count
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
  LEFT JOIN public.helpdesk_suppliers sup ON sup.id = a.supplier_id
  LEFT JOIN public.helpdesk_receipt_conditions rc ON rc.id = a.receipt_condition_id
  LEFT JOIN public.helpdesk_disposal_reasons dr ON dr.id = a.disposal_reason_id
  LEFT JOIN public.employees ae ON ae.id = a.assigned_employee_id
  LEFT JOIN public.employees re ON re.id = a.responsible_employee_id
  LEFT JOIN public.helpdesk_assets p ON p.id = a.parent_asset_id
  LEFT JOIN public.users rv ON rv.id = a.reviewed_by
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
    suppliers,
    receiptConditions,
    disposalReasons,
    documentKinds,
    lifecycleEventTypes,
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
    listCatalog('helpdesk_suppliers', { hasCode: false, hasDescription: true }),
    listCatalog('helpdesk_receipt_conditions'),
    listCatalog('helpdesk_disposal_reasons'),
    listCatalog('helpdesk_document_kinds'),
    listCatalog('helpdesk_lifecycle_event_types'),
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
    suppliers,
    receipt_conditions: receiptConditions,
    disposal_reasons: disposalReasons,
    document_kinds: documentKinds,
    lifecycle_event_types: lifecycleEventTypes,
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
      critical: 0,
      assigned: 0,
    };
  }

  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE a.is_active = TRUE)::int AS assets,
      COUNT(*) FILTER (
        WHERE a.is_active = TRUE AND UPPER(COALESCE(os.code, '')) = 'OUT_OF_SERVICE'
      )::int AS out_of_service,
      COUNT(*) FILTER (
        WHERE a.is_active = TRUE AND UPPER(COALESCE(cr.code, '')) = 'CRITICAL'
      )::int AS critical,
      COUNT(*) FILTER (
        WHERE a.is_active = TRUE AND a.assigned_employee_id IS NOT NULL
      )::int AS assigned
    FROM public.helpdesk_assets a
    LEFT JOIN public.helpdesk_operational_statuses os ON os.id = a.operational_status_id
    LEFT JOIN public.helpdesk_criticalities cr ON cr.id = a.criticality_id;
  `);

  return {
    assets: Number(result.rows[0]?.assets ?? 0),
    open_tickets: 0,
    preventive_due: 0,
    out_of_service: Number(result.rows[0]?.out_of_service ?? 0),
    critical: Number(result.rows[0]?.critical ?? 0),
    assigned: Number(result.rows[0]?.assigned ?? 0),
  };
};

const ASSET_SEARCH_COLUMNS = [
  'a.asset_code',
  'a.name',
  'a.description',
  'a.model',
  'a.serial_number',
  'b.name',
  'c.name',
  'l.name',
  'ae.full_name',
];

export interface AssetListOptions extends PaginationInput {
  search?: string | undefined;
  unitId?: number | null | undefined;
  areaId?: number | null | undefined;
  // Responsable = usuario del area. Filtra los activos cuyas areas tienen a ese
  // usuario como responsable (activo -> area -> responsables).
  responsibleUserId?: string | null | undefined;
  // Solo activos "todo" (whole): excluye los componentes (parent_asset_id NULL).
  topLevelOnly?: boolean | undefined;
  // Revision de carga: 'PENDING' | 'REVIEWED' (undefined = todos).
  reviewStatus?: 'PENDING' | 'REVIEWED' | undefined;
}

export const listHelpdeskAssets = async (
  options: AssetListOptions = {},
): Promise<PaginatedResult<HelpdeskAssetRecord>> => {
  await assertHelpdeskAssetsTable();

  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const search = buildIlikeSearch(ASSET_SEARCH_COLUMNS, options.search, 0);

  // Los valores de los filtros se indexan de forma dinamica ($1, $2, ...) porque
  // la busqueda ILIKE puede o no aportar un valor previo.
  const filterValues: Array<string | number> = [...search.values];
  const clauses = ['a.is_active = TRUE', search.clause].filter(Boolean);

  if (options.topLevelOnly) {
    clauses.push('a.parent_asset_id IS NULL');
  }
  if (options.reviewStatus === 'PENDING' || options.reviewStatus === 'REVIEWED') {
    filterValues.push(options.reviewStatus);
    clauses.push(`a.review_status = $${filterValues.length}`);
  }
  if (options.unitId) {
    filterValues.push(options.unitId);
    clauses.push(`a.unit_id = $${filterValues.length}`);
  }
  if (options.areaId) {
    filterValues.push(options.areaId);
    clauses.push(`a.area_id = $${filterValues.length}`);
  }
  if (options.responsibleUserId) {
    filterValues.push(options.responsibleUserId);
    clauses.push(
      `a.area_id IN (
        SELECT rp.area_id FROM public.helpdesk_area_responsibles rp WHERE rp.user_id = $${filterValues.length}
      )`,
    );
  }
  const whereClause = clauses.join(' AND ');

  const base = buildAssetQuery();
  const limitSql = paginate
    ? `LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`
    : '';
  const dataValues = paginate ? [...filterValues, limit, offset] : filterValues;

  const dataResult = await pool.query(
    `${base} WHERE ${whereClause} ORDER BY a.updated_at DESC, a.name ASC ${limitSql};`,
    dataValues,
  );
  const data = dataResult.rows.map(mapAssetRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM (${base} WHERE ${whereClause}) sub;`,
    filterValues,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
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

// Componentes (hijos) activos de un activo "todo".
export const listAssetComponents = async (parentId: number): Promise<HelpdeskAssetRecord[]> => {
  await assertHelpdeskAssetsTable();
  const result = await pool.query(
    `${buildAssetQuery()} WHERE a.parent_asset_id = $1 AND a.is_active = TRUE ORDER BY a.asset_code ASC, a.name ASC;`,
    [parentId],
  );
  return result.rows.map(mapAssetRow);
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

  const record = mapAssetRow(result.rows[0]);
  record.components = await listAssetComponents(assetId);
  return record;
};

const getCatalogCode = async (tableName: string, id: number | null | undefined): Promise<string | null> => {
  if (!id) {
    return null;
  }
  const result = await pool.query(`SELECT code FROM public.${tableName} WHERE id = $1 LIMIT 1;`, [id]);
  const code = result.rows[0]?.code;
  return code ? String(code).trim().toUpperCase() : null;
};

// Codigo compuesto UNIDAD-AREA-CATEGORIA-NNN. El consecutivo NNN es POR AREA
// (1..N): todos los activos de una misma area comparten un unico correlativo,
// sin importar la categoria (dos activos de la misma area con distinta categoria
// llevan numeros consecutivos, no reinician por categoria). El contador es
// atomico (counter table con scope por area) y se siembra desde el MAX existente
// del area para no colisionar con codigos preservados de la importacion.
export const generateAssetCode = async (
  unitId: number | null | undefined,
  areaId: number | null | undefined,
  categoryId: number | null | undefined,
): Promise<string> => {
  const [unitCode, areaCode, categoryCode] = await Promise.all([
    getCatalogCode('helpdesk_asset_units', unitId),
    getCatalogCode('helpdesk_asset_areas', areaId),
    getCatalogCode('helpdesk_asset_categories', categoryId),
  ]);

  if (!unitCode || !areaCode || !categoryCode) {
    const error = new Error('HELPDESK_ASSET_CODE_SCOPE_REQUIRED');
    (error as any).code = 'HELPDESK_ASSET_CODE_SCOPE_REQUIRED';
    throw error;
  }

  // Scope del contador = el area (namespaced para no chocar con contadores
  // legacy por combinacion UNIDAD-AREA-CATEGORIA). La semilla lee el MAX del
  // sufijo numerico entre los activos existentes de ESA area (por area_id).
  const scopeKey = `AREA:${areaCode}`;
  const result = await pool.query(
    `
      WITH seed AS (
        SELECT COALESCE(MAX((regexp_replace(asset_code, '^.*-', ''))::int), 0) AS maxn
        FROM public.helpdesk_assets
        WHERE area_id = $2
          AND parent_asset_id IS NULL
          AND asset_code ~ '-[0-9]+$'
      )
      INSERT INTO public.helpdesk_asset_code_counters (scope_key, last_value)
      VALUES ($1, (SELECT maxn FROM seed) + 1)
      ON CONFLICT (scope_key) DO UPDATE
        SET last_value = GREATEST(helpdesk_asset_code_counters.last_value, (SELECT maxn FROM seed)) + 1,
            updated_at = NOW()
      RETURNING last_value;
    `,
    [scopeKey, areaId],
  );

  const next = Number(result.rows[0]?.last_value ?? 1);
  return `${unitCode}-${areaCode}-${categoryCode}-${String(next).padStart(3, '0')}`;
};

// Codigo de componente = `{codigo_padre}-{NNN}` (consecutivo por padre). Sigue el
// mismo patron que ya trae el Excel (A-REC-EQC-001 -> A-REC-EQC-001-002).
export const generateComponentCode = async (parentId: number): Promise<string> => {
  const parent = await pool.query(`SELECT asset_code FROM public.helpdesk_assets WHERE id = $1 LIMIT 1;`, [parentId]);
  const parentCode = parent.rows[0]?.asset_code ? String(parent.rows[0].asset_code) : null;
  if (!parentCode) {
    const error = new Error('HELPDESK_ASSET_NOT_FOUND');
    (error as any).code = 'HELPDESK_ASSET_NOT_FOUND';
    throw error;
  }
  const seed = await pool.query(
    `SELECT COALESCE(MAX((regexp_replace(asset_code, '^.*-', ''))::int), 0) AS maxn
       FROM public.helpdesk_assets
      WHERE parent_asset_id = $1 AND asset_code ~ '-[0-9]+$';`,
    [parentId],
  );
  const next = Number(seed.rows[0]?.maxn ?? 0) + 1;
  return `${parentCode}-${String(next).padStart(3, '0')}`;
};

// Valida que un activo pueda ser PADRE (whole): existe, activo y no es a su vez
// un componente (solo 2 niveles).
const assertValidParent = async (parentId: number): Promise<HelpdeskAssetRecord> => {
  const parent = await getHelpdeskAssetById(parentId);
  if (!parent || !parent.is_active) {
    const error = new Error('HELPDESK_ASSET_NOT_FOUND');
    (error as any).code = 'HELPDESK_ASSET_NOT_FOUND';
    throw error;
  }
  if (parent.parent_asset_id) {
    const error = new Error('HELPDESK_ASSET_COMPONENT_NESTED');
    (error as any).code = 'HELPDESK_ASSET_COMPONENT_NESTED';
    (error as any).publicMessage = 'Un componente no puede tener sub-componentes (solo dos niveles).';
    throw error;
  }
  return parent;
};

export const createHelpdeskAsset = async (
  payload: HelpdeskAssetPayload,
  userId?: string | null,
): Promise<HelpdeskAssetRecord> => {
  await assertHelpdeskAssetsTable();

  // Codigo explicito (manual o preservado en importacion) => override; vacio =>
  // autogenerar: componente ({padre}-NNN) si tiene padre, o whole (UNIDAD-AREA-CLASIF-NNN).
  const providedCode = normalizeOptionalText(payload.asset_code);
  const assetCode = providedCode
    ?? (payload.parent_asset_id
      ? await generateComponentCode(payload.parent_asset_id)
      : await generateAssetCode(payload.unit_id, payload.area_id, payload.category_id));
  const overridden = Boolean(providedCode);

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
        supplier_id,
        received_on,
        placed_in_service_on,
        receipt_condition_id,
        decommissioned_on,
        disposal_reason_id,
        parent_asset_id,
        asset_code_overridden,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $32
      )
      RETURNING id;
    `,
    [
      assetCode,
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
      payload.supplier_id ?? null,
      normalizeOptionalText(payload.received_on),
      normalizeOptionalText(payload.placed_in_service_on),
      payload.receipt_condition_id ?? null,
      normalizeOptionalText(payload.decommissioned_on),
      payload.disposal_reason_id ?? null,
      payload.parent_asset_id ?? null,
      overridden,
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

// Crea un COMPONENTE bajo un activo "todo". El componente hereda unidad/area/
// ubicacion/categoria/responsable del padre cuando el payload no los trae, y su
// codigo se autogenera como {padre}-NNN. Devuelve el activo padre actualizado.
export const createAssetComponent = async (
  parentId: number,
  payload: HelpdeskAssetPayload,
  userId?: string | null,
): Promise<HelpdeskAssetRecord> => {
  const parent = await assertValidParent(parentId);
  await createHelpdeskAsset(
    {
      ...payload,
      parent_asset_id: parentId,
      asset_code: normalizeOptionalText(payload.asset_code) ?? '',
      unit_id: payload.unit_id ?? parent.unit_id ?? null,
      area_id: payload.area_id ?? parent.area_id ?? null,
      location_id: payload.location_id ?? parent.location_id ?? null,
      category_id: payload.category_id ?? parent.category_id ?? null,
      responsible_employee_id: payload.responsible_employee_id ?? parent.responsible_employee_id ?? null,
      assigned_employee_id: payload.assigned_employee_id ?? parent.assigned_employee_id ?? null,
    },
    userId,
  );
  const refreshed = await getHelpdeskAssetById(parentId);
  return refreshed as HelpdeskAssetRecord;
};

// Vincula un activo existente como componente de un padre (whole).
export const attachAssetComponent = async (
  componentId: number,
  parentId: number,
  userId?: string | null,
): Promise<HelpdeskAssetRecord> => {
  if (componentId === parentId) {
    const error = new Error('HELPDESK_ASSET_COMPONENT_SELF');
    (error as any).code = 'HELPDESK_ASSET_COMPONENT_SELF';
    (error as any).publicMessage = 'Un activo no puede ser componente de si mismo.';
    throw error;
  }
  const parent = await assertValidParent(parentId);
  const child = await getHelpdeskAssetById(componentId);
  if (!child || !child.is_active) {
    const error = new Error('HELPDESK_ASSET_NOT_FOUND');
    (error as any).code = 'HELPDESK_ASSET_NOT_FOUND';
    throw error;
  }
  if ((child.component_count ?? 0) > 0) {
    const error = new Error('HELPDESK_ASSET_COMPONENT_HAS_CHILDREN');
    (error as any).code = 'HELPDESK_ASSET_COMPONENT_HAS_CHILDREN';
    (error as any).publicMessage = 'El activo ya tiene componentes; no puede vincularse como componente de otro.';
    throw error;
  }

  await pool.query(
    `UPDATE public.helpdesk_assets SET parent_asset_id = $1, updated_by_user_id = $2, updated_at = NOW() WHERE id = $3;`,
    [parentId, userId ?? null, componentId],
  );
  await recordAssetHistory(
    componentId,
    'UPDATE',
    `Vinculado como componente de ${parent.asset_code}.`,
    userId,
  );
  return (await getHelpdeskAssetById(parentId)) as HelpdeskAssetRecord;
};

// Desvincula un componente: vuelve a ser un activo independiente (whole).
export const detachAssetComponent = async (
  componentId: number,
  userId?: string | null,
): Promise<HelpdeskAssetRecord | null> => {
  const child = await getHelpdeskAssetById(componentId);
  if (!child) {
    return null;
  }
  await pool.query(
    `UPDATE public.helpdesk_assets SET parent_asset_id = NULL, updated_by_user_id = $1, updated_at = NOW() WHERE id = $2;`,
    [userId ?? null, componentId],
  );
  await recordAssetHistory(componentId, 'UPDATE', 'Desvinculado como componente (activo independiente).', userId);
  return getHelpdeskAssetById(componentId);
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
  // No permitir blanquear el codigo: si llega vacio se conserva el actual.
  const assetCode = normalizeOptionalText(payload.asset_code) ?? current.asset_code;

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
        supplier_id = $24,
        received_on = $25,
        placed_in_service_on = $26,
        receipt_condition_id = $27,
        decommissioned_on = $28,
        disposal_reason_id = $29,
        updated_by_user_id = $30,
        updated_at = NOW()
      WHERE id = $31;
    `,
    [
      assetCode,
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
      payload.supplier_id ?? null,
      normalizeOptionalText(payload.received_on),
      normalizeOptionalText(payload.placed_in_service_on),
      payload.receipt_condition_id ?? null,
      normalizeOptionalText(payload.decommissioned_on),
      payload.disposal_reason_id ?? null,
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

// Marca (o desmarca) un activo como REVISADO tras la depuracion de la carga masiva.
// Eje independiente del estado operativo. reviewed=true => REVIEWED + sello quien/cuando;
// reviewed=false => vuelve a PENDING y limpia el sello. Reversible. Traza ligera en history.
export const setAssetReviewStatus = async (
  assetId: number,
  reviewed: boolean,
  userId?: string | null,
): Promise<HelpdeskAssetRecord | null> => {
  await assertHelpdeskAssetsTable();

  const current = await getHelpdeskAssetById(assetId);
  if (!current) {
    return null;
  }

  const nextStatus = reviewed ? 'REVIEWED' : 'PENDING';
  await pool.query(
    `
      UPDATE public.helpdesk_assets
      SET
        review_status = $1,
        reviewed_at = ${reviewed ? 'NOW()' : 'NULL'},
        reviewed_by = ${reviewed ? '$2' : 'NULL'},
        updated_by_user_id = $2,
        updated_at = NOW()
      WHERE id = $3;
    `,
    [nextStatus, userId ?? null, assetId],
  );

  await recordAssetHistory(
    assetId,
    'REVIEW',
    reviewed ? 'Activo marcado como revisado.' : 'Activo devuelto a pendiente de revision.',
    userId,
    { review_status: current.review_status ?? 'PENDING' },
    { review_status: nextStatus },
  );

  return getHelpdeskAssetById(assetId);
};

// Avance de la depuracion: cuantos activos vigentes estan revisados vs pendientes.
export const getAssetReviewProgress = async (): Promise<{ total: number; reviewed: number; pending: number }> => {
  await assertHelpdeskAssetsTable();
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE review_status = 'REVIEWED')::int AS reviewed
    FROM public.helpdesk_assets
    WHERE is_active = TRUE;
  `);
  const total = Number(result.rows[0]?.total ?? 0);
  const reviewed = Number(result.rows[0]?.reviewed ?? 0);
  return { total, reviewed, pending: total - reviewed };
};
