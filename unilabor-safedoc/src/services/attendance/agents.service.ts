import pool from '../../config/db';
import { registerAuditEvent } from '../audit.service';
import { conflict, invalid, notFound } from './attendance-errors';
import { agentKeyPrefix, generateAgentKey, hashAgentKey } from './agent-auth.service';
import { getAttendanceSettings } from './attendance-settings.service';
import { isFresh, isoTs } from './device-sql';

/** Administracion de agentes (uno por sucursal) y panorama de relojes. */

export interface AgentPublic {
  id: number;
  branch_id: number;
  branch_name: string | null;
  name: string;
  api_key_prefix: string;
  software_version: string | null;
  host_name: string | null;
  operating_system: string | null;
  local_ip: string | null;
  last_heartbeat_at: string | null;
  is_online: boolean;
  is_active: boolean;
  created_at: string;
}

const AGENT_SELECT = (offlineParam: string) => `
  SELECT a.id, a.branch_id, u.name AS branch_name, a.name, a.api_key_prefix, a.software_version,
         a.host_name, a.operating_system, a.local_ip, ${isoTs('a.last_heartbeat_at')} AS last_heartbeat_at,
         ${isFresh('a.last_heartbeat_at', offlineParam)} AS is_online,
         a.is_active, ${isoTs('a.created_at')} AS created_at
    FROM attendance.agents a
    LEFT JOIN public.helpdesk_asset_units u ON u.id = a.branch_id`;

const mapAgent = (row: Record<string, any>): AgentPublic => ({
  id: Number(row.id),
  branch_id: Number(row.branch_id),
  branch_name: row.branch_name ?? null,
  name: row.name,
  api_key_prefix: row.api_key_prefix,
  software_version: row.software_version ?? null,
  host_name: row.host_name ?? null,
  operating_system: row.operating_system ?? null,
  local_ip: row.local_ip ?? null,
  last_heartbeat_at: row.last_heartbeat_at ?? null,
  is_online: Boolean(row.is_online),
  is_active: Boolean(row.is_active),
  created_at: row.created_at,
});

const getAgentPublic = async (id: number): Promise<AgentPublic | null> => {
  const settings = await getAttendanceSettings();
  const { rows } = await pool.query(`${AGENT_SELECT('$2')} WHERE a.id = $1`, [id, settings.agent_offline_min]);
  return rows[0] ? mapAgent(rows[0]) : null;
};

export const requireAgent = async (id: number): Promise<AgentPublic> => {
  const agent = await getAgentPublic(id);
  return agent ?? notFound('Agente no encontrado.');
};

/** Configuracion sugerida para pegar en el archivo del agente. */
const suggestedConfig = (docsafeUrl: string, agentKey: string) => ({ docsafeUrl, agentKey });

const audit = (userId: string, action: string, agentId: number, metadata: Record<string, unknown>) =>
  registerAuditEvent({
    user_id: userId,
    action,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_agent',
    entity_id: agentId,
    metadata,
  }).catch(() => undefined);

export const createAgent = async (input: { branch_id: number; name: string }, userId: string, docsafeUrl: string) => {
  const branch = await pool.query('SELECT id FROM public.helpdesk_asset_units WHERE id = $1 AND is_active = TRUE', [
    input.branch_id,
  ]);
  if (branch.rowCount === 0) invalid('La sucursal no existe o esta inactiva.');
  const existing = await pool.query('SELECT 1 FROM attendance.agents WHERE branch_id = $1', [input.branch_id]);
  if ((existing.rowCount ?? 0) > 0) conflict('La sucursal ya tiene un agente.');

  const key = generateAgentKey();
  let id: number;
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO attendance.agents (branch_id, name, api_key_hash, api_key_prefix, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.branch_id, input.name, hashAgentKey(key), agentKeyPrefix(key), userId],
    );
    id = Number(rows[0]!.id);
  } catch (error: any) {
    if (error?.code === '23505') return conflict('La sucursal ya tiene un agente.');
    throw error;
  }
  await audit(userId, 'attendance_agent_created', id, { branch_id: input.branch_id, name: input.name });
  return { agent: await requireAgent(id), agent_key: key, config: suggestedConfig(docsafeUrl, key) };
};

export const rotateAgentKey = async (id: number, userId: string, docsafeUrl: string) => {
  const key = generateAgentKey();
  const { rowCount } = await pool.query(
    'UPDATE attendance.agents SET api_key_hash = $2, api_key_prefix = $3 WHERE id = $1',
    [id, hashAgentKey(key), agentKeyPrefix(key)],
  );
  if (!rowCount) notFound('Agente no encontrado.');
  await audit(userId, 'attendance_agent_key_rotated', id, {});
  return { agent: await requireAgent(id), agent_key: key, config: suggestedConfig(docsafeUrl, key) };
};

