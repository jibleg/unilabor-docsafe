import type { PoolClient } from 'pg';
import pool from '../../config/db';
import { withTransaction } from '../../utils/transaction';
import { registerAuditEvent } from '../audit.service';
import { conflict, invalid, notFound } from './attendance-errors';
import type { AuthenticatedAgent } from './agent-auth.service';
import { isoTs } from './device-sql';
import { requireAgent } from './agents.service';

/** Cola de ordenes: encolado desde el panel y consumo por el agente. */

export const ORDER_STALE_MINUTES = 10;
export const ORDER_MAX_ATTEMPTS = 5;

type OrderType = 'sync_person' | 'remove_person' | 'enroll_fingerprint' | 'enroll_face' | 'check_status';

const insertOrder = async (
  client: Pick<PoolClient, 'query'>,
  order: {
    agentId: number;
    terminalId?: number | null;
    employeeId?: number | null;
    type: OrderType;
    payload?: Record<string, unknown>;
    userId: string;
  },
): Promise<number> => {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO attendance.agent_orders (agent_id, terminal_id, employee_id, order_type, payload, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [order.agentId, order.terminalId ?? null, order.employeeId ?? null, order.type, JSON.stringify(order.payload ?? {}), order.userId],
  );
  return Number(rows[0]!.id);
};

const auditOrders = (userId: string, action: string, agentId: number, metadata: Record<string, unknown>) =>
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

/** Encola altas y bajas de personas del reloj de la sucursal del agente. */
export const queueSyncOrders = async (agentId: number, all: boolean, userId: string) => {
  const agent = await requireAgent(agentId);
  if (!agent.is_active) conflict('El agente esta desactivado.');

  const result = await withTransaction(async (client) => {
    // Serializa por agente para no duplicar ordenes si se pulsa dos veces a la vez.
    await client.query('SELECT id FROM attendance.agents WHERE id = $1 FOR UPDATE', [agentId]);
    const { rows } = await client.query<{
      employee_id: string; full_name: string; number: string | null; is_enabled: boolean; is_active: boolean; status: string;
    }>(
      `SELECT e.id AS employee_id, e.full_name, p.device_employee_number AS number, p.is_enabled,
              e.is_active, p.device_sync_status AS status
         FROM attendance.employee_profiles p
         JOIN public.employees e ON e.id = p.employee_id
        WHERE e.branch_id = $1`,
      [agent.branch_id],
    );
    const open = await client.query<{ employee_id: string; order_type: string }>(
      `SELECT employee_id, order_type FROM attendance.agent_orders
        WHERE agent_id = $1 AND order_status IN ('pending', 'processing')
          AND order_type IN ('sync_person', 'remove_person') AND employee_id IS NOT NULL`,
      [agentId],
    );
    const hasOpen = new Set(open.rows.map((r) => `${r.order_type}:${r.employee_id}`));

    let queuedSync = 0;
    let queuedRemove = 0;
    let skippedWithoutNumber = 0;
    for (const row of rows) {
      const shouldBeOnDevice = row.is_enabled && row.is_active;
      let type: OrderType | null = null;
      if (shouldBeOnDevice) {
        if (!row.number) {
          skippedWithoutNumber += 1;
          continue;
        }
        if (all || ['pending', 'error', 'not_applicable'].includes(row.status)) type = 'sync_person';
      } else if (row.status === 'synced' && row.number) {
        type = 'remove_person';
      }
      if (!type || hasOpen.has(`${type}:${row.employee_id}`)) continue;

      await insertOrder(client, {
        agentId,
        employeeId: Number(row.employee_id),
        type,
        payload: { employeeNo: row.number, name: row.full_name },
        userId,
      });
      await client.query(
        `UPDATE attendance.employee_profiles
            SET device_sync_status = 'pending', device_sync_error = NULL WHERE employee_id = $1`,
        [row.employee_id],
      );
      if (type === 'sync_person') queuedSync += 1;
      else queuedRemove += 1;
    }
    return { queued: queuedSync + queuedRemove, queued_sync: queuedSync, queued_remove: queuedRemove, skipped_without_number: skippedWithoutNumber };
  });

  await auditOrders(userId, 'attendance_agent_sync_queued', agentId, { all, ...result });
  return result;
};

