import pool from '../config/db';
import { toIsoDate, toIsoDateTime } from '../utils/date-serialization';
import { withTransaction, type Queryable } from '../utils/transaction';
import type { HelpdeskCatalogItem } from './helpdesk-asset.service';

export interface HelpdeskLifecycleEventPayload {
  event_type_id: number;
  event_date: string;
  title: string;
  description?: string | null;
  maintenance_order_id?: number | null;
  ticket_id?: number | null;
  supplier_id?: number | null;
  performed_by_employee_id?: number | null;
  performed_by_provider?: string | null;
  cost?: number | null;
  currency?: string | null;
  calibration_certificate_no?: string | null;
  calibration_due_on?: string | null;
  disposal_reason_id?: number | null;
  from_location_id?: number | null;
  to_location_id?: number | null;
  notes?: string | null;
}

export interface HelpdeskLifecycleEventRecord {
  id: number;
  asset_id: number;
  event_type_id: number;
  event_code: string;
  event_date: string | null;
  title: string;
  description: string | null;
  maintenance_order_id: number | null;
  ticket_id: number | null;
  supplier_id: number | null;
  performed_by_employee_id: number | null;
  performed_by_provider: string | null;
  cost: number | null;
  currency: string | null;
  calibration_certificate_no: string | null;
  calibration_due_on: string | null;
  disposal_reason_id: number | null;
  from_location_id: number | null;
  to_location_id: number | null;
  notes: string | null;
  generated_act_document_id: number | null;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  event_type?: HelpdeskCatalogItem | null;
  supplier?: HelpdeskCatalogItem | null;
  disposal_reason?: HelpdeskCatalogItem | null;
  from_location?: HelpdeskCatalogItem | null;
  to_location?: HelpdeskCatalogItem | null;
  performed_by_employee?: { id: number; employee_code: string; full_name: string } | null;
}

