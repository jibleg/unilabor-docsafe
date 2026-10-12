import pool from '../../config/db';
import { withTransaction, type Queryable } from '../../utils/transaction';
import { sendGenericNotification } from '../notification.service';
import { conflict, invalid, notFound } from './attendance-errors';
import { recalculateRange } from './day-recalculation.service';
import { evaluateVacationRequest } from './vacation-balance.service';
import { recalculateVacationDaysTaken } from './vacation-periods.service';
import { getWorkingDays } from './working-days.service';
import {
  assertUploadedFilesAreValid,
  insertAttachments,
  listAttachments,
  type AttachmentView,
} from './incident-attachments.service';

/** Incidencias: captura, listado, detalle y transiciones de estado. */

export type IncidentStatus = 'captured' | 'authorized' | 'rejected' | 'cancelled';
export type IncidentAction = 'authorize' | 'reject' | 'cancel';

export interface IncidentView {
  id: number;
  employee: { id: number; full_name: string; employee_code: string; branch_id: number | null; branch_name: string | null };
  type: {
    id: number; code: string; name: string; is_hourly: boolean; requires_attachment: boolean; deducts_vacation: boolean;
  };
  start_date: string;
  end_date: string;
  days: number | null;
  hours: number | null;
  status: IncidentStatus;
  reason: string | null;
  imss_folio: string | null;
  captured_by_name: string | null;
  authorized_by_name: string | null;
  authorized_at: string | null;
  authorization_notes: string | null;
  notified_at: string | null;
  attachments_count: number;
  created_at: string;
}

export interface IncidentDetail extends IncidentView {
  attachments: AttachmentView[];
}

const SELECT_INCIDENT = `
  SELECT i.id::text, i.employee_id::text, e.full_name, e.employee_code, e.branch_id::text, b.name AS branch_name,
         t.id::text AS type_id, t.code AS type_code, t.name AS type_name, t.is_hourly, t.requires_attachment, t.deducts_vacation,
         i.start_date::text AS start_date, i.end_date::text AS end_date, i.days::float8 AS days, i.hours::float8 AS hours,
         i.incident_status, i.reason, i.imss_folio, cu.full_name AS captured_by_name, au.full_name AS authorized_by_name,
         i.authorized_at, i.authorization_notes, i.notified_at, i.created_at,
         (SELECT COUNT(*) FROM attendance.incident_attachments a WHERE a.incident_id = i.id AND a.deleted_at IS NULL)::int AS attachments_count
    FROM attendance.incidents i
    JOIN public.employees e ON e.id = i.employee_id
    JOIN attendance.incident_types t ON t.id = i.incident_type_id
    LEFT JOIN public.helpdesk_asset_units b ON b.id = e.branch_id
    LEFT JOIN public.users cu ON cu.id = i.captured_by_user_id
    LEFT JOIN public.users au ON au.id = i.authorized_by_user_id`;

interface IncidentRow {
  id: string; employee_id: string; full_name: string; employee_code: string; branch_id: string | null; branch_name: string | null;
  type_id: string; type_code: string; type_name: string; is_hourly: boolean; requires_attachment: boolean; deducts_vacation: boolean;
  start_date: string; end_date: string; days: number | null; hours: number | null; incident_status: IncidentStatus;
  reason: string | null; imss_folio: string | null; captured_by_name: string | null; authorized_by_name: string | null;
  authorized_at: Date | null; authorization_notes: string | null; notified_at: Date | null; created_at: Date;
  attachments_count: number;
}

