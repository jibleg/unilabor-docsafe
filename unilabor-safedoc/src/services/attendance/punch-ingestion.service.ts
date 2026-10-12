import pool from '../../config/db';
import { punchEventSchema } from '../../schemas/attendance/agent.schema';
import type { AuthenticatedAgent } from './agent-auth.service';
import { notFound } from './attendance-errors';
import { getAttendanceSettings } from './attendance-settings.service';
import { discardPunchPhoto, savePunchPhoto } from './attendance-photos';
import { decodePhoto, evaluateClockDrift, mapAttendanceStatus, mapVerificationMethod, parseDeviceTime } from './punch-mapping';

/** Ingesta idempotente de checadas enviadas por el agente. No recalcula dias. */

export interface IngestResult {
  inserted: number;
  duplicated: number;
  invalid: number;
  invalidSerials: string[];
}

const UNKNOWN_EMPLOYEE_REASON = 'Numero de empleado sin colaborador';

export const ingestPunches = async (
  agent: AuthenticatedAgent,
  terminalSerial: string,
  rawEvents: unknown[],
): Promise<IngestResult> => {
  const terminal = await pool.query<{ id: string; branch_id: string }>(
    'SELECT id, branch_id FROM attendance.terminals WHERE serial_number = $1 AND agent_id = $2',
    [terminalSerial, agent.id],
  );
  const terminalRow = terminal.rows[0];
  if (!terminalRow) return notFound('Terminal desconocida: manda primero un latido.');
  const terminalId = Number(terminalRow.id);

  const settings = await getAttendanceSettings();
  const now = new Date();
  const result: IngestResult = { inserted: 0, duplicated: 0, invalid: 0, invalidSerials: [] };

  const events: Array<{ serial: string; employeeNo: string; at: Date; status: string | undefined; method: string | undefined; photo: string | undefined }> = [];
  for (const raw of rawEvents) {
    const parsed = punchEventSchema.safeParse(raw);
    const at = parsed.success ? parseDeviceTime(parsed.data.deviceTime, settings.timezone) : null;
    if (!parsed.success || !at) {
      result.invalid += 1;
      const serial = (raw as { serial?: unknown } | null)?.serial;
      if (serial !== undefined && serial !== null) result.invalidSerials.push(String(serial));
      continue;
    }
    events.push({
      serial: parsed.data.serial, employeeNo: parsed.data.employeeNo, at,
      status: parsed.data.attendanceStatus, method: parsed.data.method, photo: parsed.data.photoBase64,
    });
  }
  if (events.length === 0) return result;

  const numbers = [...new Set(events.map((e) => e.employeeNo.toUpperCase()))];
  const found = await pool.query<{ number: string; employee_id: string }>(
    `SELECT UPPER(device_employee_number) AS number, employee_id
       FROM attendance.employee_profiles WHERE UPPER(device_employee_number) = ANY($1::text[])`,
    [numbers],
  );
  const employeeByNumber = new Map(found.rows.map((r) => [r.number, Number(r.employee_id)]));

  let latest: Date | null = null;
  for (const event of events) {
    const employeeId = employeeByNumber.get(event.employeeNo.toUpperCase()) ?? null;
    const drift = evaluateClockDrift(event.at, now, settings.clock_drift_max_min);
    const reviewReason = employeeId === null ? UNKNOWN_EMPLOYEE_REASON : drift.reason;
    const needsReview = employeeId === null || drift.needsReview;
    const photo = decodePhoto(event.photo);
    const photoPath = photo ? await savePunchPhoto(photo, now) : null;

    const inserted = await pool.query(
      `INSERT INTO attendance.punches
         (employee_id, device_employee_number, source, terminal_id, branch_id, punch_type, punched_at,
          device_reported_at, verification_method, device_event_serial, photo_path, review_status, review_reason)
       VALUES ($1, $2, 'terminal', $3, $4, $5, $6, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (terminal_id, device_event_serial)
         WHERE terminal_id IS NOT NULL AND device_event_serial IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        employeeId, event.employeeNo.slice(0, 20), terminalId, terminalRow.branch_id,
        mapAttendanceStatus(event.status), event.at.toISOString(), mapVerificationMethod(event.method),
        event.serial, photoPath, needsReview ? 'pending' : 'none', needsReview ? reviewReason : null,
      ],
    );
    if (inserted.rowCount) {
      result.inserted += 1;
      if (!latest || event.at > latest) latest = event.at;
    } else {
      result.duplicated += 1;
      if (photoPath) await discardPunchPhoto(photoPath);
    }
  }

  if (latest) {
    await pool.query(
      `UPDATE attendance.terminals SET last_event_at = GREATEST(COALESCE(last_event_at, $2::timestamptz), $2::timestamptz)
        WHERE id = $1`,
      [terminalId, latest.toISOString()],
    );
  }
  return result;
};
