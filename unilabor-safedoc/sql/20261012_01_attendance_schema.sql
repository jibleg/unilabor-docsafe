-- =============================================================================
-- Control de Asistencias - Schema dedicado `attendance`.
--
-- Todo el modulo vive en su propio schema de PostgreSQL (`attendance`) para
-- separarlo del resto de DocSafe (`public`). Referencia, sin duplicar, a:
--   public.employees            -> colaboradores (los mismos de RH)
--   public.helpdesk_asset_units -> sucursales (employees.branch_id)
--   public.users                -> usuarios que capturan / autorizan
--
-- Principios:
--   * Nombres semanticos en ingles, tablas en plural, sin prefijo (el schema ya
--     lo aporta): attendance.punches, attendance.daily_results, ...
--   * Booleanos is_/has_, fechas *_date, instantes *_at, duraciones *_minutes /
--     *_hours, FKs a usuarios *_by_user_id.
--   * `punches` es evidencia: inmutable (sin DELETE, sin UPDATE de datos crudos).
--   * Los adjuntos de incidencias tienen baja logica (deleted_at); nunca DELETE.
--   * 100 % aditivo e idempotente (IF NOT EXISTS / ON CONFLICT DO NOTHING).
--
-- Unico cambio fuera del schema: public.employees.hire_date (dato de RH que
-- tambien necesita el calculo de vacaciones).
-- =============================================================================

BEGIN;

-- Precondiciones: los tipos de las llaves foraneas externas -----------------
DO $$
DECLARE
  users_id_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO users_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'users'
    AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF users_id_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'attendance: se esperaba public.users.id uuid, se encontro %', users_id_type;
  END IF;
  IF to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'attendance: falta public.employees';
  END IF;
  IF to_regclass('public.helpdesk_asset_units') IS NULL THEN
    RAISE EXCEPTION 'attendance: falta public.helpdesk_asset_units (catalogo de sucursales)';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS attendance;
COMMENT ON SCHEMA attendance IS 'Control de Asistencias: horarios, checadas de relojes HikVision, resultados diarios, incidencias y vacaciones.';

-- Dato de RH necesario para vacaciones -------------------------------------
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hire_date DATE;
COMMENT ON COLUMN public.employees.hire_date IS 'Fecha de ingreso del colaborador (base de la antiguedad y de las vacaciones).';

-- Funcion comun: mantiene updated_at -----------------------------------------
CREATE OR REPLACE FUNCTION attendance.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. CONFIGURACION
-- =============================================================================

