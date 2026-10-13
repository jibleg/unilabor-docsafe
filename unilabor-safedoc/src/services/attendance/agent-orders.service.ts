import type { PoolClient } from 'pg';
import pool from '../../config/db';
import { withTransaction } from '../../utils/transaction';
import { isDeviceNumber } from './device-number';
import { refreshSyncSummary } from './device-sync-summary';
import { loadFacePhotoBase64 } from './face-photo-files';
import { registerAuditEvent } from '../audit.service';
import { conflict, invalid, notFound } from './attendance-errors';
import type { AuthenticatedAgent } from './agent-auth.service';
import { isoTs } from './device-sql';
import { requireAgent } from './agents.service';

/** Cola de ordenes: encolado desde el panel y consumo por el agente. */

export const ORDER_STALE_MINUTES = 10;
export const ORDER_MAX_ATTEMPTS = 5;

export type OrderType = 'sync_person' | 'remove_person' | 'enroll_fingerprint' | 'enroll_face' | 'upload_face' | 'check_status';

export const insertOrder = async (
  client: Pick<PoolClient, 'query'>,
  order: {
    agentId: number;
    terminalId?: number | null;
    employeeId?: number | null;
    type: OrderType;
    payload?: Record<string, unknown>;
    /** null = proceso automatico del sistema. */
    userId: string | null;
  },
): Promise<number> => {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO attendance.agent_orders (agent_id, terminal_id, employee_id, order_type, payload, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [order.agentId, order.terminalId ?? null, order.employeeId ?? null, order.type, JSON.stringify(order.payload ?? {}), order.userId],
  );
  return Number(rows[0]!.id);
};

export const auditOrders = (userId: string, action: string, agentId: number, metadata: Record<string, unknown>) =>
  registerAuditEvent({
    user_id: userId,
    action,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_agent',
    entity_id: agentId,
    metadata,
  }).catch(() => undefined);

export const queueTestOrder = async (agentId: number, userId: string): Promise<{ order_id: number }> => {
  const agent = await requireAgent(agentId);
  if (!agent.is_active) conflict('El agente esta desactivado.');
  const orderId = await insertOrder(pool, { agentId, type: 'check_status', userId });
  return { order_id: orderId };
};

export const queueEnrollOrder = async (employeeId: number, mode: 'fingerprint' | 'face', userId: string) => {
  const { rows } = await pool.query<{
    id: string; full_name: string; branch_id: string | null; number: string | null; status: string | null;
  }>(
    `SELECT e.id, e.full_name, e.branch_id, p.device_employee_number AS number,
            (SELECT r.sync_status FROM attendance.employee_device_branches r
              WHERE r.employee_id = e.id AND r.branch_id = e.branch_id AND r.synced_number IS NOT NULL) AS status
       FROM public.employees e
       LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE e.id = $1`,
    [employeeId],
  );
  const employee = rows[0];
  if (!employee) return notFound('Colaborador no encontrado.');
  if (!employee.branch_id) return invalid('El colaborador no tiene sucursal asignada.');
  if (!employee.number) return invalid('El colaborador no tiene numero de empleado asignado.');
  if (!isDeviceNumber(employee.number)) return invalid(`El numero de empleado ${employee.number} no es valido para el reloj (solo digitos).`);
  if (employee.status !== 'synced') {
    return invalid('Sincroniza primero al colaborador con el reloj de su sucursal.');
  }
  const agent = await pool.query<{ id: string; is_active: boolean; terminal_id: string | null }>(
    `SELECT a.id, a.is_active,
            (SELECT t.id FROM attendance.terminals t WHERE t.agent_id = a.id AND t.is_active = TRUE ORDER BY t.id LIMIT 1) AS terminal_id
       FROM attendance.agents a WHERE a.branch_id = $1`,
    [employee.branch_id],
  );
  const found = agent.rows[0];
  if (!found || !found.is_active) return invalid('La sucursal del colaborador no tiene un agente activo.');
  if (!found.terminal_id) return invalid('La sucursal no tiene un reloj activo registrado. Espera el primer latido del agente.');

  const orderId = await insertOrder(pool, {
    agentId: Number(found.id),
    terminalId: Number(found.terminal_id),
    employeeId,
    type: mode === 'face' ? 'enroll_face' : 'enroll_fingerprint',
    payload: { employeeNo: employee.number, name: employee.full_name, ...(mode === 'fingerprint' ? { finger: 1 } : {}) },
    userId,
  });
  await auditOrders(userId, 'attendance_enroll_queued', Number(found.id), { employee_id: employeeId, mode });
  return { order_id: orderId, terminal_id: Number(found.terminal_id) };
};