const toView = (row: IncidentRow): IncidentView => ({
  id: Number(row.id),
  employee: {
    id: Number(row.employee_id),
    full_name: row.full_name,
    employee_code: row.employee_code,
    branch_id: row.branch_id === null ? null : Number(row.branch_id),
    branch_name: row.branch_name,
  },
  type: {
    id: Number(row.type_id), code: row.type_code, name: row.type_name, is_hourly: row.is_hourly,
    requires_attachment: row.requires_attachment, deducts_vacation: row.deducts_vacation,
  },
  start_date: row.start_date,
  end_date: row.end_date,
  days: row.days,
  hours: row.hours,
  status: row.incident_status,
  reason: row.reason,
  imss_folio: row.imss_folio,
  captured_by_name: row.captured_by_name,
  authorized_by_name: row.authorized_by_name,
  authorized_at: row.authorized_at ? row.authorized_at.toISOString() : null,
  authorization_notes: row.authorization_notes,
  notified_at: row.notified_at ? row.notified_at.toISOString() : null,
  attachments_count: row.attachments_count,
  created_at: row.created_at.toISOString(),
});

export const getIncidentDetail = async (id: number, db: Queryable = pool): Promise<IncidentDetail> => {
  const { rows } = await db.query<IncidentRow>(`${SELECT_INCIDENT} WHERE i.id = $1`, [id]);
  const row = rows[0];
  if (!row) return notFound('Incidencia no encontrada.');
  return { ...toView(row), attachments: await listAttachments(db, id) };
};

export interface ListIncidentsFilter {
  from?: string | undefined;
  to?: string | undefined;
  employee_id?: number | undefined;
  branch_id?: number | undefined;
  type_id?: number | undefined;
  status?: IncidentStatus | undefined;
  search?: string | undefined;
  page: number;
  limit: number;
}

