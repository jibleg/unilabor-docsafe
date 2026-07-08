import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { withTransaction, type Queryable } from '../utils/transaction';
import {
  buildAssetQuery,
  mapAssetRow,
  type HelpdeskAssetRecord,
} from './helpdesk-asset.service';
import { createLifecycleEvent, setLifecycleEventGeneratedDocument } from './helpdesk-lifecycle.service';
import { uploadAssetDocument } from './helpdesk-asset-document.service';
import { renderHandoverActaPdf, type HandoverActaAssetLine } from './helpdesk-handover-acta.service';

export type HandoverStatus = 'DRAFT' | 'SIGNED' | 'VOID';

export interface HandoverItemPayload {
  asset_id: number;
  receipt_condition_id?: number | null;
  observations?: string | null;
}

export interface HandoverPayload {
  unit_id: number;
  area_id: number;
  received_by_user_id: string;
  received_by_name: string;
  delivered_by_name: string;
  notes?: string | null;
  items: HandoverItemPayload[];
}

export interface HandoverSignPayload {
  deliverer_signature: string;
  receiver_signature: string;
  delivered_by_name?: string | null;
  received_by_name?: string | null;
  notes?: string | null;
}

export interface HandoverItemRecord {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  brand_name: string | null;
  model: string | null;
  serial_number: string | null;
  receipt_condition_id: number | null;
  receipt_condition_name: string | null;
  observations: string | null;
}

export interface HandoverRecord {
  id: number;
  folio: string;
  unit_id: number;
  unit_name: string | null;
  area_id: number;
  area_name: string | null;
  delivered_by_user_id: string | null;
  delivered_by_name: string;
  received_by_user_id: string | null;
  received_by_name: string;
  handover_at: string | null;
  status: HandoverStatus;
  void_reason: string | null;
  notes: string | null;
  has_document: boolean;
  item_count: number;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  items?: HandoverItemRecord[];
}

const handoverTablesExist = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.helpdesk_handovers') IS NOT NULL
        AND to_regclass('public.helpdesk_handover_items') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertHandoverTables = async (): Promise<void> => {
  if (!(await handoverTablesExist())) {
    const error = new Error('HELPDESK_HANDOVER_TABLES_NOT_AVAILABLE');
    (error as any).code = 'HELPDESK_HANDOVER_TABLES_NOT_AVAILABLE';
    throw error;
  }
};

const fail = (code: string, message?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (message) {
    (error as any).publicMessage = message;
  }
  throw error;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

// --- Activos pendientes de entrega para un area ---
// Un activo esta pendiente si NO forma parte de ningun acta FIRMADA (bloqueo
// total: una vez entregado no vuelve a estar disponible salvo que el acta se anule).
export const listAssetsPendingHandover = async (
  areaId: number,
): Promise<HelpdeskAssetRecord[]> => {
  await assertHandoverTables();
  const result = await pool.query(
    `
      ${buildAssetQuery()}
      WHERE a.is_active = TRUE
        AND a.area_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM public.helpdesk_handover_items hi
          JOIN public.helpdesk_handovers h ON h.id = hi.handover_id
          WHERE hi.asset_id = a.id AND h.status = 'SIGNED'
        )
      ORDER BY a.asset_code ASC, a.name ASC;
    `,
    [areaId],
  );
  return result.rows.map(mapAssetRow);
};

const mapHandoverRow = (row: any): HandoverRecord => ({
  id: Number(row.id),
  folio: String(row.folio),
  unit_id: Number(row.unit_id),
  unit_name: row.unit_name ? String(row.unit_name) : null,
  area_id: Number(row.area_id),
  area_name: row.area_name ? String(row.area_name) : null,
  delivered_by_user_id: row.delivered_by_user_id ? String(row.delivered_by_user_id) : null,
  delivered_by_name: String(row.delivered_by_name),
  received_by_user_id: row.received_by_user_id ? String(row.received_by_user_id) : null,
  received_by_name: String(row.received_by_name),
  handover_at: row.handover_at ? toIsoDateTime(row.handover_at) : null,
  status: String(row.status) as HandoverStatus,
  void_reason: row.void_reason ? String(row.void_reason) : null,
  notes: row.notes ? String(row.notes) : null,
  has_document: Boolean(row.document_path),
  item_count: Number(row.item_count ?? 0),
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
  updated_at: row.updated_at ? toIsoDateTime(row.updated_at) : undefined,
});

const buildHandoverQuery = () => `
  SELECT
    h.*,
    u.name AS unit_name,
    ar.name AS area_name,
    (SELECT COUNT(*)::int FROM public.helpdesk_handover_items hi WHERE hi.handover_id = h.id) AS item_count
  FROM public.helpdesk_handovers h
  LEFT JOIN public.helpdesk_asset_units u ON u.id = h.unit_id
  LEFT JOIN public.helpdesk_asset_areas ar ON ar.id = h.area_id
`;

export interface HandoverListFilters {
  status?: HandoverStatus | null;
  areaId?: number | null;
  receivedByUserId?: string | null;
}

export const listHandovers = async (
  filters: HandoverListFilters = {},
): Promise<HandoverRecord[]> => {
  await assertHandoverTables();

  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`h.status = $${values.length}`);
  }
  if (filters.areaId) {
    values.push(filters.areaId);
    clauses.push(`h.area_id = $${values.length}`);
  }
  if (filters.receivedByUserId) {
    values.push(filters.receivedByUserId);
    clauses.push(`h.received_by_user_id = $${values.length}`);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await pool.query(
    `${buildHandoverQuery()} ${where} ORDER BY h.created_at DESC, h.id DESC;`,
    values,
  );
  return result.rows.map(mapHandoverRow);
};

