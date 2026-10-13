import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pool from '../../config/db';
import { registerAuditEvent } from '../audit.service';
import { conflict, invalid, notFound } from './attendance-errors';
import { isDeviceNumber } from './device-number';
import { triggerEmployeeDeviceSync } from './device-reconcile.service';
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
  number: string | null;
  photo_path: string | null;
  on_device: boolean;
}

const loadTarget = async (employeeId: number): Promise<FacePhotoTarget> => {
  const { rows } = await pool.query<FacePhotoTarget>(
    `SELECT e.full_name, p.device_employee_number AS number, p.face_photo_path AS photo_path,
            EXISTS (SELECT 1 FROM attendance.employee_device_branches r
                     WHERE r.employee_id = e.id AND r.synced_number IS NOT NULL) AS on_device
       FROM public.employees e
       LEFT JOIN attendance.employee_profiles p ON p.employee_id = e.id
      WHERE e.id = $1`,
    [employeeId],
  );
  return rows[0] ?? notFound('Colaborador no encontrado.');
};

/** Cuantas ordenes de foto hay abiertas (en cola o en proceso) para el colaborador. */
const openFaceOrders = async (employeeId: number): Promise<number> => {
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM attendance.agent_orders
      WHERE employee_id = $1 AND order_type = 'upload_face' AND order_status IN ('pending', 'processing')`,
    [employeeId],
  );
  return Number(rows[0]?.total ?? 0);
};

/** Deja la foto pendiente en TODOS los relojes del colaborador y reinicia sus reintentos. */
const markFacePending = (employeeId: number) =>
  pool.query(
    `UPDATE attendance.employee_device_branches
        SET face_sync_status = 'pending', face_sync_error = NULL, face_sync_attempts = 0
      WHERE employee_id = $1`,
    [employeeId],
  );

/**
 * Reenvia la foto vigente a todos los relojes donde el colaborador ya esta dado de alta. El envio lo hace la
 * sincronizacion (la misma que el alta), reloj por reloj.
 */
export const queueFacePhotoOrder = async (employeeId: number, userId: string): Promise<{ queued: number }> => {
  const target = await loadTarget(employeeId);
  if (!target.photo_path) return invalid('El colaborador no tiene fotografía cargada.');
  if (!target.number) return invalid('El colaborador no tiene numero de empleado asignado.');
  if (!isDeviceNumber(target.number)) return invalid(`El numero de empleado ${target.number} no es valido para el reloj (solo digitos).`);
  if (!target.on_device) return invalid('Sincroniza primero al colaborador con el reloj de su sucursal.');
  if ((await openFaceOrders(employeeId)) > 0) return conflict('Ya hay un envío de la fotografía en curso.');

  await markFacePending(employeeId);
  await triggerEmployeeDeviceSync([employeeId], userId);
  const queued = await openFaceOrders(employeeId);
  await registerAuditEvent({
    user_id: userId,
    action: 'attendance_face_photo_queued',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_employee_profile',
    entity_id: employeeId,
    employee_id: employeeId,
    metadata: { queued },
  }).catch(() => undefined);
  return { queued };
};

/**
 * Guarda la foto (JPEG) y la deja pendiente en todos los relojes del colaborador. Si ya esta dado de alta se envia de
 * inmediato; si no, viaja junto con su alta al sincronizar.
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
       face_sync_status = 'pending', face_sync_error = NULL`,
    [employeeId, relative],
  );
  await markFacePending(employeeId);
  await registerAuditEvent({
    user_id: userId,
    action: 'attendance_face_photo_saved',
    module_code: 'ATTENDANCE',
    entity_type: 'attendance_employee_profile',
    entity_id: employeeId,
    employee_id: employeeId,
    metadata: { bytes: bytes.length },
  }).catch(() => undefined);

  await triggerEmployeeDeviceSync([employeeId], userId);
  return { queued: (await openFaceOrders(employeeId)) > 0 };
};

/** Ruta absoluta de la foto vigente del colaborador. */
export const getEmployeeFacePhotoFile = async (employeeId: number): Promise<string> => {
  const target = await loadTarget(employeeId);
  const full = target.photo_path ? resolveFacePhotoPath(target.photo_path) : null;
  if (!full) return notFound('El colaborador no tiene fotografía.');
  return full;
};
