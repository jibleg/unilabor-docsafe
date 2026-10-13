import type { PoolClient } from 'pg';
import pool from '../../config/db';
import { withTransaction } from '../../utils/transaction';
import { auditOrders, insertOrder, type OrderType } from './agent-orders.service';
import { requireAgent } from './agents.service';
import { conflict } from './attendance-errors';
import { isDeviceNumber } from './device-number';
import { refreshSyncSummary } from './device-sync-summary';

/**
 * Sincronizacion de colaboradores con el reloj de cada sucursal. Compara lo que DocSafe quiere (habilitado,
 * activo, sucursal, numero, foto) con lo que cada reloj ya tiene (attendance.employee_device_branches) y encola las ordenes que
 * faltan: alta, baja, cambio de numero/sucursal (baja del anterior + alta) y envio de la foto.
 *
 * Se usa por tres vias: el boton "Sincronizar con relojes", al guardar un cambio del colaborador y como
 * red de seguridad periodica. Es idempotente: no duplica ordenes abiertas.
 */

/** Reintentos automaticos tras un error (alta o foto) antes de dejar de insistir; el boton manual los reinicia. */
export const AUTO_SYNC_MAX_RETRIES = 3;

interface Row {
  employee_id: string;
  full_name: string;
  is_active: boolean;
  branch_id: string | null;
  is_enabled: boolean;
  number: string | null;
  /** Sucursal elegida a mano como adicional a la base (el registro de sincronizacion es por reloj). */
  is_extra: boolean;
  status: string;
  synced_number: string | null;
  sync_attempts: number;
  has_face: boolean;
  face_status: string;
  face_attempts: number;
}

export interface ReconcileResult {
  queued: number;
  queued_sync: number;
  queued_remove: number;
  skipped_without_number: number;
  skipped_invalid_number: number;
  /** Colaboradores que dejaron de reintentarse solos por llegar al tope. */
  skipped_max_retries: number;
}

interface Options {
  /** Reenviar tambien a quienes ya estan sincronizados. */
  all: boolean;
  /** null = proceso automatico del sistema (sin usuario). */
  userId: string | null;
  /** true = red de seguridad: respeta el tope de reintentos. false = accion de una persona: lo reinicia. */
  auto: boolean;
  employeeIds?: number[] | undefined;
}

const upper = (value: string | null): string => (value ?? '').toUpperCase();

/** Registros de alta para quienes tienen a esta sucursal como base y aun no tienen fila (la foto queda pendiente si la hay). */
const ensureBaseRows = (client: PoolClient, branchId: number, employeeIds: number[] | undefined) =>
  client.query(
    `INSERT INTO attendance.employee_device_branches (employee_id, branch_id, face_sync_status)
     SELECT e.id, $1, CASE WHEN p.face_photo_path IS NULL THEN 'not_applicable' ELSE 'pending' END
       FROM public.employees e
       JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE e.branch_id = $1 AND p.is_enabled AND e.is_active
        AND ($2::bigint[] IS NULL OR e.id = ANY($2::bigint[]))
     ON CONFLICT (employee_id, branch_id) DO NOTHING`,
    [branchId, employeeIds ?? null],
  );

const loadRows = (client: PoolClient, branchId: number, employeeIds: number[] | undefined): Promise<Row[]> =>
  client
    .query<Row>(
      `SELECT e.id AS employee_id, e.full_name, e.is_active, e.branch_id, COALESCE(p.is_enabled, FALSE) AS is_enabled,
              p.device_employee_number AS number, r.is_extra, r.sync_status AS status, r.synced_number,
              r.sync_attempts, (p.face_photo_path IS NOT NULL) AS has_face,
              r.face_sync_status AS face_status, r.face_sync_attempts AS face_attempts
         FROM attendance.employee_device_branches r
         JOIN attendance.employee_profiles p ON p.employee_id = r.employee_id
         JOIN public.employees e ON e.id = r.employee_id
        WHERE r.branch_id = $1
          AND ($2::bigint[] IS NULL OR r.employee_id = ANY($2::bigint[]))`,
      [branchId, employeeIds ?? null],
    )
    .then((result) => result.rows);

/**
 * Encola lo necesario para UN reloj (agente / sucursal); exportada para pruebas. Debe correr dentro de una
 * transaccion que ya bloqueo al agente. Un colaborador va a este reloj si esta habilitado, activo y esta sucursal es
 * su base o fue elegida como adicional (is_extra).
 */
