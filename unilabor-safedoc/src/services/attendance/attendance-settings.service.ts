import pool from '../../config/db';
import { registerAuditEvent } from '../audit.service';
import { invalid } from './attendance-errors';
import {
  SETTING_DEFINITIONS,
  getSettingDefinition,
  mergeSettings,
  validateSettingValue,
  type AttendanceSettings,
} from './engine/settings';

/**
 * Parametros del modulo en BD (attendance.settings guarda SOLO lo que difiere
 * del default). Cada cambio exige un motivo y queda en attendance.setting_changes.
 */

const CACHE_TTL_MS = 30_000;
let cache: { value: AttendanceSettings; expiresAt: number } | null = null;

export const invalidateAttendanceSettingsCache = (): void => {
  cache = null;
};

export const getAttendanceSettings = async (): Promise<AttendanceSettings> => {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }
  const { rows } = await pool.query<{ setting_key: string; setting_value: unknown }>(
    'SELECT setting_key, setting_value FROM attendance.settings',
  );
  const stored = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  const value = mergeSettings(stored);
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
};

export interface SettingView {
  key: string;
  label: string;
  description: string;
  group: string;
  type: string;
  unit: string | null;
  options: readonly string[] | null;
  min: number | null;
  max: number | null;
  default_value: number | string;
  value: number | string;
  is_modified: boolean;
}

export const listAttendanceSettings = async (): Promise<SettingView[]> => {
  const settings = await getAttendanceSettings();
  return SETTING_DEFINITIONS.map((definition) => {
    const value = settings[definition.key];
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      group: definition.group,
      type: definition.type,
      unit: definition.unit ?? null,
      options: definition.options ?? null,
      min: definition.min ?? null,
      max: definition.max ?? null,
      default_value: definition.default,
      value,
      is_modified: value !== definition.default,
    };
  });
};

export interface SaveSettingInput {
  key: string;
  value: unknown;
  reason: string;
  userId: string;
}

export const saveAttendanceSetting = async (input: SaveSettingInput): Promise<SettingView[]> => {
  const definition = getSettingDefinition(input.key);
  if (!definition) {
    invalid('Parametro desconocido.');
  }
  if (input.reason.trim().length < 5) {
    invalid('Indica el motivo del cambio (minimo 5 caracteres).');
  }

  let normalized: number | string;
  try {
    normalized = validateSettingValue(input.key, input.value);
  } catch (error: any) {
    return invalid(error?.message ?? 'Valor invalido.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const previous = await client.query<{ setting_value: unknown }>(
      'SELECT setting_value FROM attendance.settings WHERE setting_key = $1 FOR UPDATE',
      [input.key],
    );
    const previousValue = previous.rows[0]?.setting_value ?? definition!.default;

    if (normalized === definition!.default) {
      await client.query('DELETE FROM attendance.settings WHERE setting_key = $1', [input.key]);
    } else {
      await client.query(
        `INSERT INTO attendance.settings (setting_key, setting_value, updated_by_user_id, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = EXCLUDED.setting_value,
               updated_by_user_id = EXCLUDED.updated_by_user_id,
               updated_at = NOW()`,
        [input.key, JSON.stringify(normalized), input.userId],
      );
    }
    await client.query(
      `INSERT INTO attendance.setting_changes
         (setting_key, previous_value, new_value, change_reason, changed_by_user_id)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)`,
      [input.key, JSON.stringify(previousValue), JSON.stringify(normalized), input.reason.trim(), input.userId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  invalidateAttendanceSettingsCache();
  await registerAuditEvent({
    user_id: input.userId,
    action: 'attendance_setting_changed',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_setting',
    metadata: { key: input.key, new_value: normalized, reason: input.reason.trim() },
  }).catch(() => undefined);

  return listAttendanceSettings();
};

export const listAttendanceSettingChanges = async (limit = 100) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.setting_key, c.previous_value, c.new_value, c.change_reason, c.changed_at,
            u.full_name AS changed_by_name
       FROM attendance.setting_changes c
       LEFT JOIN public.users u ON u.id = c.changed_by_user_id
      ORDER BY c.changed_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows;
};
