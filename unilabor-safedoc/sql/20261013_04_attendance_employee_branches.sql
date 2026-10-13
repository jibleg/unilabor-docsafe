-- =============================================================================
-- Control de Asistencias - Colaboradores en varias sucursales (ej. choferes).
--
-- El turno y el tablero siguen contando bajo la sucursal base (employees.branch_id); esta tabla dice en que
-- relojes mas debe estar dado de alta cada colaborador (is_extra = seleccionado a mano) y lleva el estado de
-- sincronizacion POR RELOJ (sucursal): numero con el que esta dado de alta, estado, error, reintentos y foto.
-- Aditivo e idempotente. Las columnas device_synced_* del perfil quedan sin uso (el estado vive aqui).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS attendance.employee_device_branches (
  employee_id        BIGINT NOT NULL REFERENCES attendance.employee_profiles(employee_id) ON DELETE CASCADE,
  branch_id          BIGINT NOT NULL REFERENCES public.helpdesk_asset_units(id),
  is_extra           BOOLEAN NOT NULL DEFAULT FALSE,
  sync_status        TEXT NOT NULL DEFAULT 'pending'
                     CHECK (sync_status IN ('not_applicable', 'pending', 'synced', 'error')),
  sync_error         TEXT NULL,
  synced_number      VARCHAR(20) NULL,
  synced_at          TIMESTAMPTZ NULL,
  sync_attempts      SMALLINT NOT NULL DEFAULT 0,
  face_sync_status   TEXT NOT NULL DEFAULT 'not_applicable'
                     CHECK (face_sync_status IN ('not_applicable', 'pending', 'synced', 'error')),
  face_sync_error    TEXT NULL,
  face_synced_at     TIMESTAMPTZ NULL,
  face_sync_attempts SMALLINT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, branch_id)
);

CREATE INDEX IF NOT EXISTS ix_attendance_employee_device_branches_branch
  ON attendance.employee_device_branches (branch_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_touch_updated_at'
       AND tgrelid = 'attendance.employee_device_branches'::regclass
  ) THEN
    CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON attendance.employee_device_branches
      FOR EACH ROW EXECUTE FUNCTION attendance.touch_updated_at();
  END IF;
END $$;

-- Quienes ya estan dados de alta en un reloj conservan ese estado (fila de su sucursal de alta).
INSERT INTO attendance.employee_device_branches
  (employee_id, branch_id, is_extra, sync_status, synced_number, synced_at,
   face_sync_status, face_sync_error, face_synced_at)
SELECT p.employee_id, p.device_synced_branch_id, FALSE, 'synced', p.device_synced_number, p.device_synced_at,
       CASE WHEN p.face_photo_path IS NULL THEN 'not_applicable' ELSE p.face_sync_status END,
       p.face_sync_error, p.face_synced_at
  FROM attendance.employee_profiles p
 WHERE p.device_synced_branch_id IS NOT NULL
   AND p.device_synced_number IS NOT NULL
ON CONFLICT (employee_id, branch_id) DO NOTHING;

COMMIT;
