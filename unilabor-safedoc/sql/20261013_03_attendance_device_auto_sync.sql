-- =============================================================================
-- Control de Asistencias - Sincronizacion automatica con el reloj.
--
-- Registra QUE numero y en QUE sucursal esta realmente dado de alta cada colaborador
-- en el reloj (para poder darlo de baja o cambiarle el numero) y cuantos reintentos
-- automaticos lleva su alta / su foto. Aditivo e idempotente.
-- =============================================================================
BEGIN;

ALTER TABLE attendance.employee_profiles
  ADD COLUMN IF NOT EXISTS device_synced_number VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS device_synced_branch_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS device_sync_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS face_sync_attempts SMALLINT NOT NULL DEFAULT 0;

-- Quienes ya figuran como sincronizados estan en el reloj de su sucursal actual con su numero actual.
UPDATE attendance.employee_profiles p
   SET device_synced_number = p.device_employee_number,
       device_synced_branch_id = e.branch_id
  FROM public.employees e
 WHERE e.id = p.employee_id
   AND p.device_sync_status = 'synced'
   AND p.device_synced_number IS NULL
   AND p.device_employee_number IS NOT NULL;

COMMIT;
