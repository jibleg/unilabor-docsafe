import pool from '../config/db';
import {
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
  type PaginatedResult,
  type PaginationInput,
} from '../utils/pagination';

// Proveedores: el modulo Proveedores NO duplica el catalogo, lee el mismo
// `helpdesk_suppliers` que ya alimenta el combo "Proveedor" de Activos.
export interface ProviderSummary {
  id: number;
  name: string;
  description: string | null;
  rfc: string | null;
  contact: string | null;
  website: string | null;
  address_street: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  notes: string | null;
  is_active: boolean;
}

const PROVIDER_COLUMNS = `
  id, name, description, rfc, contact, website,
  address_street, address_neighborhood, address_city, address_state, address_zip, address_country,
  notes, is_active
`;

const mapProviderRow = (row: any): ProviderSummary => ({
  id: Number(row.id),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  rfc: row.rfc ? String(row.rfc) : null,
  contact: row.contact ? String(row.contact) : null,
  website: row.website ? String(row.website) : null,
  address_street: row.address_street ? String(row.address_street) : null,
  address_neighborhood: row.address_neighborhood ? String(row.address_neighborhood) : null,
  address_city: row.address_city ? String(row.address_city) : null,
  address_state: row.address_state ? String(row.address_state) : null,
  address_zip: row.address_zip ? String(row.address_zip) : null,
  address_country: row.address_country ? String(row.address_country) : null,
  notes: row.notes ? String(row.notes) : null,
  is_active: Boolean(row.is_active),
});

export interface ProviderListOptions extends PaginationInput {
  search?: unknown;
  includeInactive?: boolean;
}

const PROVIDER_SEARCH_COLUMNS = ['name', 'rfc'];