export const listOrders = async (filters: { agent_id?: number | undefined; status?: string | undefined; page: number; limit: number }) => {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters.agent_id) {
    params.push(filters.agent_id);
    where.push(`o.agent_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`o.order_status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM attendance.agent_orders o ${whereSql}`,
    params,
  );
  params.push(filters.limit, (filters.page - 1) * filters.limit);
  const { rows } = await pool.query(
    `SELECT o.id, o.agent_id, o.terminal_id, t.name AS terminal_name, t.serial_number AS terminal_serial,
            o.employee_id, e.full_name AS employee_name, o.order_type, o.payload, o.order_status, o.result,
            o.error_message, o.attempt_count, ${isoTs('o.created_at')} AS created_at,
            ${isoTs('o.picked_up_at')} AS picked_up_at, ${isoTs('o.finished_at')} AS finished_at
       FROM attendance.agent_orders o
       LEFT JOIN attendance.terminals t ON t.id = o.terminal_id
       LEFT JOIN public.employees e ON e.id = o.employee_id
       ${whereSql}
      ORDER BY o.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    orders: rows.map((r) => ({
      ...r,
      id: Number(r.id),
      agent_id: Number(r.agent_id),
      terminal_id: r.terminal_id === null ? null : Number(r.terminal_id),
      employee_id: r.employee_id === null ? null : Number(r.employee_id),
    })),
    total: Number(total.rows[0]?.total ?? 0),
    page: filters.page,
    limit: filters.limit,
  };
};

// ---------------------------------------------------------------------------
// Lado del agente
// ---------------------------------------------------------------------------

export interface AgentOrderView {
  id: number;
  type: string;
  terminalSerial: string | null;
  payload: unknown;
}