export const listIncidents = async (filter: ListIncidentsFilter) => {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, value: unknown): void => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  // Traslape de rango: la incidencia toca [from, to].
  if (filter.from) add('i.end_date >= ?::date', filter.from);
  if (filter.to) add('i.start_date <= ?::date', filter.to);
  if (filter.employee_id) add('i.employee_id = ?', filter.employee_id);
  if (filter.branch_id) add('e.branch_id = ?', filter.branch_id);
  if (filter.type_id) add('i.incident_type_id = ?', filter.type_id);
  if (filter.status) add('i.incident_status = ?', filter.status);
  if (filter.search) {
    params.push(`%${filter.search.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM attendance.incidents i JOIN public.employees e ON e.id = i.employee_id ${whereSql}`,
    params,
  );
  params.push(filter.limit, (filter.page - 1) * filter.limit);
  const { rows } = await pool.query<IncidentRow>(
    `${SELECT_INCIDENT} ${whereSql} ORDER BY i.start_date DESC, i.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const totalCount = Number(total.rows[0]?.count ?? 0);
  return {
    data: rows.map(toView),
    pagination: {
      page: filter.page,
      limit: filter.limit,
      total: totalCount,
      pages: Math.max(1, Math.ceil(totalCount / filter.limit)),
    },
  };
};

// -----------------------------------------------------------------------------
// Captura
// -----------------------------------------------------------------------------

export interface CreateIncidentInput {
  employeeId: number;
  incidentTypeId: number;
  startDate: string;
  endDate?: string | undefined;
  hours?: number | undefined;
  reason?: string | undefined;
  imssFolio?: string | undefined;
  authorize?: boolean | undefined;
  authorizationNotes?: string | undefined;
  /** Dias ya calculados (justificar falta); si se omite se cuentan los laborables. */
  days?: number | undefined;
}

export interface CreateIncidentOptions {
  /** Importacion Excel: el comprobante se adjunta despues, la incidencia queda capturada. */
  allowMissingAttachment?: boolean;
}

interface TypeRow {
  id: string; code: string; name: string; requires_attachment: boolean; deducts_vacation: boolean; is_hourly: boolean; is_active: boolean;
}

/** Inserta la incidencia dentro de la transaccion recibida. Devuelve id, avisos y si quedo autorizada. */
export const createIncidentTx = async (
  client: Queryable,
  input: CreateIncidentInput,
  files: readonly Express.Multer.File[],
  userId: string,
  options: CreateIncidentOptions = {},
): Promise<{ id: number; warnings: string[]; authorized: boolean; deductsVacation: boolean; endDate: string }> => {
  // Serializa las capturas del mismo colaborador (evita duplicados concurrentes).
  await client.query('SELECT pg_advisory_xact_lock(7101, $1::int)', [input.employeeId]);

  const employee = await client.query(
    `SELECT 1 FROM public.employees e
       JOIN attendance.employee_profiles p ON p.employee_id = e.id AND p.is_enabled
      WHERE e.id = $1 AND e.is_active`,
    [input.employeeId],
  );
  if (employee.rows.length === 0) return invalid('El colaborador no existe o no esta habilitado en el control de asistencia.');

  const typeResult = await client.query<TypeRow>(
    `SELECT id::text, code, name, requires_attachment, deducts_vacation, is_hourly, is_active
       FROM attendance.incident_types WHERE id = $1`,
    [input.incidentTypeId],
  );
  const type = typeResult.rows[0];
  if (!type || !type.is_active) return invalid('El tipo de incidencia no existe o esta inactivo.');

  const endDate = input.endDate ?? input.startDate;
  if (endDate < input.startDate) invalid('La fecha final no puede ser anterior a la inicial.');
  if (type.is_hourly) {
    if (input.hours === undefined || !(input.hours > 0 && input.hours <= 24)) {
      invalid(`"${type.name}" se captura en horas: indica las horas (mayores a 0 y hasta 24).`);
    }
    if (endDate !== input.startDate) invalid(`"${type.name}" se captura en una sola fecha.`);
  }
  if (type.requires_attachment && files.length === 0 && !options.allowMissingAttachment) {
    invalid(`"${type.name}" requiere comprobante: adjunta al menos un archivo.`);
  }

  const duplicate = await client.query(
    `SELECT 1 FROM attendance.incidents
      WHERE employee_id = $1 AND incident_type_id = $2 AND start_date = $3::date AND end_date = $4::date
        AND incident_status IN ('captured', 'authorized')`,
    [input.employeeId, input.incidentTypeId, input.startDate, endDate],
  );
  if (duplicate.rows.length > 0) return conflict('Ya existe una incidencia igual (mismo colaborador, tipo y fechas).');

  const days = type.is_hourly
    ? null
    : input.days ?? (await getWorkingDays(input.employeeId, input.startDate, endDate, client));

  const warnings: string[] = [];
  if (type.deducts_vacation && !type.is_hourly) {
    const evaluation = await evaluateVacationRequest(
      {
        employeeId: input.employeeId,
        type: { deducts_vacation: true, is_hourly: false },
        startDate: input.startDate,
        endDate,
        workingDays: days ?? 0,
      },
      client,
    );
    if (evaluation.blocked) return conflict(evaluation.message ?? 'La solicitud excede el saldo de vacaciones.');
    if (evaluation.message) warnings.push(evaluation.message);
  }

  const authorized = Boolean(input.authorize) && !(options.allowMissingAttachment && type.requires_attachment && files.length === 0);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO attendance.incidents
       (employee_id, incident_type_id, start_date, end_date, hours, days, reason, imss_folio, incident_status,
        captured_by_user_id, authorized_by_user_id, authorized_at, authorization_notes)
     VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10,
             $11, CASE WHEN $9 = 'authorized' THEN NOW() ELSE NULL END, $12)
     RETURNING id::text`,
    [
      input.employeeId, input.incidentTypeId, input.startDate, endDate, type.is_hourly ? input.hours : null, days,
      input.reason ?? null, input.imssFolio ?? null, authorized ? 'authorized' : 'captured', userId,
      authorized ? userId : null, authorized ? (input.authorizationNotes ?? null) : null,
    ],
  );
  const id = Number(inserted.rows[0]?.id);
  await insertAttachments(client, id, files, userId);
  return { id, warnings, authorized, deductsVacation: type.deducts_vacation && !type.is_hourly, endDate };
};

