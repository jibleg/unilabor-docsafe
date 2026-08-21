import pool from '../config/db';
import { assertClassificationType } from './classification.service';
import {
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
  type PaginatedResult,
  type PaginationInput,
} from '../utils/pagination';

// Clientes: catalogo PROPIO (tabla `clients`), a diferencia de Proveedores no
// se comparte con Activos ni con ningun otro modulo.
export interface ClientSummary {
  id: number;
  name: string;
  description: string | null;
  rfc: string | null;
  website: string | null;
  address_street: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  notes: string | null;
  classification_id: number | null;
  is_active: boolean;
}

const CLIENT_COLUMNS = `
  id, name, description, rfc, website,
  address_street, address_neighborhood, address_city, address_state, address_zip, address_country,
  notes, classification_id, is_active
`;

const mapClientRow = (row: any): ClientSummary => ({
  id: Number(row.id),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  rfc: row.rfc ? String(row.rfc) : null,
  website: row.website ? String(row.website) : null,
  address_street: row.address_street ? String(row.address_street) : null,
  address_neighborhood: row.address_neighborhood ? String(row.address_neighborhood) : null,
  address_city: row.address_city ? String(row.address_city) : null,
  address_state: row.address_state ? String(row.address_state) : null,
  address_zip: row.address_zip ? String(row.address_zip) : null,
  address_country: row.address_country ? String(row.address_country) : null,
  notes: row.notes ? String(row.notes) : null,
  classification_id: row.classification_id ? Number(row.classification_id) : null,
  is_active: Boolean(row.is_active),
});

export interface ClientListOptions extends PaginationInput {
  search?: unknown;
  includeInactive?: boolean;
  classificationId?: number | null;
}

const CLIENT_SEARCH_COLUMNS = ['name', 'rfc'];