const listHandoverItems = async (handoverId: number): Promise<HandoverItemRecord[]> => {
  const result = await pool.query(
    `
      SELECT
        hi.asset_id,
        hi.receipt_condition_id,
        hi.observations,
        a.asset_code,
        a.name AS asset_name,
        a.model,
        a.serial_number,
        b.name AS brand_name,
        rc.name AS receipt_condition_name
      FROM public.helpdesk_handover_items hi
      JOIN public.helpdesk_assets a ON a.id = hi.asset_id
      LEFT JOIN public.helpdesk_asset_brands b ON b.id = a.brand_id
      LEFT JOIN public.helpdesk_receipt_conditions rc ON rc.id = hi.receipt_condition_id
      WHERE hi.handover_id = $1
      ORDER BY a.asset_code ASC, a.name ASC;
    `,
    [handoverId],
  );
  return result.rows.map((row) => ({
    asset_id: Number(row.asset_id),
    asset_code: String(row.asset_code),
    asset_name: String(row.asset_name),
    brand_name: row.brand_name ? String(row.brand_name) : null,
    model: row.model ? String(row.model) : null,
    serial_number: row.serial_number ? String(row.serial_number) : null,
    receipt_condition_id: row.receipt_condition_id ? Number(row.receipt_condition_id) : null,
    receipt_condition_name: row.receipt_condition_name ? String(row.receipt_condition_name) : null,
    observations: row.observations ? String(row.observations) : null,
  }));
};

export const getHandoverById = async (handoverId: number): Promise<HandoverRecord | null> => {
  await assertHandoverTables();
  const result = await pool.query(`${buildHandoverQuery()} WHERE h.id = $1 LIMIT 1;`, [handoverId]);
  if (!result.rows[0]) {
    return null;
  }
  const record = mapHandoverRow(result.rows[0]);
  record.items = await listHandoverItems(handoverId);
  return record;
};

const insertItems = async (
  client: Queryable,
  handoverId: number,
  items: HandoverItemPayload[],
): Promise<void> => {
  for (const item of items) {
    await client.query(
      `
        INSERT INTO public.helpdesk_handover_items (handover_id, asset_id, receipt_condition_id, observations)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (handover_id, asset_id) DO UPDATE
          SET receipt_condition_id = EXCLUDED.receipt_condition_id,
              observations = EXCLUDED.observations;
      `,
      [handoverId, item.asset_id, item.receipt_condition_id ?? null, normalizeOptionalText(item.observations)],
    );
  }
};