/** Toma ordenes (SKIP LOCKED), cuenta el intento y las marca en proceso. */
export const takeOrders = async (agent: AuthenticatedAgent, limit: number): Promise<AgentOrderView[]> =>
  withTransaction<TakenOrder[]>(async (client) => {
    // Las ordenes en proceso que ya agotaron los intentos se cierran con error.
    const exhausted = await client.query<{ id: string; employee_id: string | null; order_type: string }>(
      `UPDATE attendance.agent_orders
          SET order_status = 'error', finished_at = NOW(),
              error_message = 'El agente no respondio tras varios intentos'
        WHERE agent_id = $1 AND order_status = 'processing' AND attempt_count >= $2
          AND picked_up_at < NOW() - make_interval(mins => $3::int)
    RETURNING id, employee_id, order_type`,
      [agent.id, ORDER_MAX_ATTEMPTS, ORDER_STALE_MINUTES],
    );
    for (const row of exhausted.rows) {
      if (!row.employee_id) continue;
      const column = row.order_type === 'upload_face' ? 'face' : row.order_type === 'sync_person' || row.order_type === 'remove_person' ? 'sync' : null;
      if (!column) continue;
      await client.query(
        `UPDATE attendance.employee_device_branches
            SET ${column}_sync_status = 'error', ${column}_sync_error = 'El agente no respondio tras varios intentos'
          WHERE employee_id = $1 AND branch_id = $2`,
        [row.employee_id, agent.branch_id],
      );
      await refreshSyncSummary(client, [Number(row.employee_id)]);
    }

    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM attendance.agent_orders
        WHERE agent_id = $1 AND attempt_count < $2
          AND (order_status = 'pending'
               OR (order_status = 'processing' AND picked_up_at < NOW() - make_interval(mins => $3::int)))
        ORDER BY created_at, id
        LIMIT $4
          FOR UPDATE SKIP LOCKED`,
      [agent.id, ORDER_MAX_ATTEMPTS, ORDER_STALE_MINUTES, limit],
    );
    if (rows.length === 0) return [];
    const taken = await client.query<{ id: string; order_type: string; payload: unknown; terminal_serial: string | null; employee_id: string | null }>(
      `UPDATE attendance.agent_orders o
          SET order_status = 'processing', attempt_count = attempt_count + 1, picked_up_at = NOW()
        WHERE o.id = ANY($1::bigint[])
    RETURNING o.id, o.order_type, o.payload, o.employee_id,
              (SELECT t.serial_number FROM attendance.terminals t WHERE t.id = o.terminal_id) AS terminal_serial`,
      [rows.map((r) => r.id)],
    );
    return taken.rows
      .map((r) => ({
        id: Number(r.id), type: r.order_type, terminalSerial: r.terminal_serial, payload: r.payload,
        employeeId: r.employee_id === null ? null : Number(r.employee_id),
      }))
      .sort((a, b) => a.id - b.id);
  }).then(attachFacePhotos);

type TakenOrder = AgentOrderView & { employeeId: number | null };

/** Las ordenes upload_face llevan la foto vigente (se lee del disco; no se guarda en la orden). */
const attachFacePhotos = async (orders: TakenOrder[]): Promise<AgentOrderView[]> =>
  Promise.all(
    orders.map(async ({ employeeId, ...order }) => {
      if (order.type !== 'upload_face' || employeeId === null) return order;
      const photoBase64 = await loadFacePhotoBase64(employeeId);
      return { ...order, payload: { ...(order.payload as Record<string, unknown>), photoBase64 } };
    }),
  );

export const finishOrder = async (
  agent: AuthenticatedAgent,
  orderId: number,
  outcome: { ok: boolean; result?: Record<string, unknown> | undefined; error?: string | undefined },
): Promise<void> => {
  const errorMessage = outcome.ok ? null : (outcome.error ?? 'Error sin detalle').slice(0, 500);
  await withTransaction(async (client) => {
    const { rows } = await client.query<{
      employee_id: string | null; order_type: string; payload: { employeeNo?: string; replaced?: boolean } | null;
    }>(
      `UPDATE attendance.agent_orders
          SET order_status = $3, result = $4::jsonb, error_message = $5, finished_at = NOW()
        WHERE id = $1 AND agent_id = $2 AND order_status = 'processing'
    RETURNING employee_id, order_type, payload`,
      [orderId, agent.id, outcome.ok ? 'done' : 'error', outcome.result ? JSON.stringify(outcome.result) : null, errorMessage],
    );
    const order = rows[0];
    if (!order) return notFound('Orden no encontrada o ya cerrada.');
    if (!order.employee_id) return;
    const employeeId = order.employee_id;

    const row = (set: string, params: unknown[] = []) =>
      client.query(
        `UPDATE attendance.employee_device_branches SET ${set} WHERE employee_id = $1 AND branch_id = ${Number(agent.branch_id)}`,
        [employeeId, ...params],
      );

    if (order.order_type === 'sync_person') {
      // Queda registrado QUE numero esta dado de alta EN ESTE reloj (base para bajas y cambios de numero).
      if (outcome.ok) {
        await row(
          `sync_status = 'synced', synced_at = NOW(), sync_error = NULL, sync_attempts = 0, synced_number = $2`,
          [order.payload?.employeeNo ?? null],
        );
      } else {
        await row(`sync_status = 'error', sync_error = $2`, [errorMessage]);
      }
    } else if (order.order_type === 'upload_face') {
      if (outcome.ok) await row(`face_sync_status = 'synced', face_synced_at = NOW(), face_sync_error = NULL, face_sync_attempts = 0`);
      else await row(`face_sync_status = 'error', face_sync_error = $2`, [errorMessage]);
    } else if (order.order_type === 'remove_person') {
      // Baja "de paso" (cambio de numero): el alta que sigue es la que fija el estado final.
      if (order.payload?.replaced) return;
      if (outcome.ok) {
        // Fuera del reloj; si regresa, su foto tendra que volver a enviarse.
        await client.query(
          `UPDATE attendance.employee_device_branches r
              SET sync_status = 'not_applicable', sync_error = NULL, synced_number = NULL, synced_at = NULL, sync_attempts = 0,
                  face_sync_status = CASE WHEN p.face_photo_path IS NULL THEN 'not_applicable' ELSE 'pending' END,
                  face_synced_at = NULL, face_sync_attempts = 0
             FROM attendance.employee_profiles p
            WHERE r.employee_id = $1 AND r.branch_id = $2 AND p.employee_id = r.employee_id`,
          [employeeId, agent.branch_id],
        );
      } else {
        await row(`sync_status = 'error', sync_error = $2`, [errorMessage]);
      }
    }
    await refreshSyncSummary(client, [Number(employeeId)]);
  });
};
