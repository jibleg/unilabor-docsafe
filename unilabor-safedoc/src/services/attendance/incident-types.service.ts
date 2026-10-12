import pool from '../../config/db';
import type {
  CreateIncidentTypeInput,
  UpdateIncidentTypeInput,
} from '../../schemas/attendance/incident-types.schema';
import { registerAuditEvent } from '../audit.service';
import { conflict, invalid, notFound } from './attendance-errors';

/** Catalogo de tipos de incidencia (los de sistema no cambian de codigo ni se desactivan). */

export interface IncidentTypeRow {
  id: number;
  code: string;
  name: string;
  requires_attachment: boolean;
  is_paid: boolean;
  deducts_vacation: boolean;
  counts_as_attendance: boolean;
  is_hourly: boolean;
  is_system: boolean;
  sort_order: number;
  is_active: boolean;
}

const COLUMNS = `id::int AS id, code, name, requires_attachment, is_paid, deducts_vacation,
  counts_as_attendance, is_hourly, is_system, sort_order::int AS sort_order, is_active`;

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string })?.code === '23505';

/** Regla pura: que cambios no se permiten sobre un tipo de sistema. */
export const systemTypeViolation = (
  current: Pick<IncidentTypeRow, 'is_system' | 'code'>,
  input: UpdateIncidentTypeInput,
): string | null => {
  if (!current.is_system) return null;
  if (input.code !== undefined && input.code !== current.code) {
    return 'El codigo de un tipo de sistema no se puede cambiar.';
  }
  if (input.is_active === false) return 'Un tipo de sistema no se puede desactivar.';
  return null;
};

export const listIncidentTypes = async (includeInactive: boolean): Promise<IncidentTypeRow[]> => {
  const { rows } = await pool.query<IncidentTypeRow>(
    `SELECT ${COLUMNS} FROM attendance.incident_types
      ${includeInactive ? '' : 'WHERE is_active'} ORDER BY sort_order, id`,
  );
  return rows;
};

const getIncidentType = async (id: number): Promise<IncidentTypeRow> => {
  const { rows } = await pool.query<IncidentTypeRow>(
    `SELECT ${COLUMNS} FROM attendance.incident_types WHERE id = $1`,
    [id],
  );
  return rows[0] ?? notFound('Tipo de incidencia no encontrado.');
};

const audit = (userId: string, action: string, id: number, metadata: Record<string, unknown>) =>
  registerAuditEvent({
    user_id: userId,
    action,
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_incident_type',
    entity_id: id,
    metadata,
  }).catch(() => undefined);

export const createIncidentType = async (
  input: CreateIncidentTypeInput,
  userId: string,
): Promise<IncidentTypeRow> => {
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO attendance.incident_types
         (code, name, requires_attachment, is_paid, deducts_vacation, counts_as_attendance, is_hourly, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               COALESCE($8, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM attendance.incident_types)))
       RETURNING id::int AS id`,
      [
        input.code,
        input.name,
        input.requires_attachment,
        input.is_paid,
        input.deducts_vacation,
        input.counts_as_attendance,
        input.is_hourly,
        input.sort_order ?? null,
      ],
    );
    const created = await getIncidentType(rows[0]!.id);
    await audit(userId, 'attendance_incident_type_created', created.id, { code: created.code });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) return conflict('Ya existe un tipo de incidencia con ese codigo.');
    throw error;
  }
};

export const updateIncidentType = async (
  id: number,
  input: UpdateIncidentTypeInput,
  userId: string,
): Promise<IncidentTypeRow> => {
  const current = await getIncidentType(id);
  const violation = systemTypeViolation(current, input);
  if (violation) invalid(violation);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [column, value] of Object.entries(input)) {
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  values.push(id);
  try {
    await pool.query(`UPDATE attendance.incident_types SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  } catch (error) {
    if (isUniqueViolation(error)) return conflict('Ya existe un tipo de incidencia con ese codigo.');
    throw error;
  }
  const updated = await getIncidentType(id);
  await audit(userId, 'attendance_incident_type_updated', id, { changes: { ...input } });
  return updated;
};