// Paginacion server-side opt-in (mismo contrato/utilidad que listEmployees):
// sin page/limit el cliente sigue recibiendo todas las filas en una sola
// "pagina", para no romper llamadas existentes que no pidieron paginar.
export const listProviders = async (
  options: ProviderListOptions = {},
): Promise<PaginatedResult<ProviderSummary>> => {
  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const search = buildIlikeSearch(PROVIDER_SEARCH_COLUMNS, options.search, 0);

  const filters = options.includeInactive ? [] : ['is_active = TRUE'];
  if (search.clause) {
    filters.push(search.clause);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const limitSql = paginate ? `LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}` : '';
  const dataValues = paginate ? [...search.values, limit, offset] : search.values;

  const dataResult = await pool.query(
    `
      SELECT ${PROVIDER_COLUMNS}
      FROM public.helpdesk_suppliers
      ${whereClause}
      ORDER BY is_active DESC, name ASC
      ${limitSql};
    `,
    dataValues,
  );
  const data = dataResult.rows.map(mapProviderRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.helpdesk_suppliers ${whereClause};`,
    search.values,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

export const getProviderById = async (providerId: number): Promise<ProviderSummary | null> => {
  const result = await pool.query(
    `
      SELECT ${PROVIDER_COLUMNS}
      FROM public.helpdesk_suppliers
      WHERE id = $1
      LIMIT 1;
    `,
    [providerId],
  );

  const row = result.rows[0];
  return row ? mapProviderRow(row) : null;
};

export interface ProviderPayload {
  name: string;
  description?: string | null;
  rfc?: string | null;
  contact?: string | null;
  website?: string | null;
  address_street?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address_country?: string | null;
  notes?: string | null;
}

const normalizeProviderName = (value: unknown): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('PROVIDER_NAME_REQUIRED');
    (error as any).code = 'PROVIDER_NAME_REQUIRED';
    throw error;
  }

  return normalizedValue;
};

// Escribe en `helpdesk_suppliers`, el mismo catalogo que usa Activos — el
// modulo Proveedores gana alta/edicion propia (antes solo lectura, gap
// conocido) sin tocar como Activos lo consume.
export const createProvider = async (payload: ProviderPayload): Promise<ProviderSummary> => {
  const name = normalizeProviderName(payload.name);
  const description = normalizeOptionalText(payload.description);
  const rfc = normalizeOptionalText(payload.rfc);
  const contact = normalizeOptionalText(payload.contact);
  const website = normalizeOptionalText(payload.website);
  const addressStreet = normalizeOptionalText(payload.address_street);
  const addressNeighborhood = normalizeOptionalText(payload.address_neighborhood);
  const addressCity = normalizeOptionalText(payload.address_city);
  const addressState = normalizeOptionalText(payload.address_state);
  const addressZip = normalizeOptionalText(payload.address_zip);
  const addressCountry = normalizeOptionalText(payload.address_country);
  const notes = normalizeOptionalText(payload.notes);

  const result = await pool.query(
    `
      INSERT INTO public.helpdesk_suppliers (
        name, description, rfc, contact, website,
        address_street, address_neighborhood, address_city, address_state, address_zip, address_country,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;
    `,
    [
      name, description, rfc, contact, website,
      addressStreet, addressNeighborhood, addressCity, addressState, addressZip, addressCountry,
      notes,
    ],
  );

  const created = await getProviderById(Number(result.rows[0]?.id));
  if (!created) {
    const error = new Error('PROVIDER_CREATE_FAILED');
    (error as any).code = 'PROVIDER_CREATE_FAILED';
    throw error;
  }

  return created;
};

export const updateProvider = async (
  providerId: number,
  payload: ProviderPayload,
): Promise<ProviderSummary | null> => {
  const existing = await getProviderById(providerId);
  if (!existing) {
    return null;
  }

  const name = normalizeProviderName(payload.name);
  const description = normalizeOptionalText(payload.description);
  const rfc = normalizeOptionalText(payload.rfc);
  const contact = normalizeOptionalText(payload.contact);
  const website = normalizeOptionalText(payload.website);
  const addressStreet = normalizeOptionalText(payload.address_street);
  const addressNeighborhood = normalizeOptionalText(payload.address_neighborhood);
  const addressCity = normalizeOptionalText(payload.address_city);
  const addressState = normalizeOptionalText(payload.address_state);
  const addressZip = normalizeOptionalText(payload.address_zip);
  const addressCountry = normalizeOptionalText(payload.address_country);
  const notes = normalizeOptionalText(payload.notes);

  await pool.query(
    `
      UPDATE public.helpdesk_suppliers
      SET name = $1, description = $2, rfc = $3, contact = $4, website = $5,
          address_street = $6, address_neighborhood = $7, address_city = $8, address_state = $9,
          address_zip = $10, address_country = $11, notes = $12, updated_at = NOW()
      WHERE id = $13;
    `,
    [
      name, description, rfc, contact, website,
      addressStreet, addressNeighborhood, addressCity, addressState, addressZip, addressCountry,
      notes, providerId,
    ],
  );

  return getProviderById(providerId);
};

export const deactivateProvider = async (providerId: number): Promise<ProviderSummary | null> => {
  const existing = await getProviderById(providerId);
  if (!existing) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.helpdesk_suppliers
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1;
    `,
    [providerId],
  );

  return getProviderById(providerId);
};

// --- Categorias de documento (clasificacion, catalogo administrable) -------

export interface ProviderDocumentCategory {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface ProviderDocumentCategoryPayload {
  code?: string | null;
  name: string;
  description?: string | null;
  sort_order?: number | null;
}

const mapCategoryRow = (row: any): ProviderDocumentCategory => ({
  id: Number(row.id),
  code: String(row.code),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  is_active: Boolean(row.is_active),
  sort_order: Number(row.sort_order ?? 0),
});

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
    const error = new Error('PROVIDER_CATEGORY_NAME_REQUIRED');
    (error as any).code = 'PROVIDER_CATEGORY_NAME_REQUIRED';
    throw error;
  }

  return normalizedValue;
};

const normalizeRequiredCode = (value: unknown): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('PROVIDER_CATEGORY_CODE_REQUIRED');
    (error as any).code = 'PROVIDER_CATEGORY_CODE_REQUIRED';
    throw error;
  }

  return normalizedValue.toUpperCase();
};

const normalizeSortOrder = (value: unknown): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || !Number.isInteger(parsedValue)) {
    const error = new Error('PROVIDER_CATEGORY_SORT_ORDER_INVALID');
    (error as any).code = 'PROVIDER_CATEGORY_SORT_ORDER_INVALID';
    throw error;
  }

  return parsedValue;
};