export const updateAgent = async (id: number, input: { name?: string; is_active?: boolean }, userId: string) => {
  const { rowCount } = await pool.query(
    `UPDATE attendance.agents
        SET name = COALESCE($2, name), is_active = COALESCE($3, is_active)
      WHERE id = $1`,
    [id, input.name ?? null, input.is_active ?? null],
  );
  if (!rowCount) notFound('Agente no encontrado.');
  await audit(userId, 'attendance_agent_updated', id, { name: input.name, is_active: input.is_active });
  return requireAgent(id);
};

export const deleteAgent = async (id: number, userId: string): Promise<void> => {
  const agent = await requireAgent(id);
  if (agent.is_active) conflict('Desactiva el agente antes de eliminarlo.');
  // Las checadas son evidencia inmutable y exigen terminal_id (el SET NULL del FK choca con el trigger y
  // el CHECK): un agente con checadas solo puede quedar desactivado.
  const withPunches = await pool.query(
    `SELECT 1 FROM attendance.punches p JOIN attendance.terminals t ON t.id = p.terminal_id
      WHERE t.agent_id = $1 LIMIT 1`,
    [id],
  );
  if ((withPunches.rowCount ?? 0) > 0) {
    conflict('El agente tiene checadas registradas y no se puede eliminar; dejalo desactivado.');
  }
  await pool.query('DELETE FROM attendance.agents WHERE id = $1', [id]);
  await audit(userId, 'attendance_agent_deleted', id, { branch_id: agent.branch_id, name: agent.name });
};

export const getDevicesOverview = async () => {
  const settings = await getAttendanceSettings();
  const offline = settings.agent_offline_min;
  const [branches, agents, terminals, pending, openOrders] = await Promise.all([
    pool.query<{ id: string; code: string; name: string }>(
      'SELECT id, code, name FROM public.helpdesk_asset_units WHERE is_active = TRUE ORDER BY sort_order, name',
    ),
    pool.query(`${AGENT_SELECT('$1')}`, [offline]),
    pool.query(
      `SELECT t.id, t.agent_id, t.branch_id, t.serial_number, t.name, t.model, t.firmware_version, t.local_ip,
              t.is_active, t.clock_drift_seconds, t.enrolled_people_count,
              (t.is_online AND ${isFresh('t.last_heartbeat_at', '$1')}) AS is_online,
              ${isoTs('t.last_event_at')} AS last_event_at, ${isoTs('t.last_heartbeat_at')} AS last_heartbeat_at
         FROM attendance.terminals t ORDER BY t.id`,
      [offline],
    ),
    pool.query<{ branch_id: string; total: string }>(
      `SELECT e.branch_id, COUNT(*) AS total
         FROM attendance.employee_profiles p
         JOIN public.employees e ON e.id = p.employee_id
        WHERE p.device_sync_status IN ('pending', 'error') AND e.branch_id IS NOT NULL
        GROUP BY e.branch_id`,
    ),
    pool.query<{ agent_id: string; total: string }>(
      `SELECT agent_id, COUNT(*) AS total FROM attendance.agent_orders
        WHERE order_status IN ('pending', 'processing') GROUP BY agent_id`,
    ),
  ]);

  const agentByBranch = new Map(agents.rows.map((row) => [Number(row.branch_id), mapAgent(row)]));
  const pendingByBranch = new Map(pending.rows.map((row) => [Number(row.branch_id), Number(row.total)]));
  const ordersByAgent = new Map(openOrders.rows.map((row) => [Number(row.agent_id), Number(row.total)]));

  return {
    agent_offline_min: offline,
    branches: branches.rows.map((branch) => {
      const branchId = Number(branch.id);
      const agent = agentByBranch.get(branchId) ?? null;
      return {
        branch_id: branchId,
        branch_code: branch.code,
        branch_name: branch.name,
        agent,
        terminals: terminals.rows
          .filter((t) => Number(t.branch_id) === branchId)
          .map((t) => ({
            id: Number(t.id),
            agent_id: Number(t.agent_id),
            serial_number: t.serial_number,
            name: t.name,
            model: t.model,
            firmware_version: t.firmware_version,
            local_ip: t.local_ip,
            is_active: t.is_active,
            is_online: Boolean(t.is_online),
            clock_drift_seconds: t.clock_drift_seconds,
            enrolled_people_count: t.enrolled_people_count,
            last_event_at: t.last_event_at,
            last_heartbeat_at: t.last_heartbeat_at,
          })),
        pending_sync_count: pendingByBranch.get(branchId) ?? 0,
        open_orders_count: agent ? (ordersByAgent.get(agent.id) ?? 0) : 0,
      };
    }),
  };
};
