import pool from '../config/db';
import type { HelpdeskCatalogItem } from './helpdesk-asset.service';
import type { HelpdeskMaintenanceCatalogs } from './helpdesk-maintenance.service';

export type HelpdeskCatalogAdminKey =
  | 'categories'
  | 'units'
  | 'areas'
  | 'locations'
  | 'brands'
  | 'purchase_modalities'
  | 'purchase_conditions'
  | 'criticalities'
  | 'operational_statuses'
  | 'request_types'
  | 'ticket_statuses'
  | 'ticket_priorities'
  | 'frequencies';

export interface HelpdeskCatalogAdminPayload {
  code?: string | null;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  is_closed?: boolean | null;
  response_hours?: number | null;
  interval_months?: number | null;
}

export interface HelpdeskCatalogAdminItem extends HelpdeskCatalogItem {
  is_closed?: boolean;
  response_hours?: number | null;
  interval_months?: number | null;
}

export interface HelpdeskCatalogAdminResponse {
  assets: {
    categories: HelpdeskCatalogAdminItem[];
    units: HelpdeskCatalogAdminItem[];
    areas: HelpdeskCatalogAdminItem[];
    locations: HelpdeskCatalogAdminItem[];
    brands: HelpdeskCatalogAdminItem[];
    purchase_modalities: HelpdeskCatalogAdminItem[];
    purchase_conditions: HelpdeskCatalogAdminItem[];
    criticalities: HelpdeskCatalogAdminItem[];
    operational_statuses: HelpdeskCatalogAdminItem[];
  };
  tickets: {
    request_types: HelpdeskCatalogAdminItem[];
    ticket_statuses: HelpdeskCatalogAdminItem[];
    ticket_priorities: HelpdeskCatalogAdminItem[];
  };
  maintenance: HelpdeskMaintenanceCatalogs & {
    frequencies: HelpdeskCatalogAdminItem[];
  };
}

type CatalogConfig = {
  key: HelpdeskCatalogAdminKey;
  tableName: string;
  hasCode?: boolean;
  hasDescription?: boolean;
  hasSortOrder?: boolean;
  hasIsClosed?: boolean;
  hasResponseHours?: boolean;
  hasIntervalMonths?: boolean;
};

const CATALOG_CONFIG: Record<HelpdeskCatalogAdminKey, CatalogConfig> = {
  categories: { key: 'categories', tableName: 'helpdesk_asset_categories', hasCode: true, hasDescription: true, hasSortOrder: true },
  units: { key: 'units', tableName: 'helpdesk_asset_units', hasCode: true, hasDescription: true, hasSortOrder: true },
  areas: { key: 'areas', tableName: 'helpdesk_asset_areas', hasCode: true, hasDescription: true, hasSortOrder: true },
  locations: { key: 'locations', tableName: 'helpdesk_locations', hasCode: true, hasDescription: true, hasSortOrder: true },
  brands: { key: 'brands', tableName: 'helpdesk_asset_brands' },
  purchase_modalities: {
    key: 'purchase_modalities',
    tableName: 'helpdesk_purchase_modalities',
    hasCode: true,
    hasDescription: true,
    hasSortOrder: true,
  },
  purchase_conditions: {
    key: 'purchase_conditions',
    tableName: 'helpdesk_purchase_conditions',
    hasCode: true,
    hasDescription: true,
    hasSortOrder: true,
  },
  criticalities: {
    key: 'criticalities',
    tableName: 'helpdesk_criticalities',
    hasCode: true,
    hasDescription: true,
    hasSortOrder: true,
  },
  operational_statuses: {
    key: 'operational_statuses',
    tableName: 'helpdesk_operational_statuses',
    hasCode: true,
    hasDescription: true,
    hasSortOrder: true,
  },
  request_types: { key: 'request_types', tableName: 'helpdesk_request_types', hasCode: true, hasDescription: true, hasSortOrder: true },
  ticket_statuses: {
    key: 'ticket_statuses',
    tableName: 'helpdesk_ticket_statuses',
    hasCode: true,
    hasDescription: true,
    hasSortOrder: true,
    hasIsClosed: true,
  },
  ticket_priorities: {
    key: 'ticket_priorities',
    tableName: 'helpdesk_ticket_priorities',
    hasCode: true,
    hasDescription: true,
    hasSortOrder: true,
    hasResponseHours: true,
  },
  frequencies: {
    key: 'frequencies',
    tableName: 'helpdesk_maintenance_frequencies',
    hasCode: true,
    hasDescription: true,
    hasSortOrder: true,
    hasIntervalMonths: true,
  },
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const normalizeRequiredText = (value: unknown): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('HELPDESK_CATALOG_NAME_REQUIRED');
    (error as any).code = 'HELPDESK_CATALOG_NAME_REQUIRED';
    throw error;
  }

  return normalizedValue;
};

