import pool from '../../config/db';
import { registerAuditEvent } from '../audit.service';
import { invalid, notFound } from './attendance-errors';
import type { AuthenticatedAgent } from './agent-auth.service';
import type { HeartbeatInput } from '../../schemas/attendance/agent.schema';
import { heartbeatTerminalSchema } from '../../schemas/attendance/agent.schema';
import { getAttendanceSettings } from './attendance-settings.service';

/** Terminales (relojes): edicion desde el panel y auto-registro con el latido del agente. */

export const updateTerminal = async (id: number, input: { name?: string; is_active?: boolean }, userId: string) => {
  const { rows } = await pool.query(
    `UPDATE attendance.terminals
        SET name = COALESCE($2, name), is_active = COALESCE($3, is_active)
      WHERE id = $1
  RETURNING id, agent_id, serial_number, name, is_active`,
    [id, input.name ?? null, input.is_active ?? null],
  );
  if (!rows[0]) notFound('Terminal no encontrada.');
  await registerAuditEvent({
    user_id: userId,
    action: 'attendance_terminal_updated',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_terminal',
    entity_id: Number(id),
    metadata: { name: input.name, is_active: input.is_active },
  }).catch(() => undefined);
  const row = rows[0];
  return { id: Number(row.id), agent_id: Number(row.agent_id), serial_number: row.serial_number, name: row.name, is_active: row.is_active };
};

const MAX_TERMINALS = 20;

export interface HeartbeatResult {
  pendingOrders: number;
  serverTime: string;
  clockDriftMaxMin: number;
  terminalErrors: Array<{ serial: string; status: number; message: string }>;
}

/** Actualiza el agente y hace UPSERT de cada terminal por serie. */
export const processHeartbeat = async (agent: AuthenticatedAgent, input: HeartbeatInput): Promise<HeartbeatResult> => {
  const terminals = input.terminals
    .map((item) => heartbeatTerminalSchema.safeParse(item))
    .flatMap((parsed) => (parsed.success && parsed.data.serial.length > 0 ? [parsed.data] : []));
  if (terminals.length > MAX_TERMINALS) {
    invalid(`Maximo ${MAX_TERMINALS} terminales por latido.`);
  }

  await pool.query(
    `UPDATE attendance.agents
        SET last_heartbeat_at = NOW(),
            software_version = COALESCE($2, software_version),
            host_name = COALESCE($3, host_name),
            operating_system = COALESCE($4, operating_system),
            local_ip = COALESCE($5, local_ip)
      WHERE id = $1`,
    [agent.id, input.version ?? null, input.pc ?? null, input.os ?? null, input.ip ?? null],
  );

  const terminalErrors: HeartbeatResult['terminalErrors'] = [];
  for (const t of terminals) {
    const { rowCount } = await pool.query(
      `INSERT INTO attendance.terminals
         (agent_id, branch_id, serial_number, name, model, firmware_version, local_ip, is_online,
          clock_drift_seconds, enrolled_people_count, last_heartbeat_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (serial_number) DO UPDATE
          SET model = COALESCE(EXCLUDED.model, attendance.terminals.model),
              firmware_version = COALESCE(EXCLUDED.firmware_version, attendance.terminals.firmware_version),
              local_ip = COALESCE(EXCLUDED.local_ip, attendance.terminals.local_ip),
              is_online = EXCLUDED.is_online,
              clock_drift_seconds = EXCLUDED.clock_drift_seconds,
              enrolled_people_count = COALESCE(EXCLUDED.enrolled_people_count, attendance.terminals.enrolled_people_count),
              last_heartbeat_at = NOW()
        WHERE attendance.terminals.agent_id = EXCLUDED.agent_id`,
      [
        agent.id, agent.branch_id, t.serial, t.model || t.serial, t.model ?? null, t.firmware ?? null, t.ip ?? null,
        t.online, t.clockDriftSeconds ?? null, t.people ?? null,
      ],
    );
    if (!rowCount) {
      terminalErrors.push({ serial: t.serial, status: 409, message: 'La terminal pertenece a otro agente.' });
    }
  }

  const settings = await getAttendanceSettings();
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM attendance.agent_orders
      WHERE agent_id = $1 AND attempt_count < 5
        AND (order_status = 'pending'
             OR (order_status = 'processing' AND picked_up_at < NOW() - INTERVAL '10 minutes'))`,
    [agent.id],
  );
  return {
    pendingOrders: Number(rows[0]?.total ?? 0),
    serverTime: new Date().toISOString(),
    clockDriftMaxMin: settings.clock_drift_max_min,
    terminalErrors,
  };
};