export const reconcileRows = async (
  client: PoolClient,
  agentId: number,
  branchId: number,
  options: Options,
): Promise<ReconcileResult> => {
  await ensureBaseRows(client, branchId, options.employeeIds);
  const rows = await loadRows(client, branchId, options.employeeIds);
  const open = await client.query<{ employee_id: string; order_type: string }>(
    `SELECT employee_id, order_type FROM attendance.agent_orders
      WHERE agent_id = $1 AND order_status IN ('pending', 'processing')
        AND order_type IN ('sync_person', 'remove_person', 'upload_face') AND employee_id IS NOT NULL`,
    [agentId],
  );
  const hasOpen = new Set(open.rows.map((r) => `${r.order_type}:${r.employee_id}`));

  const result: ReconcileResult = {
    queued: 0, queued_sync: 0, queued_remove: 0, skipped_without_number: 0, skipped_invalid_number: 0, skipped_max_retries: 0,
  };
  const enqueue = async (row: Row, type: OrderType, employeeNo: string, extra: Record<string, unknown> = {}): Promise<boolean> => {
    if (hasOpen.has(`${type}:${row.employee_id}`)) return false;
    await insertOrder(client, {
      agentId,
      employeeId: Number(row.employee_id),
      type,
      payload: { employeeNo, name: row.full_name, ...extra },
      userId: options.userId,
    });
    hasOpen.add(`${type}:${row.employee_id}`);
    return true;
  };
  const patch = (row: Row, sql: string, params: unknown[] = []) =>
    client.query(`UPDATE attendance.employee_device_branches SET ${sql} WHERE employee_id = $1 AND branch_id = ${branchId}`, [row.employee_id, ...params]);

  for (const row of rows) {
    const here = row.branch_id !== null && Number(row.branch_id) === branchId;
    const wantsHere = row.is_enabled && row.is_active && (here || row.is_extra);
    const onHere = row.synced_number !== null;

    if (!wantsHere) {
      if (!onHere) {
        // Ya no debe estar aqui ni esta: el registro de seguimiento sobra (si fue elegido a mano se conserva).
        if (!row.is_extra && !hasOpen.has(`remove_person:${row.employee_id}`)) {
          await client.query('DELETE FROM attendance.employee_device_branches WHERE employee_id = $1 AND branch_id = $2', [row.employee_id, branchId]);
        }
        continue;
      }
      // Baja: se deshabilito, dejo de estar activo, cambio de sucursal base o se quito este reloj de sus accesos.
      const removeCapped = options.auto && row.status === 'error' && row.sync_attempts >= AUTO_SYNC_MAX_RETRIES;
      if (removeCapped) {
        result.skipped_max_retries += 1;
      } else if (await enqueue(row, 'remove_person', row.synced_number as string)) {
        result.queued_remove += 1;
        await patch(
          row,
          `sync_status = 'pending', sync_error = NULL,
           sync_attempts = CASE WHEN $2::boolean AND $3::text = 'error' THEN sync_attempts + 1 WHEN $2::boolean THEN sync_attempts ELSE 0 END`,
          [options.auto, row.status],
        );
      }
      continue;
    }

    if (!row.number) {
      result.skipped_without_number += 1;
      continue;
    }
    if (!isDeviceNumber(row.number)) {
      result.skipped_invalid_number += 1;
      continue;
    }

    const numberChanged = onHere && upper(row.synced_number) !== upper(row.number);
    const statusDue = ['pending', 'error', 'not_applicable'].includes(row.status);
    const needsSync = !onHere || numberChanged || options.all || statusDue;
    const syncCapped = options.auto && row.status === 'error' && row.sync_attempts >= AUTO_SYNC_MAX_RETRIES && !numberChanged;

    let personReady = onHere && row.status === 'synced' && !numberChanged;
    if (needsSync) {
      if (syncCapped) {
        result.skipped_max_retries += 1;
        continue;
      }
      // Cambio de numero: se retira el anterior antes de dar de alta el nuevo.
      if (numberChanged && (await enqueue(row, 'remove_person', row.synced_number as string, { replaced: true }))) {
        result.queued_remove += 1;
      }
      if (await enqueue(row, 'sync_person', row.number)) {
        result.queued_sync += 1;
        await patch(
          row,
          `sync_status = 'pending', sync_error = NULL,
           sync_attempts = CASE WHEN $2::boolean AND $3::text = 'error' THEN sync_attempts + 1 WHEN $2::boolean THEN sync_attempts ELSE 0 END`,
          [options.auto, row.status],
        );
      }
      personReady = true;
    }

    // La foto viaja despues del alta (las ordenes se atienden en orden) o sola si la persona ya esta en el reloj.
    if (row.has_face && personReady) {
      const faceDue = ['pending', 'error', 'not_applicable'].includes(row.face_status) || needsSync || options.all;
      const faceCapped = options.auto && row.face_status === 'error' && row.face_attempts >= AUTO_SYNC_MAX_RETRIES && !needsSync;
      if (faceCapped) {
        result.skipped_max_retries += 1;
      } else if (faceDue && (await enqueue(row, 'upload_face', row.number))) {
        await patch(
          row,
          `face_sync_status = 'pending', face_sync_error = NULL,
           face_sync_attempts = CASE WHEN $2::boolean AND $3::text = 'error' THEN face_sync_attempts + 1 WHEN $2::boolean THEN face_sync_attempts ELSE 0 END`,
          [options.auto, row.face_status],
        );
      }
    }
  }
  await refreshSyncSummary(client, [...new Set(rows.map((row) => Number(row.employee_id)))]);
  result.queued = result.queued_sync + result.queued_remove;
  return result;
};