export const listProviderDocumentCategories = async (
  includeInactive = false,
): Promise<ProviderDocumentCategory[]> => {
  const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
  const result = await pool.query(`
    SELECT id, code, name, description, is_active, sort_order
    FROM public.provider_document_categories
    ${whereClause}
    ORDER BY is_active DESC, sort_order ASC, name ASC;
  `);
  return result.rows.map(mapCategoryRow);
};

export const getProviderDocumentCategoryById = async (
  categoryId: number,
): Promise<ProviderDocumentCategory | null> => {
  const result = await pool.query(
    `
      SELECT id, code, name, description, is_active, sort_order
      FROM public.provider_document_categories
      WHERE id = $1
      LIMIT 1;
    `,
    [categoryId],
  );

  const row = result.rows[0];
  return row ? mapCategoryRow(row) : null;
};

export const createProviderDocumentCategory = async (
  payload: ProviderDocumentCategoryPayload,
): Promise<ProviderDocumentCategory> => {
  const code = normalizeRequiredCode(payload.code);
  const name = normalizeRequiredText(payload.name);
  const description = normalizeOptionalText(payload.description);
  const sortOrder = normalizeSortOrder(payload.sort_order ?? 0);

  const result = await pool.query(
    `
      INSERT INTO public.provider_document_categories (code, name, description, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [code, name, description, sortOrder],
  );

  const created = await getProviderDocumentCategoryById(Number(result.rows[0]?.id));
  if (!created) {
    const error = new Error('PROVIDER_CATEGORY_CREATE_FAILED');
    (error as any).code = 'PROVIDER_CATEGORY_CREATE_FAILED';
    throw error;
  }

  return created;
};

export const updateProviderDocumentCategory = async (
  categoryId: number,
  payload: ProviderDocumentCategoryPayload,
): Promise<ProviderDocumentCategory | null> => {
  const existing = await getProviderDocumentCategoryById(categoryId);
  if (!existing) {
    return null;
  }

  const code = normalizeRequiredCode(payload.code);
  const name = normalizeRequiredText(payload.name);
  const description = normalizeOptionalText(payload.description);
  const sortOrder = normalizeSortOrder(payload.sort_order ?? 0);

  await pool.query(
    `
      UPDATE public.provider_document_categories
      SET code = $1, name = $2, description = $3, sort_order = $4, updated_at = NOW()
      WHERE id = $5;
    `,
    [code, name, description, sortOrder, categoryId],
  );

  return getProviderDocumentCategoryById(categoryId);
};

export const deactivateProviderDocumentCategory = async (
  categoryId: number,
): Promise<ProviderDocumentCategory | null> => {
  const existing = await getProviderDocumentCategoryById(categoryId);
  if (!existing) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.provider_document_categories
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1;
    `,
    [categoryId],
  );

  return getProviderDocumentCategoryById(categoryId);
};

// Borrado DEFINITIVO. Solo procede sin dependencias: la FK de
// `provider_documents.category_id` (ON DELETE RESTRICT) hace que Postgres
// rechace con 23503 si algun documento la usa; el controller lo traduce a "en uso".
export const deleteProviderDocumentCategory = async (categoryId: number): Promise<boolean> => {
  const existing = await getProviderDocumentCategoryById(categoryId);
  if (!existing) {
    return false;
  }

  await pool.query('DELETE FROM public.provider_document_categories WHERE id = $1;', [categoryId]);
  return true;
};

// --- Contactos del proveedor -------------------------------------------------

export interface ProviderContact {
  id: number;
  provider_id: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface ProviderContactPayload {
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  is_primary?: boolean;
}

const mapContactRow = (row: any): ProviderContact => ({
  id: Number(row.id),
  provider_id: Number(row.provider_id),
  name: String(row.name),
  position: row.position ? String(row.position) : null,
  phone: row.phone ? String(row.phone) : null,
  email: row.email ? String(row.email) : null,
  is_primary: Boolean(row.is_primary),
});

const normalizeContactName = (value: unknown): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('PROVIDER_CONTACT_NAME_REQUIRED');
    (error as any).code = 'PROVIDER_CONTACT_NAME_REQUIRED';
    throw error;
  }

  return normalizedValue;
};

