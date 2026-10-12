import { createHash, randomBytes } from 'node:crypto';
import pool from '../../config/db';
import { AttendanceError } from './attendance-errors';

/**
 * Clave del agente: 64 hex (32 bytes). En BD solo se guarda su SHA-256 y los
 * primeros 8 caracteres (para reconocerla en el panel). La clave en claro se
 * muestra una unica vez y NUNCA se loguea.
 */

export const AGENT_KEY_PATTERN = /^[0-9a-f]{64}$/;

export const generateAgentKey = (): string => randomBytes(32).toString('hex');
export const hashAgentKey = (key: string): string => createHash('sha256').update(key).digest('hex');
export const agentKeyPrefix = (key: string): string => key.slice(0, 8);

/** Extrae la clave de "Authorization: Bearer <64 hex>" o null si no cumple el formato. */
export const extractBearerKey = (header: string | undefined): string | null => {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  const key = match?.[1]?.toLowerCase() ?? null;
  return key && AGENT_KEY_PATTERN.test(key) ? key : null;
};

export interface AuthenticatedAgent {
  id: number;
  branch_id: number;
  name: string;
}

/** Valida la clave contra attendance.agents. 401 si no existe, 403 si esta inactivo. */
export const authenticateAgentKey = async (header: string | undefined): Promise<AuthenticatedAgent> => {
  const key = extractBearerKey(header);
  if (!key) {
    throw new AttendanceError('ATTENDANCE_UNAUTHENTICATED', 'Clave de agente invalida');
  }
  const { rows } = await pool.query<{ id: string; branch_id: string; name: string; is_active: boolean }>(
    'SELECT id, branch_id, name, is_active FROM attendance.agents WHERE api_key_hash = $1',
    [hashAgentKey(key)],
  );
  const row = rows[0];
  if (!row) {
    throw new AttendanceError('ATTENDANCE_UNAUTHENTICATED', 'Clave de agente invalida');
  }
  if (!row.is_active) {
    throw new AttendanceError('ATTENDANCE_FORBIDDEN', 'El agente esta desactivado');
  }
  return { id: Number(row.id), branch_id: Number(row.branch_id), name: row.name };
};
