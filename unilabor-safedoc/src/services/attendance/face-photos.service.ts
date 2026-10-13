import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pool from '../../config/db';
import { registerAuditEvent } from '../audit.service';
import { conflict, invalid, notFound } from './attendance-errors';
import { isDeviceNumber } from './device-number';
import { insertOrder, auditOrders } from './agent-orders.service';
import { FACE_PHOTO_MAX_BYTES } from '../../middlewares/attendance-upload.middleware';
import { getFacePhotosDir, resolveFacePhotoPath } from './face-photo-files';

/**
 * Fotografia de rostro del colaborador (cargada y recortada en DocSafe) y su envio al reloj.
 * face_photo_path se guarda RELATIVO al directorio base ('<employee_id>/<uuid>.jpg'); las versiones
 * anteriores no se borran. El reloj solo acepta JPEG de tamano contenido, por eso se exige JPEG.
 */

export { FACE_PHOTO_MAX_BYTES } from '../../middlewares/attendance-upload.middleware';

export const isJpeg = (bytes: Buffer): boolean =>
  bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

interface FacePhotoTarget {
  full_name: string;
  branch_id: number | null;
  number: string | null;
  sync_status: string | null;
  photo_path: string | null;
}

const loadTarget = async (employeeId: number): Promise<FacePhotoTarget> => {
  const { rows } = await pool.query<FacePhotoTarget>(
    `SELECT e.full_name, e.branch_id::int AS branch_id, p.device_employee_number AS number,
            p.device_sync_status AS sync_status, p.face_photo_path AS photo_path
       FROM public.employees e
       LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE e.id = $1`,
    [employeeId],
  );
  return rows[0] ?? notFound('Colaborador no encontrado.');
};

/** Encola el envio de la foto al reloj de la sucursal del colaborador (debe estar sincronizado). */
export const queueFacePhotoOrder = async (employeeId: number, userId: string): Promise<{ order_id: number }> => {
  const target = await loadTarget(employeeId);
  if (!target.photo_path) return invalid('El colaborador no tiene fotografía cargada.');
  if (!target.branch_id) return invalid('El colaborador no tiene sucursal asignada.');
  if (!target.number) return invalid('El colaborador no tiene numero de empleado asignado.');
  if (!isDeviceNumber(target.number)) return invalid(`El numero de empleado ${target.number} no es valido para el reloj (solo digitos).`);
  if (target.sync_status !== 'synced') return invalid('Sincroniza primero al colaborador con el reloj de su sucursal.');

  const agent = await pool.query<{ id: string; is_active: boolean; terminal_id: string | null }>(
    `SELECT a.id, a.is_active,
            (SELECT t.id FROM attendance.terminals t WHERE t.agent_id = a.id AND t.is_active = TRUE ORDER BY t.id LIMIT 1) AS terminal_id
       FROM attendance.agents a WHERE a.branch_id = $1`,
    [target.branch_id],
  );
  const found = agent.rows[0];
  if (!found || !found.is_active) return invalid('La sucursal del colaborador no tiene un agente activo.');
  if (!found.terminal_id) return invalid('La sucursal no tiene un reloj activo registrado. Espera el primer latido del agente.');

  const open = await pool.query(
    `SELECT 1 FROM attendance.agent_orders
      WHERE agent_id = $1 AND employee_id = $2 AND order_type = 'upload_face' AND order_status IN ('pending', 'processing') LIMIT 1`,
    [found.id, employeeId],
  );
  if ((open.rowCount ?? 0) > 0) return conflict('Ya hay un envío de la fotografía en curso.');

  const orderId = await insertOrder(pool, {
    agentId: Number(found.id),
    terminalId: Number(found.terminal_id),
    employeeId,
    type: 'upload_face',
    payload: { employeeNo: target.number, name: target.full_name },
    userId,
  });
  await pool.query(
    `UPDATE attendance.employee_profiles SET face_sync_status = 'pending', face_sync_error = NULL WHERE employee_id = $1`,
    [employeeId],
  );
  await auditOrders(userId, 'attendance_face_photo_queued', Number(found.id), { employee_id: employeeId });
  return { order_id: orderId };
};

/**
 * Guarda la foto (JPEG) y la deja pendiente de envio. Si el colaborador ya esta sincronizado con el reloj,
 * encola el envio de inmediato; si no, viaja junto con su alta al sincronizar.
 */
export const saveEmployeeFacePhoto = async (
  employeeId: number,
  bytes: Buffer,
  userId: string,
): Promise<{ queued: boolean }> => {
  if (!isJpeg(bytes)) invalid('La fotografía debe ser una imagen JPEG.');
  if (bytes.length > FACE_PHOTO_MAX_BYTES) invalid('La fotografía excede 400 KB; reduce su tamaño.');
  await loadTarget(employeeId);

  const relative = `${employeeId}/${randomUUID()}.jpg`;
  const full = path.join(getFacePhotosDir(), relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: 'wx' });

  await pool.query(
    `INSERT INTO attendance.employee_profiles (employee_id, face_photo_path, face_photo_updated_at, face_sync_status)
     VALUES ($1, $2, NOW(), 'pending')
     ON CONFLICT (employee_id) DO UPDATE SET
       face_photo_path = EXCLUDED.face_photo_path, face_photo_updated_at = NOW(),
       face_sync_status = 'pending', face_sync_error = NULL, face_sync_attempts = 0`,
    [employeeId, relative],
  );
  await registerAuditEvent({
    user_id: userId,
    action: 'attendance_face_photo_saved',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_employee_profile',
    entity_id: employeeId,
    employee_id: employeeId,
    metadata: { bytes: bytes.length },
  }).catch(() => undefined);

  const target = await loadTarget(employeeId);
  if (target.sync_status === 'synced') {
    try {
      await queueFacePhotoOrder(employeeId, userId);
      return { queued: true };
    } catch {
      return { queued: false };
    }
  }
  return { queued: false };
};

/** Ruta absoluta de la foto vigente del colaborador. */
export const getEmployeeFacePhotoFile = async (employeeId: number): Promise<string> => {
  const target = await loadTarget(employeeId);
  const full = target.photo_path ? resolveFacePhotoPath(target.photo_path) : null;
  if (!full) return notFound('El colaborador no tiene fotografía.');
  return full;
};