-- Solo se guardan los parametros que difieren del valor por defecto del codigo.
CREATE TABLE IF NOT EXISTS attendance.settings (
  setting_key         TEXT PRIMARY KEY,
  setting_value       JSONB NOT NULL,
  updated_by_user_id  UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historial de cambios de parametros: el motivo es obligatorio.
CREATE TABLE IF NOT EXISTS attendance.setting_changes (
  id                  BIGSERIAL PRIMARY KEY,
  setting_key         TEXT NOT NULL,
  previous_value      JSONB NULL,
  new_value           JSONB NOT NULL,
  change_reason       TEXT NOT NULL CHECK (char_length(btrim(change_reason)) >= 5),
  changed_by_user_id  UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_attendance_setting_changes_key
  ON attendance.setting_changes (setting_key, changed_at DESC);

-- Festivos: iguales para todas las sucursales.
CREATE TABLE IF NOT EXISTS attendance.holidays (
  id            BIGSERIAL PRIMARY KEY,
  holiday_date  DATE NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. COLABORADORES EN EL CONTROL DE ASISTENCIA
-- =============================================================================

-- Extiende public.employees sin alterarla: sucursal = employees.branch_id.
CREATE TABLE IF NOT EXISTS attendance.employee_profiles (
  employee_id                BIGINT PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  is_enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
  -- Numero con el que la persona se da de alta en el reloj (llave del evento).
  device_employee_number     VARCHAR(20) NULL
                             CHECK (device_employee_number IS NULL OR device_employee_number ~ '^[A-Za-z0-9-]{1,20}$'),
  device_sync_status         TEXT NOT NULL DEFAULT 'not_applicable'
                             CHECK (device_sync_status IN ('not_applicable', 'pending', 'synced', 'error')),
  device_sync_error          TEXT NULL,
  device_synced_at           TIMESTAMPTZ NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_employee_profiles_device_number
  ON attendance.employee_profiles (UPPER(device_employee_number))
  WHERE device_employee_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_attendance_employee_profiles_enabled
  ON attendance.employee_profiles (is_enabled) WHERE is_enabled;

-- =============================================================================
-- 3. HORARIOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance.shifts (
  id                 BIGSERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  start_time         TIME NOT NULL,
  end_time           TIME NOT NULL,
  -- Un turno cruza medianoche cuando termina a la misma hora o antes de iniciar.
  crosses_midnight   BOOLEAN GENERATED ALWAYS AS (end_time <= start_time) STORED,
  break_minutes      SMALLINT NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 480),
  -- fixed: evalua retardo y salida anticipada. flexible: solo cuenta horas.
  shift_type         TEXT NOT NULL DEFAULT 'fixed' CHECK (shift_type IN ('fixed', 'flexible')),
  color_hex          VARCHAR(7) NOT NULL DEFAULT '#034898' CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_shifts_name
  ON attendance.shifts (LOWER(name));

-- Programacion: shift_id NULL = dia de descanso. Un dia suelto es una
-- asignacion con repeats_weekly = FALSE y start_date = end_date.
CREATE TABLE IF NOT EXISTS attendance.shift_assignments (
  id                  BIGSERIAL PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id            BIGINT NULL REFERENCES attendance.shifts(id) ON DELETE CASCADE,
  is_rest_day         BOOLEAN GENERATED ALWAYS AS (shift_id IS NULL) STORED,
  start_date          DATE NOT NULL,
  end_date            DATE NULL,                      -- NULL = sin fin
  repeats_weekly      BOOLEAN NOT NULL DEFAULT TRUE,
  week_interval       SMALLINT NOT NULL DEFAULT 1 CHECK (week_interval BETWEEN 1 AND 8),
  weekdays            SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}'
                      CHECK (weekdays <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]),   -- ISO: 1 = lunes ... 7 = domingo
  notes               TEXT NULL,
  created_by_user_id  UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_attendance_shift_assignments_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT ck_attendance_shift_assignments_weekdays CHECK (NOT repeats_weekly OR cardinality(weekdays) > 0)
);
CREATE INDEX IF NOT EXISTS ix_attendance_shift_assignments_employee_dates
  ON attendance.shift_assignments (employee_id, start_date, end_date);

-- Bitacora de cambios de horario (quien, cuando, que).
CREATE TABLE IF NOT EXISTS attendance.schedule_changes (
  id                  BIGSERIAL PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  change_action       TEXT NOT NULL CHECK (change_action IN ('schedule', 'edit', 'remove', 'end', 'copy')),
  shift_name          TEXT NULL,                       -- foto del nombre; 'Descanso' si no hay turno
  description         TEXT NULL,
  start_date          DATE NULL,
  end_date            DATE NULL,
  repeats_weekly      BOOLEAN NULL,
  weekdays            SMALLINT[] NULL,
  changed_by_user_id  UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_attendance_schedule_changes_changed_at
  ON attendance.schedule_changes (changed_at DESC);
CREATE INDEX IF NOT EXISTS ix_attendance_schedule_changes_employee
  ON attendance.schedule_changes (employee_id, changed_at DESC);

-- =============================================================================
-- 4. RELOJES HIKVISION (un agente local por sucursal)
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance.agents (
  id                  BIGSERIAL PRIMARY KEY,
  branch_id           BIGINT NOT NULL UNIQUE REFERENCES public.helpdesk_asset_units(id) ON DELETE RESTRICT,
  name                TEXT NOT NULL,
  api_key_hash        TEXT NOT NULL UNIQUE,            -- SHA-256 de la clave; la clave en claro se muestra una sola vez
  api_key_prefix      VARCHAR(8) NOT NULL,
  software_version    TEXT NULL,
  host_name           TEXT NULL,
  operating_system    TEXT NULL,
  local_ip            TEXT NULL,
  last_heartbeat_at   TIMESTAMPTZ NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id  UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Se auto-registran con el primer latido del agente.
CREATE TABLE IF NOT EXISTS attendance.terminals (
  id                      BIGSERIAL PRIMARY KEY,
  agent_id                BIGINT NOT NULL REFERENCES attendance.agents(id) ON DELETE CASCADE,
  branch_id               BIGINT NOT NULL REFERENCES public.helpdesk_asset_units(id) ON DELETE RESTRICT,
  serial_number           TEXT NOT NULL UNIQUE,
  name                    TEXT NOT NULL,
  model                   TEXT NULL,
  firmware_version        TEXT NULL,
  local_ip                TEXT NULL,
  is_online               BOOLEAN NOT NULL DEFAULT FALSE,
  clock_drift_seconds     INTEGER NULL,
  enrolled_people_count   INTEGER NULL,
  last_event_at           TIMESTAMPTZ NULL,
  last_heartbeat_at       TIMESTAMPTZ NULL,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_attendance_terminals_branch ON attendance.terminals (branch_id);

-- Cola de trabajo que el agente consulta (alta/baja de personas, enrolamiento).
CREATE TABLE IF NOT EXISTS attendance.agent_orders (
  id                   BIGSERIAL PRIMARY KEY,
  agent_id             BIGINT NOT NULL REFERENCES attendance.agents(id) ON DELETE CASCADE,
  terminal_id          BIGINT NULL REFERENCES attendance.terminals(id) ON DELETE CASCADE,
  employee_id          BIGINT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  order_type           TEXT NOT NULL CHECK (order_type IN (
                         'sync_person', 'remove_person', 'enroll_fingerprint',
                         'enroll_face', 'fetch_events', 'check_status')),
  payload              JSONB NOT NULL DEFAULT '{}'::JSONB,
  order_status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (order_status IN ('pending', 'processing', 'done', 'error')),
  result               JSONB NULL,
  error_message        TEXT NULL,
  attempt_count        SMALLINT NOT NULL DEFAULT 0,
  created_by_user_id   UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_up_at         TIMESTAMPTZ NULL,
  finished_at          TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS ix_attendance_agent_orders_open
  ON attendance.agent_orders (agent_id, created_at)
  WHERE order_status IN ('pending', 'processing');

-- =============================================================================
-- 5. CHECADAS (evidencia inmutable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance.punches (
  id                       BIGSERIAL PRIMARY KEY,
  -- NULL cuando el numero del reloj no corresponde a ningun colaborador.
  employee_id              BIGINT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  device_employee_number   VARCHAR(20) NULL,
  source                   TEXT NOT NULL CHECK (source IN ('terminal', 'manual')),
  terminal_id              BIGINT NULL REFERENCES attendance.terminals(id) ON DELETE SET NULL,
  branch_id                BIGINT NULL REFERENCES public.helpdesk_asset_units(id) ON DELETE SET NULL,
  punch_type               TEXT NULL CHECK (punch_type IN ('in', 'out', 'break_start', 'break_end')),
  punched_at               TIMESTAMPTZ NOT NULL,          -- instante efectivo usado en el calculo
  device_reported_at       TIMESTAMPTZ NULL,              -- hora que reporto el reloj
  received_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_method      TEXT NOT NULL DEFAULT 'other'
                           CHECK (verification_method IN ('face', 'fingerprint', 'card', 'pin', 'manual', 'other')),
  device_event_serial      TEXT NULL,                     -- idempotencia por terminal
  photo_path               TEXT NULL,
  review_status            TEXT NOT NULL DEFAULT 'none'
                           CHECK (review_status IN ('none', 'pending', 'approved', 'rejected')),
  review_reason            TEXT NULL,
  reviewed_by_user_id      UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at              TIMESTAMPTZ NULL,
  manual_justification     TEXT NULL,
  registered_by_user_id    UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_attendance_punches_manual_requires_justification CHECK (
    source <> 'manual'
    OR (char_length(btrim(COALESCE(manual_justification, ''))) >= 5 AND registered_by_user_id IS NOT NULL))
);
-- La terminal se exige en la ingesta; si luego se elimina la terminal, la checada
-- conserva su dato crudo con terminal_id NULL (ON DELETE SET NULL), por eso no hay CHECK.
ALTER TABLE attendance.punches DROP CONSTRAINT IF EXISTS ck_attendance_punches_terminal_requires_terminal;
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_punches_terminal_event
  ON attendance.punches (terminal_id, device_event_serial)
  WHERE terminal_id IS NOT NULL AND device_event_serial IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_attendance_punches_employee_time
  ON attendance.punches (employee_id, punched_at DESC);
CREATE INDEX IF NOT EXISTS ix_attendance_punches_time ON attendance.punches (punched_at DESC);
CREATE INDEX IF NOT EXISTS ix_attendance_punches_pending_review
  ON attendance.punches (punched_at DESC) WHERE review_status = 'pending';

-- Inmutabilidad: nunca se borra; solo cambian los campos de revision y, una
-- vez, el vinculo con el colaborador cuando el numero antes era desconocido.
-- Las llaves terminal_id, branch_id y registered_by_user_id pueden pasar a NULL
-- (efecto de ON DELETE SET NULL al eliminar una terminal, sucursal o usuario):
-- el dato crudo (hora, tipo, metodo, serie del evento) nunca cambia.
CREATE OR REPLACE FUNCTION attendance.guard_punch_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'attendance.punches es evidencia inmutable: no se puede borrar (id=%)', OLD.id;
  END IF;

  IF (NEW.id, NEW.device_employee_number, NEW.source, NEW.punch_type,
      NEW.punched_at, NEW.device_reported_at, NEW.received_at, NEW.verification_method,
      NEW.device_event_serial, NEW.photo_path, NEW.manual_justification, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.device_employee_number, OLD.source, OLD.punch_type,
      OLD.punched_at, OLD.device_reported_at, OLD.received_at, OLD.verification_method,
      OLD.device_event_serial, OLD.photo_path, OLD.manual_justification, OLD.created_at)
  THEN
    RAISE EXCEPTION 'attendance.punches es evidencia inmutable: solo se pueden actualizar los campos de revision (id=%)', OLD.id;
  END IF;

  IF (NEW.terminal_id IS DISTINCT FROM OLD.terminal_id AND NEW.terminal_id IS NOT NULL)
     OR (NEW.branch_id IS DISTINCT FROM OLD.branch_id AND NEW.branch_id IS NOT NULL)
     OR (NEW.registered_by_user_id IS DISTINCT FROM OLD.registered_by_user_id AND NEW.registered_by_user_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'attendance.punches es evidencia inmutable: terminal, sucursal y registrante solo pueden quedar en NULL (id=%)', OLD.id;
  END IF;

  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id AND OLD.employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'attendance.punches: una checada ya vinculada no puede cambiar de colaborador (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_punches_immutable_update ON attendance.punches;
CREATE TRIGGER trg_attendance_punches_immutable_update
  BEFORE UPDATE ON attendance.punches
  FOR EACH ROW EXECUTE FUNCTION attendance.guard_punch_immutability();

DROP TRIGGER IF EXISTS trg_attendance_punches_immutable_delete ON attendance.punches;
CREATE TRIGGER trg_attendance_punches_immutable_delete
  BEFORE DELETE ON attendance.punches
  FOR EACH ROW EXECUTE FUNCTION attendance.guard_punch_immutability();

-- =============================================================================
-- 6. INCIDENCIAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance.incident_types (
  id                      BIGSERIAL PRIMARY KEY,
  code                    VARCHAR(30) NOT NULL UNIQUE,
  name                    TEXT NOT NULL,
  requires_attachment     BOOLEAN NOT NULL DEFAULT TRUE,
  is_paid                 BOOLEAN NOT NULL DEFAULT TRUE,
  deducts_vacation        BOOLEAN NOT NULL DEFAULT FALSE,
  counts_as_attendance    BOOLEAN NOT NULL DEFAULT TRUE,
  is_hourly               BOOLEAN NOT NULL DEFAULT FALSE,   -- horas extra: suma horas, no sustituye el dia
  is_system               BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order              SMALLINT NOT NULL DEFAULT 0,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO attendance.incident_types
  (code, name, requires_attachment, is_paid, deducts_vacation, counts_as_attendance, is_hourly, is_system, sort_order)
VALUES
  ('vacation',          'Vacaciones',          TRUE,  TRUE,  TRUE,  TRUE,  FALSE, TRUE, 10),
  ('medical_leave',     'Incapacidad',         TRUE,  TRUE,  FALSE, TRUE,  FALSE, TRUE, 20),
  ('paid_permission',   'Permiso con goce',    TRUE,  TRUE,  FALSE, TRUE,  FALSE, TRUE, 30),
  ('unpaid_permission', 'Permiso sin goce',    TRUE,  FALSE, FALSE, FALSE, FALSE, TRUE, 40),
  ('business_trip',     'Comision',            TRUE,  TRUE,  FALSE, TRUE,  FALSE, TRUE, 50),
  ('justified_absence', 'Falta justificada',   TRUE,  TRUE,  FALSE, TRUE,  FALSE, TRUE, 60),
  ('holiday_worked',    'Festivo trabajado',   FALSE, TRUE,  FALSE, TRUE,  FALSE, TRUE, 70),
  ('overtime',          'Horas extra',         FALSE, TRUE,  FALSE, TRUE,  TRUE,  TRUE, 80)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS attendance.incidents (
  id                      BIGSERIAL PRIMARY KEY,
  employee_id             BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  incident_type_id        BIGINT NOT NULL REFERENCES attendance.incident_types(id),
  start_date              DATE NOT NULL,
  end_date                DATE NOT NULL,
  hours                   NUMERIC(5,2) NULL CHECK (hours IS NULL OR (hours > 0 AND hours <= 24)),
  days                    NUMERIC(5,1) NULL,                -- se fija al capturar, segun la programacion de ese momento
  reason                  TEXT NULL,
  imss_folio              VARCHAR(40) NULL,
  incident_status         TEXT NOT NULL DEFAULT 'captured'
                          CHECK (incident_status IN ('captured', 'authorized', 'rejected', 'cancelled')),
  captured_by_user_id     UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  authorized_by_user_id   UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  authorized_at           TIMESTAMPTZ NULL,
  authorization_notes     TEXT NULL,
  notified_at             TIMESTAMPTZ NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_attendance_incidents_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ix_attendance_incidents_employee_dates
  ON attendance.incidents (employee_id, start_date, end_date)
  WHERE incident_status <> 'cancelled';
CREATE INDEX IF NOT EXISTS ix_attendance_incidents_status
  ON attendance.incidents (incident_status, start_date DESC);

-- Evidencia en disco; baja logica, nunca DELETE fisico.
CREATE TABLE IF NOT EXISTS attendance.incident_attachments (
  id                    BIGSERIAL PRIMARY KEY,
  incident_id           BIGINT NOT NULL REFERENCES attendance.incidents(id) ON DELETE RESTRICT,
  file_path             TEXT NOT NULL,
  original_file_name    TEXT NOT NULL,
  mime_type             TEXT NOT NULL,
  size_bytes            INTEGER NOT NULL CHECK (size_bytes > 0),
  uploaded_by_user_id   UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ NULL,
  deleted_by_user_id    UUID NULL REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_attendance_incident_attachments_incident
  ON attendance.incident_attachments (incident_id) WHERE deleted_at IS NULL;

-- =============================================================================
-- 7. RESULTADO DIARIO (calculado, recalculable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance.daily_results (
  id                              BIGSERIAL PRIMARY KEY,
  employee_id                     BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date                       DATE NOT NULL,
  branch_id                       BIGINT NULL REFERENCES public.helpdesk_asset_units(id) ON DELETE SET NULL,  -- sucursal vigente ese dia
  expected_start_time             TIME NULL,
  expected_end_time               TIME NULL,
  clock_in_at                     TIMESTAMPTZ NULL,
  clock_out_at                    TIMESTAMPTZ NULL,
  day_result                      TEXT NOT NULL CHECK (day_result IN (
                                    'present', 'late', 'absent', 'partial_absence', 'early_departure',
                                    'incident', 'rest_day', 'holiday', 'no_schedule')),
  late_minutes                    SMALLINT NOT NULL DEFAULT 0,
  early_departure_minutes         SMALLINT NOT NULL DEFAULT 0,
  worked_hours                    NUMERIC(5,2) NULL,
  overtime_hours                  NUMERIC(5,2) NOT NULL DEFAULT 0,
  incident_id                     BIGINT NULL REFERENCES attendance.incidents(id) ON DELETE SET NULL,
  is_late_accumulation_absence    BOOLEAN NOT NULL DEFAULT FALSE,   -- el retardo que completa N retardos del periodo
  has_pending_review              BOOLEAN NOT NULL DEFAULT FALSE,
  calculation_detail              JSONB NOT NULL DEFAULT '{}'::JSONB,
  segments                        JSONB NOT NULL DEFAULT '[]'::JSONB,
  calculated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_attendance_daily_results_employee_date UNIQUE (employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS ix_attendance_daily_results_date_result
  ON attendance.daily_results (work_date DESC, day_result);
CREATE INDEX IF NOT EXISTS ix_attendance_daily_results_branch_date
  ON attendance.daily_results (branch_id, work_date DESC);

-- =============================================================================
-- 8. VACACIONES
-- =============================================================================

-- Tabla por antiguedad (LFT 2023, editable): la fila con mayor from_seniority_year <= antiguedad.
CREATE TABLE IF NOT EXISTS attendance.vacation_policy (
  from_seniority_year  SMALLINT PRIMARY KEY CHECK (from_seniority_year >= 1),
  vacation_days        NUMERIC(4,1) NOT NULL CHECK (vacation_days BETWEEN 0 AND 60),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO attendance.vacation_policy (from_seniority_year, vacation_days)
SELECT v.from_seniority_year, v.vacation_days
FROM (VALUES
  (1, 12), (2, 14), (3, 16), (4, 18), (5, 20), (6, 22), (11, 24), (16, 26),
  (21, 28), (26, 30), (31, 32), (36, 34), (41, 36), (46, 38), (51, 40)
) AS v(from_seniority_year, vacation_days)
WHERE NOT EXISTS (SELECT 1 FROM attendance.vacation_policy);

CREATE TABLE IF NOT EXISTS attendance.vacation_periods (
  id                BIGSERIAL PRIMARY KEY,
  employee_id       BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  seniority_year    SMALLINT NOT NULL CHECK (seniority_year >= 1),
  period_start_date DATE NOT NULL,
  period_due_date   DATE NOT NULL,
  days_entitled     NUMERIC(4,1) NOT NULL,
  days_adjustment   NUMERIC(4,1) NOT NULL DEFAULT 0,
  adjustment_reason TEXT NULL,
  days_taken        NUMERIC(4,1) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_attendance_vacation_periods_employee_year UNIQUE (employee_id, seniority_year)
);

-- =============================================================================
-- updated_at automatico
-- =============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'holidays', 'employee_profiles', 'shifts', 'shift_assignments', 'agents', 'terminals',
    'incident_types', 'incidents', 'vacation_policy', 'vacation_periods'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON attendance.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON attendance.%I
         FOR EACH ROW EXECUTE FUNCTION attendance.touch_updated_at()', t);
  END LOOP;
END $$;

COMMIT;
