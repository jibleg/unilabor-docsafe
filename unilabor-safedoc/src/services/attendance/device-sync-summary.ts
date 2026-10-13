import type { Queryable } from '../../utils/transaction';

/**
 * El estado de sincronizacion vive POR RELOJ (attendance.employee_device_branches). El perfil conserva un
 * resumen para pantallas y validaciones:
 *  - device_sync_status: error si algun reloj fallo; pendiente si falta alta/baja en alguno; sincronizado si
 *    todos los relojes donde debe estar ya lo tienen; no aplica si no debe estar en ninguno.
 *  - face_sync_status: igual, sobre el envio de la fotografia (no aplica sin fotografia).
 */
export const refreshSyncSummary = async (db: Queryable, employeeIds: readonly number[]): Promise<void> => {
  if (employeeIds.length === 0) return;
  await db.query(
    `WITH rows AS (
       SELECT p.employee_id,
              r.sync_status, r.sync_error, r.synced_number, r.synced_at, r.face_sync_status, r.face_sync_error,
              (p.is_enabled AND e.is_active AND (e.branch_id = r.branch_id OR r.is_extra)) AS wanted
         FROM attendance.employee_profiles p
         JOIN public.employees e ON e.id = p.employee_id
         LEFT JOIN attendance.employee_device_branches r ON r.employee_id = p.employee_id
        WHERE p.employee_id = ANY($1::bigint[])
     ),
     agg AS (
       SELECT employee_id,
              COUNT(*) FILTER (WHERE wanted) AS wanted_count,
              COUNT(*) FILTER (WHERE wanted AND sync_status = 'error') AS wanted_errors,
              COUNT(*) FILTER (WHERE wanted AND sync_status <> 'synced') AS wanted_not_synced,
              COUNT(*) FILTER (WHERE NOT COALESCE(wanted, FALSE) AND synced_number IS NOT NULL) AS pending_removals,
              COUNT(*) FILTER (WHERE wanted AND face_sync_status = 'error') AS face_errors,
              COUNT(*) FILTER (WHERE wanted AND face_sync_status <> 'synced') AS face_not_synced,
              (ARRAY_AGG(sync_error) FILTER (WHERE wanted AND sync_status = 'error'))[1] AS sync_error,
              (ARRAY_AGG(face_sync_error) FILTER (WHERE wanted AND face_sync_status = 'error'))[1] AS face_error,
              MAX(synced_at) AS synced_at
         FROM rows GROUP BY employee_id
     )
     UPDATE attendance.employee_profiles p
        SET device_sync_status = CASE
              WHEN a.wanted_count = 0 AND a.pending_removals = 0 THEN 'not_applicable'
              WHEN a.wanted_errors > 0 THEN 'error'
              WHEN a.wanted_not_synced > 0 OR a.pending_removals > 0 THEN 'pending'
              ELSE 'synced' END,
            device_sync_error = CASE WHEN a.wanted_errors > 0 THEN a.sync_error ELSE NULL END,
            device_synced_at = a.synced_at,
            face_sync_status = CASE
              WHEN p.face_photo_path IS NULL THEN 'not_applicable'
              WHEN a.face_errors > 0 THEN 'error'
              WHEN a.wanted_count = 0 OR a.face_not_synced > 0 THEN 'pending'
              ELSE 'synced' END,
            face_sync_error = CASE WHEN a.face_errors > 0 THEN a.face_error ELSE NULL END
       FROM agg a
      WHERE p.employee_id = a.employee_id`,
    [employeeIds],
  );
};