export interface IncidentChangeEffects {
  employeeId: number;
  startDate: string;
  endDate: string;
  deductsVacation: boolean;
}

/** Recalculo de dias y vacaciones tras tocar una incidencia autorizada. Best-effort: nunca rompe la peticion. */
export const applyIncidentEffects = async (effects: IncidentChangeEffects): Promise<void> => {
  try {
    await recalculateRange({ from: effects.startDate, to: effects.endDate, employeeIds: [effects.employeeId] });
  } catch (error) {
    console.error('[attendance] recalculateRange tras cambio de incidencia:', error);
  }
  if (effects.deductsVacation) {
    try {
      await recalculateVacationDaysTaken(effects.employeeId);
    } catch (error) {
      console.error('[attendance] recalculateVacationDaysTaken tras cambio de incidencia:', error);
    }
  }
};

/** Aviso por correo al colaborador cuando se autoriza. Best-effort; marca notified_at si salio. */
export const notifyIncidentAuthorized = async (incidentId: number): Promise<void> => {
  try {
    const { rows } = await pool.query<{
      full_name: string; email: string | null; type_name: string; start_date: string; end_date: string; authorization_notes: string | null;
    }>(
      `SELECT e.full_name, e.email, t.name AS type_name, i.start_date::text AS start_date, i.end_date::text AS end_date,
              i.authorization_notes
         FROM attendance.incidents i
         JOIN public.employees e ON e.id = i.employee_id
         JOIN attendance.incident_types t ON t.id = i.incident_type_id
        WHERE i.id = $1`,
      [incidentId],
    );
    const info = rows[0];
    if (!info?.email) return;
    const range = info.start_date === info.end_date ? info.start_date : `del ${info.start_date} al ${info.end_date}`;
    const body =
      `Hola ${info.full_name},\n\nTu incidencia "${info.type_name}" (${range}) fue autorizada.` +
      (info.authorization_notes ? `\n\nNotas: ${info.authorization_notes}` : '') +
      '\n\nRecursos Humanos.';
    const result = await sendGenericNotification(
      { email: info.email, phone: null },
      `Incidencia autorizada: ${info.type_name}`,
      body,
      '',
      'attendance_incident_authorized',
    );
    if (result.emailSent) {
      await pool.query('UPDATE attendance.incidents SET notified_at = NOW() WHERE id = $1', [incidentId]);
    }
  } catch (error) {
    console.error('[attendance] aviso de incidencia autorizada:', error);
  }
};

export interface CreatedIncident {
  incident: IncidentDetail;
  warnings: string[];
}

export const createIncident = async (
  input: CreateIncidentInput,
  files: readonly Express.Multer.File[],
  userId: string,
): Promise<CreatedIncident> => {
  assertUploadedFilesAreValid(files);
  const created = await withTransaction((client) => createIncidentTx(client, input, files, userId));
  if (created.authorized) {
    await applyIncidentEffects({
      employeeId: input.employeeId,
      startDate: input.startDate,
      endDate: created.endDate,
      deductsVacation: created.deductsVacation,
    });
    await notifyIncidentAuthorized(created.id);
  }
  return { incident: await getIncidentDetail(created.id), warnings: created.warnings };
};

// -----------------------------------------------------------------------------
// Transiciones
// -----------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<IncidentAction, { from: IncidentStatus[]; to: IncidentStatus }> = {
  authorize: { from: ['captured'], to: 'authorized' },
  reject: { from: ['captured', 'authorized'], to: 'rejected' },
  cancel: { from: ['captured', 'authorized'], to: 'cancelled' },
};

export interface TransitionResult {
  incident: IncidentDetail;
  previousStatus: IncidentStatus;
  warnings: string[];
}

