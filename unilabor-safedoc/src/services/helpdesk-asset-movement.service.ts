import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { withTransaction } from '../utils/transaction';
import { generateAssetCode, getHelpdeskAssetById } from './helpdesk-asset.service';
import { createLifecycleEvent } from './helpdesk-lifecycle.service';

export interface AssetMovementPayload {
  to_unit_id?: number | null;
  to_area_id?: number | null;
  to_category_id?: number | null;
  reason: string;
  performed_by_name: string;
  performed_by_signature: string;
  responsible_user_id?: string | null;
  responsible_name: string;
  responsible_signature: string;
}

export interface AssetMovementRecord {
  id: number;
  folio: string;
  asset_id: number;
  asset_name: string;
  movement_at: string | null;
  reason: string | null;
  from_unit_id: number | null;
  from_unit_name: string | null;
  to_unit_id: number | null;
  to_unit_name: string | null;
  from_area_id: number | null;
  from_area_name: string | null;
  to_area_id: number | null;
  to_area_name: string | null;
  from_category_id: number | null;
  from_category_name: string | null;
  to_category_id: number | null;
  to_category_name: string | null;
  from_asset_code: string | null;
  to_asset_code: string | null;
  code_changed: boolean;
  performed_by_user_id: string | null;
  performed_by_name: string;
  responsible_user_id: string | null;
  responsible_name: string;
  lifecycle_event_id: number | null;
  created_at?: string | undefined;
}

const fail = (code: string, message?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (message) {
    (error as any).publicMessage = message;
  }
  throw error;
};

const movementTablesExist = async (): Promise<boolean> => {
  const result = await pool.query(
    `SELECT to_regclass('public.helpdesk_asset_movements') IS NOT NULL AS exists;`,
  );
  return Boolean(result.rows[0]?.exists);
};

const assertMovementTables = async (): Promise<void> => {
  if (!(await movementTablesExist())) {
    fail('HELPDESK_MOVEMENT_TABLES_NOT_AVAILABLE');
  }
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const writeSignatureImage = (dataUrl: string): string => {
  const raw = dataUrl.trim();
  const match = /^data:image\/png;base64,(.+)$/i.exec(raw);
  const base64 = (match && match[1]) || raw;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < 100) {
    return fail('HELPDESK_MOVEMENT_INVALID_SIGNATURE', 'La firma electronica es invalida o esta vacia.');
  }
  const dir = process.env.DIRECTORY_UPLOAD_SIGNATURE || 'uploads/signatures';
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `SIGN-MOV-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`);
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

const mapMovementRow = (row: any): AssetMovementRecord => ({
  id: Number(row.id),
  folio: String(row.folio),
  asset_id: Number(row.asset_id),
  asset_name: String(row.asset_name ?? ''),
  movement_at: row.movement_at ? toIsoDateTime(row.movement_at) : null,
  reason: row.reason ? String(row.reason) : null,
  from_unit_id: row.from_unit_id ? Number(row.from_unit_id) : null,
  from_unit_name: row.from_unit_name ? String(row.from_unit_name) : null,
  to_unit_id: row.to_unit_id ? Number(row.to_unit_id) : null,
  to_unit_name: row.to_unit_name ? String(row.to_unit_name) : null,
  from_area_id: row.from_area_id ? Number(row.from_area_id) : null,
  from_area_name: row.from_area_name ? String(row.from_area_name) : null,
  to_area_id: row.to_area_id ? Number(row.to_area_id) : null,
  to_area_name: row.to_area_name ? String(row.to_area_name) : null,
  from_category_id: row.from_category_id ? Number(row.from_category_id) : null,
  from_category_name: row.from_category_name ? String(row.from_category_name) : null,
  to_category_id: row.to_category_id ? Number(row.to_category_id) : null,
  to_category_name: row.to_category_name ? String(row.to_category_name) : null,
  from_asset_code: row.from_asset_code ? String(row.from_asset_code) : null,
  to_asset_code: row.to_asset_code ? String(row.to_asset_code) : null,
  code_changed: Boolean(row.code_changed),
  performed_by_user_id: row.performed_by_user_id ? String(row.performed_by_user_id) : null,
  performed_by_name: String(row.performed_by_name),
  responsible_user_id: row.responsible_user_id ? String(row.responsible_user_id) : null,
  responsible_name: String(row.responsible_name),
  lifecycle_event_id: row.lifecycle_event_id ? Number(row.lifecycle_event_id) : null,
  created_at: row.created_at ? toIsoDateTime(row.created_at) : undefined,
});

