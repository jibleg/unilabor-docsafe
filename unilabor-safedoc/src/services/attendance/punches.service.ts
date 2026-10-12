import { existsSync } from 'node:fs';
import path from 'node:path';
import pool from '../../config/db';
import { withTransaction } from '../../utils/transaction';
import { buildPaginatedResult, resolvePagination } from '../../utils/pagination';
import type {
  LinkEmployeeBody,
  ManualPunchBody,
  PunchesQuery,
  ReviewPunchBody,
} from '../../schemas/attendance/punches.schema';
import { registerAuditEvent } from '../audit.service';
import { conflict, invalid, notFound } from './attendance-errors';
import { getAttendanceSettings } from './attendance-settings.service';
import { recalculateRange, type RecalculationSummary } from './day-recalculation.service';
import { resolvePunchPhotoPath } from './attendance-photos';
import { addDays, dateToLocalMs, daysBetween } from './engine/time';
import { instantToLocalDate, localMsToInstant, todayInZone } from './timezone';

const MAX_LIST_RANGE_DAYS = 366;

const PUNCH_SELECT = `
  SELECT p.id, p.employee_id, e.employee_code, e.full_name, p.device_employee_number, p.source,
         p.terminal_id, t.name AS terminal_name, t.serial_number AS terminal_serial,
         p.branch_id, b.name AS branch_name, p.punch_type, p.punched_at, p.device_reported_at,
         p.verification_method, p.review_status, p.review_reason, p.reviewed_at,
         ru.full_name AS reviewed_by_name, p.manual_justification, gu.full_name AS registered_by_name,
         (p.photo_path IS NOT NULL) AS has_photo
    FROM attendance.punches p
    LEFT JOIN public.employees e ON e.id = p.employee_id
    LEFT JOIN attendance.terminals t ON t.id = p.terminal_id
    LEFT JOIN public.helpdesk_asset_units b ON b.id = p.branch_id
    LEFT JOIN public.users ru ON ru.id = p.reviewed_by_user_id
    LEFT JOIN public.users gu ON gu.id = p.registered_by_user_id`;

const iso = (value: unknown): string | null => (value instanceof Date ? value.toISOString() : null);

const mapPunch = (row: Record<string, any>) => ({
  id: Number(row.id),
  employee:
    row.employee_id === null
      ? null
      : { id: Number(row.employee_id), code: row.employee_code as string, full_name: row.full_name as string },
  device_employee_number: (row.device_employee_number as string | null) ?? null,
  source: row.source as string,
  terminal:
    row.terminal_id === null
      ? null
      : { id: Number(row.terminal_id), name: row.terminal_name as string, serial_number: row.terminal_serial as string },
  branch: row.branch_id === null ? null : { id: Number(row.branch_id), name: row.branch_name as string },
  punch_type: (row.punch_type as string | null) ?? null,
  punched_at: iso(row.punched_at),
  device_reported_at: iso(row.device_reported_at),
  verification_method: row.verification_method as string,
  review_status: row.review_status as string,
  review_reason: (row.review_reason as string | null) ?? null,
  reviewed_at: iso(row.reviewed_at),
  reviewed_by_name: (row.reviewed_by_name as string | null) ?? null,
  manual_justification: (row.manual_justification as string | null) ?? null,
  registered_by_name: (row.registered_by_name as string | null) ?? null,
  has_photo: Boolean(row.has_photo),
});

export type PunchView = ReturnType<typeof mapPunch>;

export const getPunchView = async (id: number): Promise<PunchView> => {
  const { rows } = await pool.query(`${PUNCH_SELECT} WHERE p.id = $1`, [id]);
  const row = rows[0];
  if (!row) return notFound('Checada no encontrada.');
  return mapPunch(row);
};