export const queueEnrollOrder = async (employeeId: number, mode: 'fingerprint' | 'face', userId: string) => {
  const { rows } = await pool.query<{
    id: string; full_name: string; branch_id: string | null; number: string | null; status: string | null;
  }>(
    `SELECT e.id, e.full_name, e.branch_id, p.device_employee_number AS number, p.device_sync_status AS status
       FROM public.employees e
       LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE e.id = $1`,
    [employeeId],
  );
  const employee = rows[0];
  if (!employee) return notFound('Colaborador no encontrado.');
  if (!employee.branch_id) return invalid('El colaborador no tiene sucursal asignada.');
  if (!employee.number) return invalid('El colaborador no tiene numero de reloj asignado.');
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
  withTransaction(async (client) => {
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
      if (row.employee_id && (row.order_type === 'sync_person' || row.order_type === 'remove_person')) {
        await client.query(
          `UPDATE attendance.employee_profiles SET device_sync_status = 'error',
                  device_sync_error = 'El agente no respondio tras varios intentos' WHERE employee_id = $1`,
          [row.employee_id],
        );
      }
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
    const taken = await client.query<{ id: string; order_type: string; payload: unknown; terminal_serial: string | null }>(
      `UPDATE attendance.agent_orders o
          SET order_status = 'processing', attempt_count = attempt_count + 1, picked_up_at = NOW()
        WHERE o.id = ANY($1::bigint[])
    RETURNING o.id, o.order_type, o.payload,
              (SELECT t.serial_number FROM attendance.terminals t WHERE t.id = o.terminal_id) AS terminal_serial`,
      [rows.map((r) => r.id)],
    );
    return taken.rows
      .map((r) => ({ id: Number(r.id), type: r.order_type, terminalSerial: r.terminal_serial, payload: r.payload }))
      .sort((a, b) => a.id - b.id);
  });

export const finishOrder = async (
  agent: AuthenticatedAgent,
  orderId: number,
  outcome: { ok: boolean; result?: Record<string, unknown> | undefined; error?: string | undefined },
): Promise<void> => {
  const errorMessage = outcome.ok ? null : (outcome.error ?? 'Error sin detalle').slice(0, 500);
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ employee_id: string | null; order_type: string }>(
      `UPDATE attendance.agent_orders
          SET order_status = $3, result = $4::jsonb, error_message = $5, finished_at = NOW()
        WHERE id = $1 AND agent_id = $2 AND order_status = 'processing'
    RETURNING employee_id, order_type`,
      [orderId, agent.id, outcome.ok ? 'done' : 'error', outcome.result ? JSON.stringify(outcome.result) : null, errorMessage],
    );
    const order = rows[0];
    if (!order) return notFound('Orden no encontrada o ya cerrada.');
    if (!order.employee_id) return;

    if (order.order_type === 'sync_person') {
      await client.query(
        outcome.ok
          ? `UPDATE attendance.employee_profiles
                SET device_sync_status = 'synced', device_synced_at = NOW(), device_sync_error = NULL
              WHERE employee_id = $1`
          : `UPDATE attendance.employee_profiles
                SET device_sync_status = 'error', device_sync_error = $2 WHERE employee_id = $1`,
        outcome.ok ? [order.employee_id] : [order.employee_id, errorMessage],
      );
    } else if (order.order_type === 'remove_person') {
      // Una baja correcta deja al colaborador fuera del reloj: ya no hay nada que sincronizar.
      await client.query(
        outcome.ok
          ? `UPDATE attendance.employee_profiles
                SET device_sync_status = 'not_applicable', device_sync_error = NULL, device_synced_at = NULL
              WHERE employee_id = $1`
          : `UPDATE attendance.employee_profiles
                SET device_sync_status = 'error', device_sync_error = $2 WHERE employee_id = $1`,
        outcome.ok ? [order.employee_id] : [order.employee_id, errorMessage],
      );
    }
  });
};
