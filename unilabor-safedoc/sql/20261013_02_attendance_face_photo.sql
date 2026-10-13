-- =============================================================================
-- Control de Asistencias - Fotografia de rostro del colaborador.
--
-- Guarda la ultima foto cargada desde DocSafe (archivo en disco, ruta relativa)
-- y su estado de envio al reloj. Agrega la orden 'upload_face' para el agente.
-- Aditivo e idempotente.
-- =============================================================================
BEGIN;

ALTER TABLE attendance.employee_profiles
  ADD COLUMN IF NOT EXISTS face_photo_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS face_photo_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS face_sync_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS face_sync_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS face_synced_at TIMESTAMPTZ NULL;

ALTER TABLE attendance.employee_profiles
  DROP CONSTRAINT IF EXISTS employee_profiles_face_sync_status_check;
ALTER TABLE attendance.employee_profiles
  ADD CONSTRAINT employee_profiles_face_sync_status_check
  CHECK (face_sync_status IN ('not_applicable', 'pending', 'synced', 'error'));

ALTER TABLE attendance.agent_orders
  DROP CONSTRAINT IF EXISTS agent_orders_order_type_check;
ALTER TABLE attendance.agent_orders
  ADD CONSTRAINT agent_orders_order_type_check
  CHECK (order_type IN ('sync_person', 'remove_person', 'enroll_fingerprint', 'enroll_face',
                        'upload_face', 'fetch_events', 'check_status'));

COMMIT;