const buildMovementQuery = () => `
  SELECT
    m.*,
    a.name AS asset_name,
    fu.name AS from_unit_name, tu.name AS to_unit_name,
    fa.name AS from_area_name, ta.name AS to_area_name,
    fc.name AS from_category_name, tc.name AS to_category_name
  FROM public.helpdesk_asset_movements m
  JOIN public.helpdesk_assets a ON a.id = m.asset_id
  LEFT JOIN public.helpdesk_asset_units fu ON fu.id = m.from_unit_id
  LEFT JOIN public.helpdesk_asset_units tu ON tu.id = m.to_unit_id
  LEFT JOIN public.helpdesk_asset_areas fa ON fa.id = m.from_area_id
  LEFT JOIN public.helpdesk_asset_areas ta ON ta.id = m.to_area_id
  LEFT JOIN public.helpdesk_asset_categories fc ON fc.id = m.from_category_id
  LEFT JOIN public.helpdesk_asset_categories tc ON tc.id = m.to_category_id
`;

export const listAssetMovements = async (assetId?: number | null): Promise<AssetMovementRecord[]> => {
  await assertMovementTables();
  const where = assetId ? 'WHERE m.asset_id = $1' : '';
  const result = await pool.query(
    `${buildMovementQuery()} ${where} ORDER BY m.movement_at DESC, m.id DESC;`,
    assetId ? [assetId] : [],
  );
  return result.rows.map(mapMovementRow);
};

export const getAssetMovementById = async (movementId: number): Promise<AssetMovementRecord | null> => {
  await assertMovementTables();
  const result = await pool.query(`${buildMovementQuery()} WHERE m.id = $1 LIMIT 1;`, [movementId]);
  return result.rows[0] ? mapMovementRow(result.rows[0]) : null;
};