export const listPunches = async (query: PunchesQuery) => {
  const settings = await getAttendanceSettings();
  const to = query.to ?? todayInZone(settings.timezone);
  const from = query.from ?? addDays(to, -6);
  if (from > to) invalid('La fecha inicial no puede ser posterior a la final.');
  if (daysBetween(from, to) + 1 > MAX_LIST_RANGE_DAYS) {
    invalid(`El rango maximo es de ${MAX_LIST_RANGE_DAYS} dias.`);
  }
  const { page, limit, offset } = resolvePagination(query, { defaultLimit: 50, maxLimit: 200 });

  const values: unknown[] = [
    localMsToInstant(dateToLocalMs(from), settings.timezone),
    localMsToInstant(dateToLocalMs(addDays(to, 1)), settings.timezone),
  ];
  const where: string[] = ['p.punched_at >= $1', 'p.punched_at < $2'];
  const push = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };
  if (query.branch_id) where.push(`p.branch_id = ${push(query.branch_id)}`);
  if (query.employee_id) where.push(`p.employee_id = ${push(query.employee_id)}`);
  if (query.source) where.push(`p.source = ${push(query.source)}`);
  if (query.only_review) where.push(`p.review_status = 'pending'`);
  else if (query.review_status) where.push(`p.review_status = ${push(query.review_status)}`);
  if (query.search) {
    const term = push(`%${query.search}%`);
    where.push(`(e.full_name ILIKE ${term} OR e.employee_code ILIKE ${term} OR p.device_employee_number ILIKE ${term})`);
  }
  const whereSql = where.join(' AND ');

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `${PUNCH_SELECT}
        WHERE ${whereSql}
        ORDER BY p.punched_at DESC, p.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
         FROM attendance.punches p
         LEFT JOIN public.employees e ON e.id = p.employee_id
        WHERE ${whereSql}`,
      values,
    ),
  ]);
  return {
    ...buildPaginatedResult(rowsResult.rows.map(mapPunch), countResult.rows[0]?.total, page, limit),
    range: { from, to },
  };
};

/**
 * Recalcula los dias que puede afectar una checada: su fecha local y la
 * anterior (corte del dia / turnos nocturnos). Solo dias ya cerrados (hasta ayer).
 */
const recalculateForPunch = async (employeeId: number, punchedAt: Date): Promise<RecalculationSummary> => {
  const settings = await getAttendanceSettings();
  const localDate = instantToLocalDate(punchedAt, settings.timezone);
  const yesterday = addDays(todayInZone(settings.timezone), -1);
  const from = addDays(localDate, -1);
  const to = localDate < yesterday ? localDate : yesterday;
  if (from > to) return { employees: 0, days: 0 };
  return recalculateRange({ from, to, employeeIds: [employeeId] }, { settings });
};