const normalizeRequiredCode = (value: unknown) => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('HELPDESK_CATALOG_CODE_REQUIRED');
    (error as any).code = 'HELPDESK_CATALOG_CODE_REQUIRED';
    throw error;
  }

  return normalizedValue.toUpperCase();
};

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const normalizeNonNegativeInteger = (value: unknown, errorCode: string): number => {
  const parsedValue = normalizeNumber(value);
  if (parsedValue === null || parsedValue < 0 || !Number.isInteger(parsedValue)) {
    const error = new Error(errorCode);
    (error as any).code = errorCode;
    throw error;
  }

  return parsedValue;
};

const getCatalogConfig = (catalogKey: string): CatalogConfig => {
  const config = CATALOG_CONFIG[catalogKey as HelpdeskCatalogAdminKey];
  if (!config) {
    const error = new Error('HELPDESK_CATALOG_KEY_INVALID');
    (error as any).code = 'HELPDESK_CATALOG_KEY_INVALID';
    throw error;
  }

  return config;
};

const listCatalogItems = async (config: CatalogConfig): Promise<HelpdeskCatalogAdminItem[]> => {
  const projections = [
    'id',
    config.hasCode ? 'code' : 'NULL AS code',
    'name',
    config.hasDescription ? 'description' : 'NULL AS description',
    'is_active',
    config.hasSortOrder ? 'sort_order' : '0 AS sort_order',
    config.hasIsClosed ? 'is_closed' : 'FALSE AS is_closed',
    config.hasResponseHours ? 'response_hours' : 'NULL AS response_hours',
    config.hasIntervalMonths ? 'interval_months' : 'NULL AS interval_months',
  ].join(', ');

  const orderBy = config.hasSortOrder ? 'is_active DESC, sort_order ASC, name ASC' : 'is_active DESC, name ASC';
  const result = await pool.query(`
    SELECT ${projections}
    FROM public.${config.tableName}
    ORDER BY ${orderBy};
  `);

  return result.rows.map((row) => {
    const item: HelpdeskCatalogAdminItem = {
      id: Number(row.id),
      code: row.code ? String(row.code) : undefined,
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      is_active: Boolean(row.is_active),
      sort_order: Number(row.sort_order ?? 0),
    };

    if (config.hasIsClosed) {
      item.is_closed = Boolean(row.is_closed);
    }

    if (config.hasResponseHours) {
      item.response_hours = row.response_hours !== null ? Number(row.response_hours) : null;
    }

    if (config.hasIntervalMonths) {
      item.interval_months = row.interval_months !== null ? Number(row.interval_months) : null;
    }

    return item;
  });
};

const getCatalogItemById = async (
  catalogKey: HelpdeskCatalogAdminKey,
  itemId: number,
): Promise<HelpdeskCatalogAdminItem | null> => {
  const config = getCatalogConfig(catalogKey);
  const items = await listCatalogItems(config);
  return items.find((item) => item.id === itemId) ?? null;
};

const buildInsertStatement = (config: CatalogConfig, payload: HelpdeskCatalogAdminPayload) => {
  const columns = ['name'];
  const values: unknown[] = [normalizeRequiredText(payload.name)];

  if (config.hasCode) {
    columns.unshift('code');
    values.unshift(normalizeRequiredCode(payload.code));
  }

  if (config.hasDescription) {
    columns.push('description');
    values.push(normalizeOptionalText(payload.description));
  }

  if (config.hasSortOrder) {
    columns.push('sort_order');
    values.push(normalizeNonNegativeInteger(payload.sort_order ?? 0, 'HELPDESK_CATALOG_SORT_ORDER_INVALID'));
  }

  if (config.hasIsClosed) {
    columns.push('is_closed');
    values.push(Boolean(payload.is_closed));
  }

  if (config.hasResponseHours) {
    const responseHours = payload.response_hours === null || payload.response_hours === undefined
      ? null
      : normalizeNonNegativeInteger(payload.response_hours, 'HELPDESK_CATALOG_RESPONSE_HOURS_INVALID');
    columns.push('response_hours');
    values.push(responseHours);
  }

  if (config.hasIntervalMonths) {
    const intervalMonths = normalizeNonNegativeInteger(payload.interval_months, 'HELPDESK_CATALOG_INTERVAL_MONTHS_INVALID');
    if (intervalMonths <= 0) {
      const error = new Error('HELPDESK_CATALOG_INTERVAL_MONTHS_INVALID');
      (error as any).code = 'HELPDESK_CATALOG_INTERVAL_MONTHS_INVALID';
      throw error;
    }

    columns.push('interval_months');
    values.push(intervalMonths);
  }

  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  return { columns, values, placeholders };
};