const getMovementEventTypeId = async (): Promise<number | null> => {
  const result = await pool.query(
    `SELECT id FROM public.helpdesk_lifecycle_event_types WHERE UPPER(code) = 'MOVEMENT' LIMIT 1;`,
  );
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

export const createAssetMovement = async (
  assetId: number,
  payload: AssetMovementPayload,
  userId?: string | null,
): Promise<AssetMovementRecord> => {
  await assertMovementTables();

  const asset = await getHelpdeskAssetById(assetId);
  if (!asset) {
    return fail('HELPDESK_ASSET_NOT_FOUND');
  }

  const fromUnit = asset.unit_id ?? null;
  const fromArea = asset.area_id ?? null;
  const fromCategory = asset.category_id ?? null;
  const fromCode = asset.asset_code;

  const toUnit = payload.to_unit_id ?? fromUnit;
  const toArea = payload.to_area_id ?? fromArea;
  const toCategory = payload.to_category_id ?? fromCategory;
  const orgChanged = toUnit !== fromUnit || toArea !== fromArea || toCategory !== fromCategory;

  // Debe existir algún cambio real: reclasificación (org) o reasignación de responsable.
  const responsibleChanged = Boolean(payload.responsible_user_id) && payload.responsible_user_id !== null;
  if (!orgChanged && !responsibleChanged) {
    return fail(
      'HELPDESK_MOVEMENT_NO_CHANGES',
      'Selecciona un cambio de unidad, area o categoria, o un nuevo responsable.',
    );
  }

  // Si cambia la clasificación, se regenera el código (consume el consecutivo del área destino).
  const newCode = orgChanged ? await generateAssetCode(toUnit, toArea, toCategory) : fromCode;

  let performedSigPath: string | null = null;
  let responsibleSigPath: string | null = null;

  try {
    performedSigPath = writeSignatureImage(payload.performed_by_signature);
    responsibleSigPath = writeSignatureImage(payload.responsible_signature);

    const created = await withTransaction(async (client) => {
      if (orgChanged) {
        await client.query(
          `
            UPDATE public.helpdesk_assets
            SET unit_id = $1, area_id = $2, category_id = $3, asset_code = $4,
                asset_code_overridden = FALSE, updated_by_user_id = $5, updated_at = NOW()
            WHERE id = $6;
          `,
          [toUnit, toArea, toCategory, newCode, userId ?? null, assetId],
        );
      }

      await client.query(
        `
          INSERT INTO public.helpdesk_asset_history (asset_id, action, summary, previous_values, new_values, created_by_user_id)
          VALUES ($1, 'MOVEMENT', $2, $3, $4, $5);
        `,
        [
          assetId,
          orgChanged ? `Movimiento: codigo ${fromCode} -> ${newCode}.` : 'Movimiento: reasignacion de responsable.',
          JSON.stringify({ unit_id: fromUnit, area_id: fromArea, category_id: fromCategory, asset_code: fromCode }),
          JSON.stringify({ unit_id: toUnit, area_id: toArea, category_id: toCategory, asset_code: newCode, responsible_user_id: payload.responsible_user_id ?? null }),
          userId ?? null,
        ],
      );

      const seqResult = await client.query(`SELECT nextval('public.helpdesk_movement_code_seq') AS seq;`);
      const seq = Number(seqResult.rows[0]?.seq ?? 1);
      const folio = `MOV-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

      const insert = await client.query(
        `
          INSERT INTO public.helpdesk_asset_movements (
            folio, asset_id, reason,
            from_unit_id, to_unit_id, from_area_id, to_area_id, from_category_id, to_category_id,
            from_asset_code, to_asset_code, code_changed,
            performed_by_user_id, performed_by_name, performed_by_signature_path,
            responsible_user_id, responsible_name, responsible_signature_path,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $13)
          RETURNING id, folio;
        `,
        [
          folio,
          assetId,
          normalizeOptionalText(payload.reason),
          fromUnit,
          toUnit,
          fromArea,
          toArea,
          fromCategory,
          toCategory,
          fromCode,
          newCode,
          orgChanged,
          userId ?? null,
          payload.performed_by_name.trim(),
          performedSigPath,
          payload.responsible_user_id ?? null,
          payload.responsible_name.trim(),
          responsibleSigPath,
        ],
      );
      return { id: Number(insert.rows[0].id), folio: String(insert.rows[0].folio) };
    });

    // Evento de ciclo de vida para el expediente (best-effort, ya persistido el movimiento).
    const eventTypeId = await getMovementEventTypeId();
    if (eventTypeId) {
      try {
        const summary = orgChanged
          ? `Movimiento de activo. Codigo ${fromCode} → ${newCode}. Responsable: ${payload.responsible_name.trim()}.`
          : `Reasignacion de responsable a ${payload.responsible_name.trim()}.`;
        const event = await createLifecycleEvent(
          assetId,
          {
            event_type_id: eventTypeId,
            event_date: new Date().toISOString().slice(0, 10),
            title: `Movimiento — ${created.folio}`,
            description: summary,
            notes: normalizeOptionalText(payload.reason),
          },
          userId,
        );
        await pool.query(`UPDATE public.helpdesk_asset_movements SET lifecycle_event_id = $1 WHERE id = $2;`, [
          event.id,
          created.id,
        ]);
      } catch (eventError) {
        console.error(`No se pudo registrar el evento de ciclo de vida del movimiento ${created.folio}:`, eventError);
      }
    }

    const record = await getAssetMovementById(created.id);
    if (!record) {
      return fail('HELPDESK_MOVEMENT_CREATION_FAILED');
    }
    return record;
  } catch (error) {
    safeUnlink(performedSigPath);
    safeUnlink(responsibleSigPath);
    throw error;
  }
};

export const resolveMovementSignaturePath = async (
  movementId: number,
  party: 'performed' | 'responsible',
): Promise<string | null> => {
  const column = party === 'performed' ? 'performed_by_signature_path' : 'responsible_signature_path';
  const result = await pool.query(
    `SELECT ${column} AS p FROM public.helpdesk_asset_movements WHERE id = $1 LIMIT 1;`,
    [movementId],
  );
  const storedPath = result.rows[0]?.p ? String(result.rows[0].p) : null;
  if (!storedPath) {
    return null;
  }
  const absolutePath = path.isAbsolute(storedPath) ? storedPath : path.join(process.cwd(), storedPath);
  return fs.existsSync(absolutePath) ? absolutePath : null;
};