const reconcileAgent = (agentId: number, branchId: number, options: Options): Promise<ReconcileResult> =>
  withTransaction(async (client) => {
    // Serializa por agente para no duplicar ordenes si dos disparadores coinciden.
    await client.query('SELECT id FROM attendance.agents WHERE id = $1 FOR UPDATE', [agentId]);
    return reconcileRows(client, agentId, branchId, options);
  });

/** Boton "Sincronizar con relojes": encola lo pendiente de la sucursal del agente (all = reenviar a todos). */
export const queueSyncOrders = async (agentId: number, all: boolean, userId: string): Promise<ReconcileResult> => {
  const agent = await requireAgent(agentId);
  if (!agent.is_active) conflict('El agente esta desactivado.');
  const result = await reconcileAgent(agentId, agent.branch_id, { all, userId, auto: false });
  await auditOrders(userId, 'attendance_agent_sync_queued', agentId, { all, ...result });
  return result;
};

interface AgentRef {
  id: number;
  branch_id: number;
}

const activeAgents = async (branchIds?: number[]): Promise<AgentRef[]> => {
  const { rows } = await pool.query<{ id: string; branch_id: string }>(
    `SELECT id, branch_id FROM attendance.agents WHERE is_active AND ($1::bigint[] IS NULL OR branch_id = ANY($1::bigint[]))`,
    [branchIds ?? null],
  );
  return rows.map((row) => ({ id: Number(row.id), branch_id: Number(row.branch_id) }));
};

/**
 * Tras guardar un cambio de colaboradores (alta, baja, numero, sucursal): encola de inmediato lo que corresponda en
 * los relojes implicados (su sucursal actual y aquella donde estaba dado de alta). Nunca debe romper la accion del usuario.
 */
export const triggerEmployeeDeviceSync = async (employeeIds: number[], userId: string): Promise<void> => {
  try {
    if (employeeIds.length === 0) return;
    const { rows } = await pool.query<{ branch_id: string | null }>(
      `SELECT e.branch_id FROM public.employees e WHERE e.id = ANY($1::bigint[])
       UNION
       SELECT r.branch_id FROM attendance.employee_device_branches r WHERE r.employee_id = ANY($1::bigint[])`,
      [employeeIds],
    );
    const branchIds = [...new Set(rows.map((r) => r.branch_id).filter((v): v is string => v !== null).map(Number))];
    for (const agent of await activeAgents(branchIds)) {
      await reconcileAgent(agent.id, agent.branch_id, { all: false, userId, auto: false, employeeIds });
    }
  } catch (error) {
    console.error('[attendance] sincronizacion automatica con el reloj fallo:', error);
  }
};

/** Red de seguridad periodica: reconcilia todos los agentes activos (respeta el tope de reintentos). */
export const runDeviceSyncReconciliation = async (): Promise<ReconcileResult> => {
  const total: ReconcileResult = {
    queued: 0, queued_sync: 0, queued_remove: 0, skipped_without_number: 0, skipped_invalid_number: 0, skipped_max_retries: 0,
  };
  for (const agent of await activeAgents()) {
    const result = await reconcileAgent(agent.id, agent.branch_id, { all: false, userId: null, auto: true });
    (Object.keys(total) as Array<keyof ReconcileResult>).forEach((key) => {
      total[key] += result[key];
    });
  }
  return total;
};