const buildUpdateStatement = (config: CatalogConfig, payload: HelpdeskCatalogAdminPayload) => {
  const updates = ['name = $1', 'updated_at = NOW()'];
  const values: unknown[] = [normalizeRequiredText(payload.name)];

  if (config.hasCode) {
    updates.push(`code = $${values.length + 1}`);
    values.push(normalizeRequiredCode(payload.code));
  }

  if (config.hasDescription) {
    updates.push(`description = $${values.length + 1}`);
    values.push(normalizeOptionalText(payload.description));
  }

  if (config.hasSortOrder) {
    updates.push(`sort_order = $${values.length + 1}`);
    values.push(normalizeNonNegativeInteger(payload.sort_order ?? 0, 'HELPDESK_CATALOG_SORT_ORDER_INVALID'));
  }

  if (config.hasIsClosed) {
    updates.push(`is_closed = $${values.length + 1}`);
    values.push(Boolean(payload.is_closed));
  }

  if (config.hasResponseHours) {
    const responseHours = payload.response_hours === null || payload.response_hours === undefined
      ? null
      : normalizeNonNegativeInteger(payload.response_hours, 'HELPDESK_CATALOG_RESPONSE_HOURS_INVALID');
    updates.push(`response_hours = $${values.length + 1}`);
    values.push(responseHours);
  }

  if (config.hasIntervalMonths) {
    const intervalMonths = normalizeNonNegativeInteger(payload.interval_months, 'HELPDESK_CATALOG_INTERVAL_MONTHS_INVALID');
    if (intervalMonths <= 0) {
      const error = new Error('HELPDESK_CATALOG_INTERVAL_MONTHS_INVALID');
      (error as any).code = 'HELPDESK_CATALOG_INTERVAL_MONTHS_INVALID';
      throw error;
    }

    updates.push(`interval_months = $${values.length + 1}`);
    values.push(intervalMonths);
  }

  return { updates, values };
};

export const listHelpdeskCatalogAdminData = async (): Promise<HelpdeskCatalogAdminResponse> => {
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
    requestTypes,
    ticketStatuses,
    ticketPriorities,
    frequencies,
  ] = await Promise.all([
    listCatalogItems(CATALOG_CONFIG.categories),
    listCatalogItems(CATALOG_CONFIG.units),
    listCatalogItems(CATALOG_CONFIG.areas),
    listCatalogItems(CATALOG_CONFIG.locations),
    listCatalogItems(CATALOG_CONFIG.brands),
    listCatalogItems(CATALOG_CONFIG.purchase_modalities),
    listCatalogItems(CATALOG_CONFIG.purchase_conditions),
    listCatalogItems(CATALOG_CONFIG.criticalities),
    listCatalogItems(CATALOG_CONFIG.operational_statuses),
    listCatalogItems(CATALOG_CONFIG.request_types),
    listCatalogItems(CATALOG_CONFIG.ticket_statuses),
    listCatalogItems(CATALOG_CONFIG.ticket_priorities),
    listCatalogItems(CATALOG_CONFIG.frequencies),
  ]);

  return {
    assets: {
      categories,
      units,
      areas,
      locations,
      brands,
      purchase_modalities: purchaseModalities,
      purchase_conditions: purchaseConditions,
      criticalities,
      operational_statuses: operationalStatuses,
    },
    tickets: {
      request_types: requestTypes,
      ticket_statuses: ticketStatuses,
      ticket_priorities: ticketPriorities,
    },
    maintenance: {
      frequencies: frequencies as HelpdeskMaintenanceCatalogs['frequencies'],
    },
  };
};

export const createHelpdeskCatalogItem = async (
  catalogKey: HelpdeskCatalogAdminKey,
  payload: HelpdeskCatalogAdminPayload,
): Promise<HelpdeskCatalogAdminItem> => {
  const config = getCatalogConfig(catalogKey);
  const { columns, values, placeholders } = buildInsertStatement(config, payload);

  const result = await pool.query(
    `
      INSERT INTO public.${config.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING id;
    `,
    values,
  );

  const created = await getCatalogItemById(catalogKey, Number(result.rows[0]?.id));
  if (!created) {
    const error = new Error('HELPDESK_CATALOG_CREATE_FAILED');
    (error as any).code = 'HELPDESK_CATALOG_CREATE_FAILED';
    throw error;
  }

  return created;
};

export const updateHelpdeskCatalogItem = async (
  catalogKey: HelpdeskCatalogAdminKey,
  itemId: number,
  payload: HelpdeskCatalogAdminPayload,
): Promise<HelpdeskCatalogAdminItem | null> => {
  const config = getCatalogConfig(catalogKey);
  const existing = await getCatalogItemById(catalogKey, itemId);
  if (!existing) {
    return null;
  }

  const { updates, values } = buildUpdateStatement(config, payload);
  await pool.query(
    `
      UPDATE public.${config.tableName}
      SET ${updates.join(', ')}
      WHERE id = $${values.length + 1};
    `,
    [...values, itemId],
  );

  return getCatalogItemById(catalogKey, itemId);
};

export const deactivateHelpdeskCatalogItem = async (
  catalogKey: HelpdeskCatalogAdminKey,
  itemId: number,
): Promise<HelpdeskCatalogAdminItem | null> => {
  const config = getCatalogConfig(catalogKey);
  const existing = await getCatalogItemById(catalogKey, itemId);
  if (!existing) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.${config.tableName}
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1;
    `,
    [itemId],
  );

  return getCatalogItemById(catalogKey, itemId);
};

export const isHelpdeskCatalogAdminKey = (value: string): value is HelpdeskCatalogAdminKey =>
  Object.prototype.hasOwnProperty.call(CATALOG_CONFIG, value);