export const createHandover = async (
  payload: HandoverPayload,
  userId?: string | null,
): Promise<HandoverRecord> => {
  await assertHandoverTables();

  const handoverId = await withTransaction(async (client) => {
    const seqResult = await client.query(`SELECT nextval('public.helpdesk_handover_code_seq') AS seq;`);
    const seq = Number(seqResult.rows[0]?.seq ?? 1);
    const folio = `AE-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

    const result = await client.query(
      `
        INSERT INTO public.helpdesk_handovers (
          folio, unit_id, area_id,
          delivered_by_user_id, delivered_by_name,
          received_by_user_id, received_by_name,
          notes, status, created_by_user_id, updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', $9, $9)
        RETURNING id;
      `,
      [
        folio,
        payload.unit_id,
        payload.area_id,
        userId ?? null,
        payload.delivered_by_name.trim(),
        payload.received_by_user_id,
        payload.received_by_name.trim(),
        normalizeOptionalText(payload.notes),
        userId ?? null,
      ],
    );
    const newId = Number(result.rows[0]?.id);
    await insertItems(client, newId, payload.items);
    return newId;
  });

  const created = await getHandoverById(handoverId);
  if (!created) {
    return fail('HELPDESK_HANDOVER_CREATION_FAILED');
  }
  return created;
};

export const updateHandoverDraft = async (
  handoverId: number,
  payload: HandoverPayload,
  userId?: string | null,
): Promise<HandoverRecord | null> => {
  await assertHandoverTables();

  await withTransaction(async (client) => {
    const current = await client.query(
      `SELECT status FROM public.helpdesk_handovers WHERE id = $1 FOR UPDATE;`,
      [handoverId],
    );
    if (current.rows.length === 0) {
      return fail('HELPDESK_HANDOVER_NOT_FOUND');
    }
    if (String(current.rows[0].status) !== 'DRAFT') {
      return fail('HELPDESK_HANDOVER_INVALID_STATE', 'Solo se puede editar un acta en borrador.');
    }

    await client.query(
      `
        UPDATE public.helpdesk_handovers
        SET unit_id = $1,
            area_id = $2,
            received_by_user_id = $3,
            received_by_name = $4,
            delivered_by_name = $5,
            notes = $6,
            updated_by_user_id = $7,
            updated_at = NOW()
        WHERE id = $8;
      `,
      [
        payload.unit_id,
        payload.area_id,
        payload.received_by_user_id,
        payload.received_by_name.trim(),
        payload.delivered_by_name.trim(),
        normalizeOptionalText(payload.notes),
        userId ?? null,
        handoverId,
      ],
    );

    // Reemplazo total del conjunto de items del borrador.
    await client.query(`DELETE FROM public.helpdesk_handover_items WHERE handover_id = $1;`, [handoverId]);
    await insertItems(client, handoverId, payload.items);
  });

  return getHandoverById(handoverId);
};

export const deleteHandoverDraft = async (handoverId: number): Promise<boolean> => {
  await assertHandoverTables();
  const current = await pool.query(
    `SELECT status FROM public.helpdesk_handovers WHERE id = $1 LIMIT 1;`,
    [handoverId],
  );
  if (current.rows.length === 0) {
    return false;
  }
  if (String(current.rows[0].status) !== 'DRAFT') {
    return fail('HELPDESK_HANDOVER_INVALID_STATE', 'Solo se puede eliminar un acta en borrador.');
  }
  await pool.query(`DELETE FROM public.helpdesk_handovers WHERE id = $1;`, [handoverId]);
  return true;
};

// Decodifica un data URL PNG (o base64 crudo) y lo escribe en disco. Devuelve la ruta.
const writeSignatureImage = (dataUrl: string): string => {
  const raw = dataUrl.trim();
  const match = /^data:image\/png;base64,(.+)$/i.exec(raw);
  const base64 = (match && match[1]) || raw;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < 100) {
    return fail('HELPDESK_HANDOVER_INVALID_SIGNATURE', 'La firma electronica es invalida o esta vacia.');
  }
  const dir = process.env.DIRECTORY_UPLOAD_SIGNATURE || 'uploads/signatures';
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `SIGN-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

const safeUnlink = (filePath: string | null | undefined) => {
  if (!filePath) {
    return;
  }
  try {
    fs.unlinkSync(filePath);
  } catch {
    // archivo inexistente: nada que hacer
  }
};

const getCatalogIdByCode = async (
  table: 'helpdesk_lifecycle_event_types' | 'helpdesk_document_kinds',
  code: string,
): Promise<number | null> => {
  const result = await pool.query(
    `SELECT id FROM public.${table} WHERE UPPER(code) = $1 LIMIT 1;`,
    [code],
  );
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

// Registra, en el expediente de cada activo entregado, un evento de ciclo de vida
// HANDOVER con el acta PDF como evidencia. Best-effort: si algo falla no invalida
// el acta ya firmada (misma politica que generateLifecycleActa).
const archiveHandoverPerAsset = async (
  handover: HandoverRecord,
  pdfPath: string,
  pdfSize: number,
  issuedOn: string,
  userId?: string | null,
): Promise<void> => {
  const eventTypeId = await getCatalogIdByCode('helpdesk_lifecycle_event_types', 'HANDOVER');
  const documentKindId = await getCatalogIdByCode('helpdesk_document_kinds', 'HANDOVER_ACT');
  if (!eventTypeId) {
    return;
  }

  for (const item of handover.items ?? []) {
    try {
      const event = await createLifecycleEvent(
        item.asset_id,
        {
          event_type_id: eventTypeId,
          event_date: issuedOn,
          title: `Entrega-recepcion — ${handover.folio}`,
          description: `Entregado a ${handover.received_by_name}.`,
          notes: item.observations ?? null,
        },
        userId,
      );

      const document = await uploadAssetDocument(
        item.asset_id,
        { path: pdfPath, size: pdfSize, mimetype: 'application/pdf' },
        {
          title: `Acta de entrega-recepcion ${handover.folio}`,
          document_kind_id: documentKindId,
          lifecycle_event_id: event.id,
          reference_key: `HANDOVER:${handover.folio}`,
          issued_on: issuedOn,
        },
        userId,
      );
      await setLifecycleEventGeneratedDocument(pool, event.id, document.id);
    } catch (assetError) {
      console.error(`No se pudo archivar el acta ${handover.folio} en el activo ${item.asset_id}:`, assetError);
    }
  }
};

export const signHandover = async (
  handoverId: number,
  payload: HandoverSignPayload,
  userId?: string | null,
): Promise<HandoverRecord | null> => {
  await assertHandoverTables();

  const detail = await getHandoverById(handoverId);
  if (!detail) {
    return null;
  }
  if (detail.status !== 'DRAFT') {
    return fail('HELPDESK_HANDOVER_INVALID_STATE', 'Solo se puede firmar un acta en borrador.');
  }
  const items = detail.items ?? [];
  if (items.length === 0) {
    return fail('HELPDESK_HANDOVER_NO_ITEMS', 'El acta no tiene activos por entregar.');
  }

  const deliveredByName = normalizeOptionalText(payload.delivered_by_name) ?? detail.delivered_by_name;
  const receivedByName = normalizeOptionalText(payload.received_by_name) ?? detail.received_by_name;
  const notes = normalizeOptionalText(payload.notes) ?? detail.notes;

  const handoverAt = new Date();
  const issuedOn = handoverAt.toISOString().slice(0, 10);

  let delivererSignaturePath: string | null = null;
  let receiverSignaturePath: string | null = null;
  let pdfPath: string | null = null;

  try {
    delivererSignaturePath = writeSignatureImage(payload.deliverer_signature);
    receiverSignaturePath = writeSignatureImage(payload.receiver_signature);

    const assetLines: HandoverActaAssetLine[] = items.map((item, index) => ({
      index: index + 1,
      asset_code: item.asset_code,
      name: item.asset_name,
      brand_model: [item.brand_name, item.model].filter(Boolean).join(' / '),
      serial_number: item.serial_number ?? '',
      condition: item.receipt_condition_name ?? '',
      observations: item.observations,
    }));

    const pdfBuffer = await renderHandoverActaPdf({
      folio: detail.folio,
      unit_name: detail.unit_name ?? '',
      area_name: detail.area_name ?? '',
      delivered_by_name: deliveredByName,
      received_by_name: receivedByName,
      handover_at: handoverAt,
      notes,
      assets: assetLines,
      deliverer_signature_path: delivererSignaturePath,
      receiver_signature_path: receiverSignaturePath,
    });

    const uploadDir = process.env.DIRECTORY_UPLOAD || 'uploads/documents';
    fs.mkdirSync(uploadDir, { recursive: true });
    pdfPath = path.join(uploadDir, `ACTA-ER-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    const pdfSize = pdfBuffer.length;

    await withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT status FROM public.helpdesk_handovers WHERE id = $1 FOR UPDATE;`,
        [handoverId],
      );
      if (locked.rows.length === 0) {
        return fail('HELPDESK_HANDOVER_NOT_FOUND');
      }
      if (String(locked.rows[0].status) !== 'DRAFT') {
        return fail('HELPDESK_HANDOVER_INVALID_STATE', 'El acta ya no esta en borrador.');
      }

      // Bloqueo total: ninguno de los activos puede estar ya en otra acta FIRMADA.
      const assetIds = items.map((item) => item.asset_id);
      const conflict = await client.query(
        `
          SELECT a.asset_code
          FROM public.helpdesk_handover_items hi
          JOIN public.helpdesk_handovers h ON h.id = hi.handover_id
          JOIN public.helpdesk_assets a ON a.id = hi.asset_id
          WHERE h.status = 'SIGNED' AND hi.asset_id = ANY($1::bigint[])
          LIMIT 5;
        `,
        [assetIds],
      );
      if (conflict.rows.length > 0) {
        const codes = conflict.rows.map((row) => String(row.asset_code)).join(', ');
        return fail(
          'HELPDESK_HANDOVER_ASSET_ALREADY_DELIVERED',
          `Algunos activos ya fueron entregados en otra acta firmada: ${codes}. Recarga la lista de pendientes.`,
        );
      }

      await client.query(
        `
          UPDATE public.helpdesk_handovers
          SET status = 'SIGNED',
              handover_at = $1,
              delivered_by_name = $2,
              received_by_name = $3,
              notes = $4,
              deliverer_signature_path = $5,
              receiver_signature_path = $6,
              document_path = $7,
              updated_by_user_id = $8,
              updated_at = NOW()
          WHERE id = $9;
        `,
        [
          handoverAt.toISOString(),
          deliveredByName,
          receivedByName,
          notes,
          delivererSignaturePath,
          receiverSignaturePath,
          pdfPath,
          userId ?? null,
          handoverId,
        ],
      );
    });
  } catch (error) {
    // La transaccion no se confirmo: los archivos escritos quedan huerfanos.
    safeUnlink(delivererSignaturePath);
    safeUnlink(receiverSignaturePath);
    safeUnlink(pdfPath);
    throw error;
  }

  // Trazabilidad por activo (best-effort, ya con el acta firmada y persistida).
  const signed = await getHandoverById(handoverId);
  if (signed && pdfPath) {
    await archiveHandoverPerAsset(signed, pdfPath, fs.statSync(pdfPath).size, issuedOn, userId);
  }
  return signed;
};

export const voidHandover = async (
  handoverId: number,
  reason: string,
  userId?: string | null,
): Promise<HandoverRecord | null> => {
  await assertHandoverTables();
  const current = await pool.query(
    `SELECT status FROM public.helpdesk_handovers WHERE id = $1 LIMIT 1;`,
    [handoverId],
  );
  if (current.rows.length === 0) {
    return null;
  }
  if (String(current.rows[0].status) === 'VOID') {
    return fail('HELPDESK_HANDOVER_INVALID_STATE', 'El acta ya esta anulada.');
  }

  await pool.query(
    `
      UPDATE public.helpdesk_handovers
      SET status = 'VOID', void_reason = $1, updated_by_user_id = $2, updated_at = NOW()
      WHERE id = $3;
    `,
    [reason.trim(), userId ?? null, handoverId],
  );
  return getHandoverById(handoverId);
};

export const resolveHandoverDocumentPath = async (
  handoverId: number,
): Promise<{ handover: HandoverRecord; absolutePath: string } | null> => {
  const handover = await getHandoverById(handoverId);
  if (!handover) {
    return null;
  }
  const result = await pool.query(
    `SELECT document_path FROM public.helpdesk_handovers WHERE id = $1 LIMIT 1;`,
    [handoverId],
  );
  const documentPath = result.rows[0]?.document_path ? String(result.rows[0].document_path) : null;
  if (!documentPath) {
    return null;
  }
  const absolutePath = path.isAbsolute(documentPath)
    ? documentPath
    : path.join(process.cwd(), documentPath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return { handover, absolutePath };
};
