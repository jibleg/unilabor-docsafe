import pool from '../config/db';

// Catalogo COMPARTIDO de clasificacion (Proveedor / Cliente): una sola tabla
// `provider_client_classifications` con columna `type` para poder agrupar
// tanto proveedores como clientes sin duplicar el catalogo. Cada clasificacion
// pertenece a un solo tipo (constraint CHECK en la BD).

export type ClassificationType = 'PROVIDER' | 'CLIENT';

export interface Classification {
  id: number;
  type: ClassificationType;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface ClassificationPayload {
  type: ClassificationType;
  name: string;
  description?: string | null;
  sort_order?: number | null;
}

const mapClassificationRow = (row: any): Classification => ({
  id: Number(row.id),
  type: row.type === 'CLIENT' ? 'CLIENT' : 'PROVIDER',
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

const normalizeRequiredName = (value: unknown): string => {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    const error = new Error('CLASSIFICATION_NAME_REQUIRED');
    (error as any).code = 'CLASSIFICATION_NAME_REQUIRED';
    throw error;
  }

  return normalizedValue;
};

const normalizeType = (value: unknown): ClassificationType => {
  if (value === 'PROVIDER' || value === 'CLIENT') {
    return value;
  }

  const error = new Error('CLASSIFICATION_TYPE_INVALID');
  (error as any).code = 'CLASSIFICATION_TYPE_INVALID';
  throw error;
};

const normalizeSortOrder = (value: unknown): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || !Number.isInteger(parsedValue)) {
    const error = new Error('CLASSIFICATION_SORT_ORDER_INVALID');
    (error as any).code = 'CLASSIFICATION_SORT_ORDER_INVALID';
    throw error;
  }

  return parsedValue;
};

export interface ListClassificationsOptions {
  type?: unknown;
  includeInactive?: boolean;
}

export const listClassifications = async (
  options: ListClassificationsOptions = {},
): Promise<Classification[]> => {
  const filters: string[] = [];
  const values: unknown[] = [];

  if (options.type === 'PROVIDER' || options.type === 'CLIENT') {
    values.push(options.type);
    filters.push(`type = $${values.length}`);
  }

  if (!options.includeInactive) {
    filters.push('is_active = TRUE');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await pool.query(
    `
      SELECT id, type, name, description, is_active, sort_order
      FROM public.provider_client_classifications
      ${whereClause}
      ORDER BY is_active DESC, sort_order ASC, name ASC;
    `,
    values,
  );
  return result.rows.map(mapClassificationRow);
};

export const getClassificationById = async (classificationId: number): Promise<Classification | null> => {
  const result = await pool.query(
    `
      SELECT id, type, name, description, is_active, sort_order
      FROM public.provider_client_classifications
      WHERE id = $1
      LIMIT 1;
    `,
    [classificationId],
  );

  const row = result.rows[0];
  return row ? mapClassificationRow(row) : null;
};

export const createClassification = async (payload: ClassificationPayload): Promise<Classification> => {
  const type = normalizeType(payload.type);
  const name = normalizeRequiredName(payload.name);
  const description = normalizeOptionalText(payload.description);
  const sortOrder = normalizeSortOrder(payload.sort_order ?? 0);

  const result = await pool.query(
    `
      INSERT INTO public.provider_client_classifications (type, name, description, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [type, name, description, sortOrder],
  );

  const created = await getClassificationById(Number(result.rows[0]?.id));
  if (!created) {
    const error = new Error('CLASSIFICATION_CREATE_FAILED');
    (error as any).code = 'CLASSIFICATION_CREATE_FAILED';
    throw error;
  }

  return created;
};

export const updateClassification = async (
  classificationId: number,
  payload: ClassificationPayload,
): Promise<Classification | null> => {
  const existing = await getClassificationById(classificationId);
  if (!existing) {
    return null;
  }

  const type = normalizeType(payload.type);
  const name = normalizeRequiredName(payload.name);
  const description = normalizeOptionalText(payload.description);
  const sortOrder = normalizeSortOrder(payload.sort_order ?? 0);

  await pool.query(
    `
      UPDATE public.provider_client_classifications
      SET type = $1, name = $2, description = $3, sort_order = $4, updated_at = NOW()
      WHERE id = $5;
    `,
    [type, name, description, sortOrder, classificationId],
  );

  return getClassificationById(classificationId);
};

export const deactivateClassification = async (classificationId: number): Promise<Classification | null> => {
  const existing = await getClassificationById(classificationId);
  if (!existing) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.provider_client_classifications
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1;
    `,
    [classificationId],
  );

  return getClassificationById(classificationId);
};

// Borrado DEFINITIVO. Solo procede sin dependencias: la FK de
// `helpdesk_suppliers.classification_id`/`clients.classification_id` (ON
// DELETE SET NULL) NO bloquea el borrado por si sola, asi que validamos a mano
// que ningun proveedor/cliente la este usando antes de eliminarla.
export const deleteClassification = async (classificationId: number): Promise<boolean> => {
  const existing = await getClassificationById(classificationId);
  if (!existing) {
    return false;
  }

  const [suppliersInUse, clientsInUse] = await Promise.all([
    pool.query('SELECT 1 FROM public.helpdesk_suppliers WHERE classification_id = $1 LIMIT 1;', [
      classificationId,
    ]),
    pool.query('SELECT 1 FROM public.clients WHERE classification_id = $1 LIMIT 1;', [classificationId]),
  ]);

  if (suppliersInUse.rows.length > 0 || clientsInUse.rows.length > 0) {
    const error = new Error('CLASSIFICATION_IN_USE');
    (error as any).code = 'CLASSIFICATION_IN_USE';
    throw error;
  }

  await pool.query('DELETE FROM public.provider_client_classifications WHERE id = $1;', [classificationId]);
  return true;
};

// Valida que una clasificacion referenciada (si se envio) exista y sea del
// `type` esperado. `expectedType` determina el codigo de error devuelto
// (`PROVIDER_CLASSIFICATION_INVALID` / `CLIENT_CLASSIFICATION_INVALID`) para
// que cada modulo lo mapee con su propio mensaje.
export const assertClassificationType = async (
  classificationId: number | null | undefined,
  expectedType: ClassificationType,
): Promise<void> => {
  if (classificationId === null || classificationId === undefined) {
    return;
  }

  const classification = await getClassificationById(classificationId);
  if (!classification || classification.type !== expectedType) {
    const errorCode = `${expectedType}_CLASSIFICATION_INVALID`;
    const error = new Error(errorCode);
    (error as any).code = errorCode;
    throw error;
  }
};