export const listProviderContacts = async (providerId: number): Promise<ProviderContact[]> => {
  const result = await pool.query(
    `
      SELECT id, provider_id, name, position, phone, email, is_primary
      FROM public.provider_contacts
      WHERE provider_id = $1
      ORDER BY is_primary DESC, name ASC;
    `,
    [providerId],
  );
  return result.rows.map(mapContactRow);
};

export const getProviderContactById = async (contactId: number): Promise<ProviderContact | null> => {
  const result = await pool.query(
    `
      SELECT id, provider_id, name, position, phone, email, is_primary
      FROM public.provider_contacts
      WHERE id = $1
      LIMIT 1;
    `,
    [contactId],
  );

  const row = result.rows[0];
  return row ? mapContactRow(row) : null;
};

// Marcar un contacto como principal quita el flag a cualquier otro del mismo
// proveedor en la misma transaccion (el indice unico parcial solo permite uno
// activo a la vez; si no se libera antes, el INSERT/UPDATE choca con 23505).
export const createProviderContact = async (
  providerId: number,
  payload: ProviderContactPayload,
): Promise<ProviderContact> => {
  const name = normalizeContactName(payload.name);
  const position = normalizeOptionalText(payload.position);
  const phone = normalizeOptionalText(payload.phone);
  const email = normalizeOptionalText(payload.email);
  const isPrimary = Boolean(payload.is_primary);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const providerResult = await client.query(
      'SELECT id FROM public.helpdesk_suppliers WHERE id = $1 LIMIT 1 FOR UPDATE;',
      [providerId],
    );
    if (!providerResult.rows[0]) {
      const error = new Error('PROVIDER_NOT_FOUND');
      (error as any).code = 'PROVIDER_NOT_FOUND';
      throw error;
    }

    if (isPrimary) {
      await client.query(
        'UPDATE public.provider_contacts SET is_primary = FALSE, updated_at = NOW() WHERE provider_id = $1 AND is_primary = TRUE;',
        [providerId],
      );
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.provider_contacts (provider_id, name, position, phone, email, is_primary)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `,
      [providerId, name, position, phone, email, isPrimary],
    );

    await client.query('COMMIT');

    const created = await getProviderContactById(Number(insertResult.rows[0]?.id));
    if (!created) {
      const error = new Error('PROVIDER_CONTACT_CREATE_FAILED');
      (error as any).code = 'PROVIDER_CONTACT_CREATE_FAILED';
      throw error;
    }
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateProviderContact = async (
  contactId: number,
  payload: ProviderContactPayload,
): Promise<ProviderContact | null> => {
  const name = normalizeContactName(payload.name);
  const position = normalizeOptionalText(payload.position);
  const phone = normalizeOptionalText(payload.phone);
  const email = normalizeOptionalText(payload.email);
  const isPrimary = Boolean(payload.is_primary);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      'SELECT id, provider_id FROM public.provider_contacts WHERE id = $1 LIMIT 1 FOR UPDATE;',
      [contactId],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return null;
    }

    if (isPrimary) {
      await client.query(
        'UPDATE public.provider_contacts SET is_primary = FALSE, updated_at = NOW() WHERE provider_id = $1 AND is_primary = TRUE AND id <> $2;',
        [existing.provider_id, contactId],
      );
    }

    await client.query(
      `
        UPDATE public.provider_contacts
        SET name = $1, position = $2, phone = $3, email = $4, is_primary = $5, updated_at = NOW()
        WHERE id = $6;
      `,
      [name, position, phone, email, isPrimary, contactId],
    );

    await client.query('COMMIT');
    return getProviderContactById(contactId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteProviderContact = async (contactId: number): Promise<boolean> => {
  const existing = await getProviderContactById(contactId);
  if (!existing) {
    return false;
  }

  await pool.query('DELETE FROM public.provider_contacts WHERE id = $1;', [contactId]);
  return true;
};