export const createManualPunch = async (body: ManualPunchBody, userId: string) => {
  const settings = await getAttendanceSettings();
  const today = todayInZone(settings.timezone);
  if (body.work_date > today) invalid('No se pueden registrar checadas en fechas futuras.');

  const [hour, minute] = body.time.split(':').map(Number) as [number, number];
  const punchedAt = localMsToInstant(dateToLocalMs(body.work_date) + (hour * 60 + minute) * 60_000, settings.timezone);
  if (punchedAt.getTime() > Date.now()) invalid('No se pueden registrar checadas en el futuro.');

  const punchId = await withTransaction(async (client) => {
    const employee = await client.query<{ branch_id: number | null }>(
      'SELECT branch_id FROM public.employees WHERE id = $1 AND is_active',
      [body.employee_id],
    );
    if (!employee.rows[0]) return notFound('Colaborador no encontrado o inactivo.');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO attendance.punches
         (employee_id, source, branch_id, punch_type, punched_at, verification_method,
          manual_justification, registered_by_user_id)
       VALUES ($1, 'manual', $2, $3, $4, 'manual', $5, $6)
       RETURNING id`,
      [body.employee_id, employee.rows[0].branch_id, body.punch_type, punchedAt, body.justification, userId],
    );
    return Number(inserted.rows[0]?.id);
  });

  const recalculation = await recalculateForPunch(body.employee_id, punchedAt);
  await registerAuditEvent({
    user_id: userId,
    action: 'attendance_punch_manual_created',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_punch',
    entity_id: punchId,
    employee_id: body.employee_id,
    metadata: { work_date: body.work_date, time: body.time, punch_type: body.punch_type, justification: body.justification },
  }).catch(() => undefined);
  return { punch: await getPunchView(punchId), recalculation };
};

export const reviewPunch = async (id: number, body: ReviewPunchBody, userId: string) => {
  const target = await withTransaction(async (client) => {
    const current = await client.query<{ employee_id: number | null; punched_at: Date; review_status: string }>(
      'SELECT employee_id, punched_at, review_status FROM attendance.punches WHERE id = $1 FOR UPDATE',
      [id],
    );
    const row = current.rows[0];
    if (!row) return notFound('Checada no encontrada.');
    if (row.review_status !== 'pending') conflict('La checada no esta pendiente de revision.');
    await client.query(
      `UPDATE attendance.punches
          SET review_status = $2, review_reason = $3, reviewed_by_user_id = $4, reviewed_at = NOW()
        WHERE id = $1`,
      [id, body.decision === 'approve' ? 'approved' : 'rejected', body.reason || null, userId],
    );
    return row;
  });

  const recalculation = target.employee_id
    ? await recalculateForPunch(Number(target.employee_id), target.punched_at)
    : { employees: 0, days: 0 };
  await registerAuditEvent({
    user_id: userId,
    action: body.decision === 'approve' ? 'attendance_punch_approved' : 'attendance_punch_rejected',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_punch',
    entity_id: id,
    employee_id: target.employee_id === null ? null : Number(target.employee_id),
    metadata: { decision: body.decision, reason: body.reason ?? null },
  }).catch(() => undefined);
  return { punch: await getPunchView(id), recalculation };
};

export const linkPunchEmployee = async (id: number, body: LinkEmployeeBody, userId: string) => {
  const punchedAt = await withTransaction(async (client) => {
    const current = await client.query<{ employee_id: number | null; punched_at: Date }>(
      'SELECT employee_id, punched_at FROM attendance.punches WHERE id = $1 FOR UPDATE',
      [id],
    );
    const row = current.rows[0];
    if (!row) return notFound('Checada no encontrada.');
    if (row.employee_id !== null) conflict('La checada ya esta vinculada a un colaborador.');
    const employee = await client.query('SELECT 1 FROM public.employees WHERE id = $1', [body.employee_id]);
    if (employee.rowCount === 0) notFound('Colaborador no encontrado.');
    await client.query('UPDATE attendance.punches SET employee_id = $2 WHERE id = $1', [id, body.employee_id]);
    return row.punched_at;
  });

  const recalculation = await recalculateForPunch(body.employee_id, punchedAt);
  await registerAuditEvent({
    user_id: userId,
    action: 'attendance_punch_linked',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_punch',
    entity_id: id,
    employee_id: body.employee_id,
    metadata: { employee_id: body.employee_id },
  }).catch(() => undefined);
  return { punch: await getPunchView(id), recalculation };
};


const PHOTO_MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Archivo de la foto de una checada (ruta absoluta + tipo), o 404 si no tiene o no existe. */
export const getPunchPhotoFile = async (id: number): Promise<{ filePath: string; mime: string }> => {
  const { rows } = await pool.query('SELECT photo_path FROM attendance.punches WHERE id = $1', [id]);
  const photoPath = rows[0]?.photo_path as string | null | undefined;
  if (!photoPath) {
    return notFound('La checada no tiene foto.');
  }
  const filePath = resolvePunchPhotoPath(photoPath);
  if (!filePath || !existsSync(filePath)) {
    return notFound('La foto de la checada no esta disponible.');
  }
  const extension = path.extname(filePath).toLowerCase();
  return { filePath, mime: PHOTO_MIME[extension] ?? 'application/octet-stream' };
};