const lifecycleTableExists = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.helpdesk_asset_lifecycle_events') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertLifecycleTable = async () => {
  if (!(await lifecycleTableExists())) {
    const error = new Error('HELPDESK_LIFECYCLE_TABLE_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_LIFECYCLE_TABLE_NOT_AVAILABLE';
    throw error;
  }
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

const mapEventRow = (row: any): HelpdeskLifecycleEventRecord => ({
  id: Number(row.id),
  asset_id: Number(row.asset_id),
  event_type_id: Number(row.event_type_id),
  event_code: String(row.event_code),
  event_date: row.event_date ? toIsoDate(row.event_date) : null,
  title: String(row.title),
  description: row.description ? String(row.description) : null,
  maintenance_order_id: row.maintenance_order_id ? Number(row.maintenance_order_id) : null,
  ticket_id: row.ticket_id ? Number(row.ticket_id) : null,
  supplier_id: row.supplier_id ? Number(row.supplier_id) : null,
  performed_by_employee_id: row.performed_by_employee_id ? Number(row.performed_by_employee_id) : null,
  performed_by_provider: row.performed_by_provider ? String(row.performed_by_provider) : null,
  cost: row.cost !== null && row.cost !== undefined ? Number(row.cost) : null,
  currency: row.currency ? String(row.currency) : null,
  calibration_certificate_no: row.calibration_certificate_no ? String(row.calibration_certificate_no) : null,
  calibration_due_on: row.calibration_due_on ? toIsoDate(row.calibration_due_on) : null,
  disposal_reason_id: row.disposal_reason_id ? Number(row.disposal_reason_id) : null,
  from_location_id: row.from_location_id ? Number(row.from_location_id) : null,
  to_location_id: row.to_location_id ? Number(row.to_location_id) : null,
  notes: row.notes ? String(row.notes) : null,
  generated_act_document_id: row.generated_act_document_id ? Number(row.generated_act_document_id) : null,
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
  updated_at: row.updated_at ? toIsoDateTime(row.updated_at) : undefined,
  event_type: mapCatalog(row.event_type_id, row.event_type_name, row.event_type_code, row.event_type_description),
  supplier: mapCatalog(row.supplier_id, row.supplier_name, undefined, row.supplier_description),
  disposal_reason: mapCatalog(row.disposal_reason_id, row.disposal_reason_name, row.disposal_reason_code),
  from_location: mapCatalog(row.from_location_id, row.from_location_name, row.from_location_code),
  to_location: mapCatalog(row.to_location_id, row.to_location_name, row.to_location_code),
  performed_by_employee:
    row.performed_by_employee_id && typeof row.performed_by_name === 'string'
      ? {
          id: Number(row.performed_by_employee_id),
          employee_code: String(row.performed_by_code ?? ''),
          full_name: String(row.performed_by_name),
        }
      : null,
});

const buildEventQuery = () => `
  SELECT
    e.*,
    et.code AS event_type_code,
    et.name AS event_type_name,
    et.description AS event_type_description,
    sup.name AS supplier_name,
    sup.description AS supplier_description,
    dr.code AS disposal_reason_code,
    dr.name AS disposal_reason_name,
    fl.code AS from_location_code,
    fl.name AS from_location_name,
    tl.code AS to_location_code,
    tl.name AS to_location_name,
    pe.employee_code AS performed_by_code,
    pe.full_name AS performed_by_name
  FROM public.helpdesk_asset_lifecycle_events e
  LEFT JOIN public.helpdesk_lifecycle_event_types et ON et.id = e.event_type_id
  LEFT JOIN public.helpdesk_suppliers sup ON sup.id = e.supplier_id
  LEFT JOIN public.helpdesk_disposal_reasons dr ON dr.id = e.disposal_reason_id
  LEFT JOIN public.helpdesk_locations fl ON fl.id = e.from_location_id
  LEFT JOIN public.helpdesk_locations tl ON tl.id = e.to_location_id
  LEFT JOIN public.employees pe ON pe.id = e.performed_by_employee_id
`;

const generateLifecycleEventCode = async (client: Queryable): Promise<string> => {
  const result = await client.query(`SELECT nextval('public.helpdesk_lifecycle_event_code_seq') AS seq;`);
  const seq = Number(result.rows[0]?.seq ?? 1);
  return `EV-${String(seq).padStart(6, '0')}`;
};

const getEventTypeCode = async (client: Queryable, eventTypeId: number): Promise<string | null> => {
  const result = await client.query(
    `SELECT code FROM public.helpdesk_lifecycle_event_types WHERE id = $1 LIMIT 1;`,
    [eventTypeId],
  );
  const code = result.rows[0]?.code;
  return code ? String(code).trim().toUpperCase() : null;
};

export const getLifecycleEventById = async (
  eventId: number,
): Promise<HelpdeskLifecycleEventRecord | null> => {
  await assertLifecycleTable();
  const result = await pool.query(`${buildEventQuery()} WHERE e.id = $1 LIMIT 1;`, [eventId]);
  return result.rows[0] ? mapEventRow(result.rows[0]) : null;
};

export const listAssetLifecycleEvents = async (
  assetId: number,
): Promise<HelpdeskLifecycleEventRecord[]> => {
  await assertLifecycleTable();
  const result = await pool.query(
    `${buildEventQuery()} WHERE e.asset_id = $1 ORDER BY e.event_date DESC, e.id DESC;`,
    [assetId],
  );
  return result.rows.map(mapEventRow);
};

const recordAssetHistory = async (
  client: Queryable,
  assetId: number,
  action: string,
  summary: string,
  userId?: string | null,
  newValues?: unknown,
) => {
  await client.query(
    `
      INSERT INTO public.helpdesk_asset_history (asset_id, action, summary, new_values, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5);
    `,
    [assetId, action, summary, newValues ?? null, userId ?? null],
  );
};

// Efectos colaterales sobre el activo segun el tipo de evento.
const applyAssetSideEffects = async (
  client: Queryable,
  assetId: number,
  eventTypeCode: string | null,
  payload: HelpdeskLifecycleEventPayload,
  userId?: string | null,
) => {
  if (eventTypeCode === 'COMMISSIONING') {
    await client.query(
      `UPDATE public.helpdesk_assets SET placed_in_service_on = COALESCE($1, placed_in_service_on), updated_by_user_id = $2, updated_at = NOW() WHERE id = $3;`,
      [normalizeOptionalText(payload.event_date), userId ?? null, assetId],
    );
    await recordAssetHistory(client, assetId, 'COMMISSIONING', 'Equipo puesto en servicio.', userId, {
      placed_in_service_on: payload.event_date,
    });
    return;
  }

  if (eventTypeCode === 'RELOCATION' && payload.to_location_id) {
    await client.query(
      `UPDATE public.helpdesk_assets SET location_id = $1, updated_by_user_id = $2, updated_at = NOW() WHERE id = $3;`,
      [payload.to_location_id, userId ?? null, assetId],
    );
    await recordAssetHistory(client, assetId, 'RELOCATION', 'Equipo reubicado.', userId, {
      to_location_id: payload.to_location_id,
    });
    return;
  }

  if (eventTypeCode === 'DECOMMISSION') {
    await client.query(
      `
        UPDATE public.helpdesk_assets
        SET is_active = FALSE,
            decommissioned_on = COALESCE($1, CURRENT_DATE),
            disposal_reason_id = $2,
            updated_by_user_id = $3,
            updated_at = NOW()
        WHERE id = $4;
      `,
      [normalizeOptionalText(payload.event_date), payload.disposal_reason_id ?? null, userId ?? null, assetId],
    );
    await recordAssetHistory(client, assetId, 'DECOMMISSION', 'Equipo dado de baja del inventario.', userId, {
      decommissioned_on: payload.event_date,
      disposal_reason_id: payload.disposal_reason_id ?? null,
    });
  }
};

export const createLifecycleEvent = async (
  assetId: number,
  payload: HelpdeskLifecycleEventPayload,
  userId?: string | null,
): Promise<HelpdeskLifecycleEventRecord> => {
  await assertLifecycleTable();

  const eventId = await withTransaction(async (client) => {
    const assetResult = await client.query(
      `SELECT id FROM public.helpdesk_assets WHERE id = $1 LIMIT 1;`,
      [assetId],
    );
    if (assetResult.rows.length === 0) {
      const error = new Error('HELPDESK_ASSET_NOT_FOUND');
      (error as any).code = 'HELPDESK_ASSET_NOT_FOUND';
      throw error;
    }

    const eventCode = await generateLifecycleEventCode(client);
    const eventTypeCode = await getEventTypeCode(client, payload.event_type_id);

    const result = await client.query(
      `
        INSERT INTO public.helpdesk_asset_lifecycle_events (
          asset_id, event_type_id, event_code, event_date, title, description,
          maintenance_order_id, ticket_id, supplier_id,
          performed_by_employee_id, performed_by_provider, cost, currency,
          calibration_certificate_no, calibration_due_on,
          disposal_reason_id, from_location_id, to_location_id, notes,
          created_by_user_id, updated_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20
        )
        RETURNING id;
      `,
      [
        assetId,
        payload.event_type_id,
        eventCode,
        payload.event_date.trim(),
        payload.title.trim(),
        normalizeOptionalText(payload.description),
        payload.maintenance_order_id ?? null,
        payload.ticket_id ?? null,
        payload.supplier_id ?? null,
        payload.performed_by_employee_id ?? null,
        normalizeOptionalText(payload.performed_by_provider),
        payload.cost ?? null,
        normalizeOptionalText(payload.currency) ?? 'MXN',
        normalizeOptionalText(payload.calibration_certificate_no),
        normalizeOptionalText(payload.calibration_due_on),
        payload.disposal_reason_id ?? null,
        payload.from_location_id ?? null,
        payload.to_location_id ?? null,
        normalizeOptionalText(payload.notes),
        userId ?? null,
      ],
    );

    const newEventId = Number(result.rows[0]?.id);
    await applyAssetSideEffects(client, assetId, eventTypeCode, payload, userId);
    return newEventId;
  });

  const created = await getLifecycleEventById(eventId);
  if (!created) {
    const error = new Error('HELPDESK_LIFECYCLE_EVENT_CREATION_FAILED');
    (error as any).code = 'HELPDESK_LIFECYCLE_EVENT_CREATION_FAILED';
    throw error;
  }
  return created;
};

export const updateLifecycleEvent = async (
  eventId: number,
  payload: HelpdeskLifecycleEventPayload,
  userId?: string | null,
): Promise<HelpdeskLifecycleEventRecord | null> => {
  await assertLifecycleTable();
  const current = await getLifecycleEventById(eventId);
  if (!current) {
    return null;
  }

  await pool.query(
    `
      UPDATE public.helpdesk_asset_lifecycle_events
      SET event_type_id = $1,
          event_date = $2,
          title = $3,
          description = $4,
          maintenance_order_id = $5,
          ticket_id = $6,
          supplier_id = $7,
          performed_by_employee_id = $8,
          performed_by_provider = $9,
          cost = $10,
          currency = $11,
          calibration_certificate_no = $12,
          calibration_due_on = $13,
          disposal_reason_id = $14,
          from_location_id = $15,
          to_location_id = $16,
          notes = $17,
          updated_by_user_id = $18,
          updated_at = NOW()
      WHERE id = $19;
    `,
    [
      payload.event_type_id,
      payload.event_date.trim(),
      payload.title.trim(),
      normalizeOptionalText(payload.description),
      payload.maintenance_order_id ?? null,
      payload.ticket_id ?? null,
      payload.supplier_id ?? null,
      payload.performed_by_employee_id ?? null,
      normalizeOptionalText(payload.performed_by_provider),
      payload.cost ?? null,
      normalizeOptionalText(payload.currency) ?? 'MXN',
      normalizeOptionalText(payload.calibration_certificate_no),
      normalizeOptionalText(payload.calibration_due_on),
      payload.disposal_reason_id ?? null,
      payload.from_location_id ?? null,
      payload.to_location_id ?? null,
      normalizeOptionalText(payload.notes),
      userId ?? null,
      eventId,
    ],
  );

  return getLifecycleEventById(eventId);
};

export const setLifecycleEventGeneratedDocument = async (
  client: Queryable,
  eventId: number,
  documentId: number,
): Promise<void> => {
  await client.query(
    `UPDATE public.helpdesk_asset_lifecycle_events SET generated_act_document_id = $1, updated_at = NOW() WHERE id = $2;`,
    [documentId, eventId],
  );
};