export const transitionIncident = async (
  id: number,
  action: IncidentAction,
  notes: string | undefined,
  userId: string,
): Promise<TransitionResult> => {
  const rule = ALLOWED_TRANSITIONS[action];
  const outcome = await withTransaction(async (client) => {
    const found = await client.query<{
      employee_id: string; start_date: string; end_date: string; days: number | null; incident_status: IncidentStatus;
      requires_attachment: boolean; deducts_vacation: boolean; is_hourly: boolean; type_name: string; attachments: number;
    }>(
      `SELECT i.employee_id::text, i.start_date::text AS start_date, i.end_date::text AS end_date, i.days::float8 AS days,
              i.incident_status, t.requires_attachment, t.deducts_vacation, t.is_hourly, t.name AS type_name,
              (SELECT COUNT(*) FROM attendance.incident_attachments a WHERE a.incident_id = i.id AND a.deleted_at IS NULL)::int AS attachments
         FROM attendance.incidents i
         JOIN attendance.incident_types t ON t.id = i.incident_type_id
        WHERE i.id = $1
        FOR UPDATE OF i`,
      [id],
    );
    const row = found.rows[0];
    if (!row) return notFound('Incidencia no encontrada.');
    if (!rule.from.includes(row.incident_status)) {
      return conflict(`No se puede aplicar esta accion a una incidencia en estado "${row.incident_status}".`);
    }

    const warnings: string[] = [];
    if (action === 'authorize') {
      if (row.requires_attachment && row.attachments === 0) {
        return conflict(`"${row.type_name}" requiere comprobante: adjunta un archivo antes de autorizar.`);
      }
      if (row.deducts_vacation && !row.is_hourly) {
        const evaluation = await evaluateVacationRequest(
          {
            employeeId: Number(row.employee_id),
            type: { deducts_vacation: true, is_hourly: false },
            startDate: row.start_date,
            endDate: row.end_date,
            workingDays: row.days ?? 0,
            excludeIncidentId: id,
          },
          client,
        );
        if (evaluation.blocked) return conflict(evaluation.message ?? 'La solicitud excede el saldo de vacaciones.');
        if (evaluation.message) warnings.push(evaluation.message);
      }
    }

    const decides = action !== 'cancel';
    await client.query(
      `UPDATE attendance.incidents
          SET incident_status = $2,
              authorized_by_user_id = CASE WHEN $3 THEN $4::uuid ELSE authorized_by_user_id END,
              authorized_at = CASE WHEN $3 THEN NOW() ELSE authorized_at END,
              authorization_notes = COALESCE($5, authorization_notes)
        WHERE id = $1`,
      [id, rule.to, decides, userId, notes ?? null],
    );
    return { row, warnings };
  });

  const { row } = outcome;
  if (rule.to === 'authorized' || row.incident_status === 'authorized') {
    await applyIncidentEffects({
      employeeId: Number(row.employee_id),
      startDate: row.start_date,
      endDate: row.end_date,
      deductsVacation: row.deducts_vacation && !row.is_hourly,
    });
  }
  if (action === 'authorize') await notifyIncidentAuthorized(id);
  return { incident: await getIncidentDetail(id), previousStatus: row.incident_status, warnings: outcome.warnings };
};

// -----------------------------------------------------------------------------
// Justificar falta
// -----------------------------------------------------------------------------

export const justifyAbsence = async (
  employeeId: number,
  date: string,
  reason: string,
  files: readonly Express.Multer.File[],
  userId: string,
): Promise<CreatedIncident> => {
  const type = await pool.query<{ id: string; is_active: boolean }>(
    "SELECT id::text, is_active FROM attendance.incident_types WHERE code = 'justified_absence'",
  );
  const row = type.rows[0];
  if (!row || !row.is_active) return invalid('El tipo "Falta justificada" no esta disponible.');
  return createIncident(
    {
      employeeId,
      incidentTypeId: Number(row.id),
      startDate: date,
      endDate: date,
      reason,
      authorize: true,
      days: 1,
    },
    files,
    userId,
  );
};