// Paginacion server-side opt-in (mismo contrato que Proveedores): sin
// page/limit el cliente sigue recibiendo todas las filas en una sola "pagina".
export const listClients = async (
  options: ClientListOptions = {},
): Promise<PaginatedResult<ClientSummary>> => {
  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const search = buildIlikeSearch(CLIENT_SEARCH_COLUMNS, options.search, 0);

  const filters = options.includeInactive ? [] : ['is_active = TRUE'];
  if (search.clause) {
    filters.push(search.clause);
  }
  const values: Array<string | number> = [...search.values];
  if (options.classificationId) {
    values.push(options.classificationId);
    filters.push(`classification_id = $${values.length}`);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const limitSql = paginate ? `LIMIT $${values.length + 1} OFFSET $${values.length + 2}` : '';
  const dataValues = paginate ? [...values, limit, offset] : values;

  const dataResult = await pool.query(
    `
      SELECT ${CLIENT_COLUMNS}
      FROM public.clients
      ${whereClause}
      ORDER BY is_active DESC, name ASC
      ${limitSql};
    `,
    dataValues,
  );
  const data = dataResult.rows.map(mapClientRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.clients ${whereClause};`,
    values,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

export const getClientById = async (clientId: number): Promise<ClientSummary | null> => {
  const result = await pool.query(
    `
      SELECT ${CLIENT_COLUMNS}
      FROM public.clients
      WHERE id = $1
      LIMIT 1;
    `,
    [clientId],
  );

  const row = result.rows[0];
  return row ? mapClientRow(row) : null;
};

export interface ClientPayload {
  name: string;
  description?: string | null;
  rfc?: string | null;
  website?: string | null;
  address_street?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address_country?: string | null;
  notes?: string | null;
  classification_id?: number | null;
}

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
    const error = new Error('CLIENT_CATEGORY_NAME_REQUIRED');
    (error as any).code = 'CLIENT_CATEGORY_NAME_REQUIRED';
    throw error;
  }

  return normalizedValue;
};

const normalizeRequiredCode = (value: unknown): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('CLIENT_CATEGORY_CODE_REQUIRED');
    (error as any).code = 'CLIENT_CATEGORY_CODE_REQUIRED';
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
    const error = new Error('CLIENT_CATEGORY_SORT_ORDER_INVALID');
    (error as any).code = 'CLIENT_CATEGORY_SORT_ORDER_INVALID';
    throw error;
  }

  return parsedValue;
};

const normalizeClientName = (value: unknown): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('CLIENT_NAME_REQUIRED');
    (error as any).code = 'CLIENT_NAME_REQUIRED';
    throw error;
  }

  return normalizedValue;
};

export const createClient = async (payload: ClientPayload): Promise<ClientSummary> => {
  const name = normalizeClientName(payload.name);
  const description = normalizeOptionalText(payload.description);
  const rfc = normalizeOptionalText(payload.rfc);
  const website = normalizeOptionalText(payload.website);
  const addressStreet = normalizeOptionalText(payload.address_street);
  const addressNeighborhood = normalizeOptionalText(payload.address_neighborhood);
  const addressCity = normalizeOptionalText(payload.address_city);
  const addressState = normalizeOptionalText(payload.address_state);
  const addressZip = normalizeOptionalText(payload.address_zip);
  const addressCountry = normalizeOptionalText(payload.address_country);
  const notes = normalizeOptionalText(payload.notes);
  const classificationId = payload.classification_id ?? null;

  await assertClassificationType(classificationId, 'CLIENT');

  const result = await pool.query(
    `
      INSERT INTO public.clients (
        name, description, rfc, website,
        address_street, address_neighborhood, address_city, address_state, address_zip, address_country,
        notes, classification_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;
    `,
    [
      name, description, rfc, website,
      addressStreet, addressNeighborhood, addressCity, addressState, addressZip, addressCountry,
      notes, classificationId,
    ],
  );

  const created = await getClientById(Number(result.rows[0]?.id));
  if (!created) {
    const error = new Error('CLIENT_CREATE_FAILED');
    (error as any).code = 'CLIENT_CREATE_FAILED';
    throw error;
  }

  return created;
};

export const updateClient = async (
  clientId: number,
  payload: ClientPayload,
): Promise<ClientSummary | null> => {
  const existing = await getClientById(clientId);
  if (!existing) {
    return null;
  }

  const name = normalizeClientName(payload.name);
  const description = normalizeOptionalText(payload.description);
  const rfc = normalizeOptionalText(payload.rfc);
  const website = normalizeOptionalText(payload.website);
  const addressStreet = normalizeOptionalText(payload.address_street);
  const addressNeighborhood = normalizeOptionalText(payload.address_neighborhood);
  const addressCity = normalizeOptionalText(payload.address_city);
  const addressState = normalizeOptionalText(payload.address_state);
  const addressZip = normalizeOptionalText(payload.address_zip);
  const addressCountry = normalizeOptionalText(payload.address_country);
  const notes = normalizeOptionalText(payload.notes);
  const classificationId = payload.classification_id ?? null;

  await assertClassificationType(classificationId, 'CLIENT');

  await pool.query(
    `
      UPDATE public.clients
      SET name = $1, description = $2, rfc = $3, website = $4,
          address_street = $5, address_neighborhood = $6, address_city = $7, address_state = $8,
          address_zip = $9, address_country = $10, notes = $11, classification_id = $12, updated_at = NOW()
      WHERE id = $13;
    `,
    [
      name, description, rfc, website,
      addressStreet, addressNeighborhood, addressCity, addressState, addressZip, addressCountry,
      notes, classificationId, clientId,
    ],
  );

  return getClientById(clientId);
};

export const deactivateClient = async (clientId: number): Promise<ClientSummary | null> => {
  const existing = await getClientById(clientId);
  if (!existing) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.clients
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1;
    `,
    [clientId],
  );

  return getClientById(clientId);
};

// --- Categorias de documento de cliente (clasificacion, catalogo administrable) ---

export interface ClientDocumentCategory {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface ClientDocumentCategoryPayload {
  code?: string | null;
  name: string;
  description?: string | null;
  sort_order?: number | null;
}

const mapCategoryRow = (row: any): ClientDocumentCategory => ({
  id: Number(row.id),
  code: String(row.code),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  is_active: Boolean(row.is_active),
  sort_order: Number(row.sort_order ?? 0),
});

export const listClientDocumentCategories = async (
  includeInactive = false,
): Promise<ClientDocumentCategory[]> => {
  const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
  const result = await pool.query(`
    SELECT id, code, name, description, is_active, sort_order
    FROM public.client_document_categories
    ${whereClause}
    ORDER BY is_active DESC, sort_order ASC, name ASC;
  `);
  return result.rows.map(mapCategoryRow);
};

export const getClientDocumentCategoryById = async (
  categoryId: number,
): Promise<ClientDocumentCategory | null> => {
  const result = await pool.query(
    `
      SELECT id, code, name, description, is_active, sort_order
      FROM public.client_document_categories
      WHERE id = $1
      LIMIT 1;
    `,
    [categoryId],
  );

  const row = result.rows[0];
  return row ? mapCategoryRow(row) : null;
};

export const createClientDocumentCategory = async (
  payload: ClientDocumentCategoryPayload,
): Promise<ClientDocumentCategory> => {
  const code = normalizeRequiredCode(payload.code);
  const name = normalizeRequiredText(payload.name);
  const description = normalizeOptionalText(payload.description);
  const sortOrder = normalizeSortOrder(payload.sort_order ?? 0);

  const result = await pool.query(
    `
      INSERT INTO public.client_document_categories (code, name, description, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [code, name, description, sortOrder],
  );

  const created = await getClientDocumentCategoryById(Number(result.rows[0]?.id));
  if (!created) {
    const error = new Error('CLIENT_CATEGORY_CREATE_FAILED');
    (error as any).code = 'CLIENT_CATEGORY_CREATE_FAILED';
    throw error;
  }

  return created;
};

export const updateClientDocumentCategory = async (
  categoryId: number,
  payload: ClientDocumentCategoryPayload,
): Promise<ClientDocumentCategory | null> => {
  const existing = await getClientDocumentCategoryById(categoryId);
  if (!existing) {
    return null;
  }

  const code = normalizeRequiredCode(payload.code);
  const name = normalizeRequiredText(payload.name);
  const description = normalizeOptionalText(payload.description);
  const sortOrder = normalizeSortOrder(payload.sort_order ?? 0);

  await pool.query(
    `
      UPDATE public.client_document_categories
      SET code = $1, name = $2, description = $3, sort_order = $4, updated_at = NOW()
      WHERE id = $5;
    `,
    [code, name, description, sortOrder, categoryId],
  );

  return getClientDocumentCategoryById(categoryId);
};

export const deactivateClientDocumentCategory = async (
  categoryId: number,
): Promise<ClientDocumentCategory | null> => {
  const existing = await getClientDocumentCategoryById(categoryId);
  if (!existing) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.client_document_categories
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1;
    `,
    [categoryId],
  );

  return getClientDocumentCategoryById(categoryId);
};

// Borrado DEFINITIVO. Solo procede sin dependencias: la FK de
// `client_documents.category_id` (ON DELETE RESTRICT) hace que Postgres
// rechace con 23503 si algun documento la usa; el controller lo traduce a "en uso".
export const deleteClientDocumentCategory = async (categoryId: number): Promise<boolean> => {
  const existing = await getClientDocumentCategoryById(categoryId);
  if (!existing) {
    return false;
  }

  await pool.query('DELETE FROM public.client_document_categories WHERE id = $1;', [categoryId]);
  return true;
};

// --- Contactos del cliente ---------------------------------------------------

export interface ClientContact {
  id: number;
  client_id: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface ClientContactPayload {
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  is_primary?: boolean;
}

const mapContactRow = (row: any): ClientContact => ({
  id: Number(row.id),
  client_id: Number(row.client_id),
  name: String(row.name),
  position: row.position ? String(row.position) : null,
  phone: row.phone ? String(row.phone) : null,
  email: row.email ? String(row.email) : null,
  is_primary: Boolean(row.is_primary),
});

const normalizeContactName = (value: unknown): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('CLIENT_CONTACT_NAME_REQUIRED');
    (error as any).code = 'CLIENT_CONTACT_NAME_REQUIRED';
    throw error;
  }

  return normalizedValue;
};

export const listClientContacts = async (clientId: number): Promise<ClientContact[]> => {
  const result = await pool.query(
    `
      SELECT id, client_id, name, position, phone, email, is_primary
      FROM public.client_contacts
      WHERE client_id = $1
      ORDER BY is_primary DESC, name ASC;
    `,
    [clientId],
  );
  return result.rows.map(mapContactRow);
};

export const getClientContactById = async (contactId: number): Promise<ClientContact | null> => {
  const result = await pool.query(
    `
      SELECT id, client_id, name, position, phone, email, is_primary
      FROM public.client_contacts
      WHERE id = $1
      LIMIT 1;
    `,
    [contactId],
  );

  const row = result.rows[0];
  return row ? mapContactRow(row) : null;
};

// Marcar un contacto como principal quita el flag a cualquier otro del mismo
// cliente en la misma transaccion (el indice unico parcial solo permite uno
// activo a la vez; si no se libera antes, el INSERT/UPDATE choca con 23505).
export const createClientContact = async (
  clientId: number,
  payload: ClientContactPayload,
): Promise<ClientContact> => {
  const name = normalizeContactName(payload.name);
  const position = normalizeOptionalText(payload.position);
  const phone = normalizeOptionalText(payload.phone);
  const email = normalizeOptionalText(payload.email);
  const isPrimary = Boolean(payload.is_primary);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const clientResult = await client.query(
      'SELECT id FROM public.clients WHERE id = $1 LIMIT 1 FOR UPDATE;',
      [clientId],
    );
    if (!clientResult.rows[0]) {
      const error = new Error('CLIENT_NOT_FOUND');
      (error as any).code = 'CLIENT_NOT_FOUND';
      throw error;
    }

    if (isPrimary) {
      await client.query(
        'UPDATE public.client_contacts SET is_primary = FALSE, updated_at = NOW() WHERE client_id = $1 AND is_primary = TRUE;',
        [clientId],
      );
    }

    const insertResult = await client.query(
      `
        INSERT INTO public.client_contacts (client_id, name, position, phone, email, is_primary)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `,
      [clientId, name, position, phone, email, isPrimary],
    );

    await client.query('COMMIT');

    const created = await getClientContactById(Number(insertResult.rows[0]?.id));
    if (!created) {
      const error = new Error('CLIENT_CONTACT_CREATE_FAILED');
      (error as any).code = 'CLIENT_CONTACT_CREATE_FAILED';
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

export const updateClientContact = async (
  contactId: number,
  payload: ClientContactPayload,
): Promise<ClientContact | null> => {
  const name = normalizeContactName(payload.name);
  const position = normalizeOptionalText(payload.position);
  const phone = normalizeOptionalText(payload.phone);
  const email = normalizeOptionalText(payload.email);
  const isPrimary = Boolean(payload.is_primary);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      'SELECT id, client_id FROM public.client_contacts WHERE id = $1 LIMIT 1 FOR UPDATE;',
      [contactId],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return null;
    }

    if (isPrimary) {
      await client.query(
        'UPDATE public.client_contacts SET is_primary = FALSE, updated_at = NOW() WHERE client_id = $1 AND is_primary = TRUE AND id <> $2;',
        [existing.client_id, contactId],
      );
    }

    await client.query(
      `
        UPDATE public.client_contacts
        SET name = $1, position = $2, phone = $3, email = $4, is_primary = $5, updated_at = NOW()
        WHERE id = $6;
      `,
      [name, position, phone, email, isPrimary, contactId],
    );

    await client.query('COMMIT');
    return getClientContactById(contactId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteClientContact = async (contactId: number): Promise<boolean> => {
  const existing = await getClientContactById(contactId);
  if (!existing) {
    return false;
  }

  await pool.query('DELETE FROM public.client_contacts WHERE id = $1;', [contactId]);
  return true;
};
