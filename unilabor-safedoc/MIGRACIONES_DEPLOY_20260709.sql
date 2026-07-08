-- ============================================================================
-- MIGRACION MANUAL PARA pgAdmin — Deploy 2026-07-09
-- Modulo "Gestion de Activos" (antes Help Desk): entrega-recepcion, movimientos,
-- estructura organizacional, calibracion, calendario provisto, recordatorios y
-- rename del nombre visible del modulo.
-- ============================================================================
-- Replica lo que hace el runner (node dist/scripts/migrate.js migrate):
--   cada migracion versionada se aplica y se registra en public.schema_migrations
--   con SU checksum SHA-256 (el mismo que calcula el runner), de modo que un
--   migrate/migrate:status posterior las vea YA aplicadas.
-- Todas son ADITIVAS e IDEMPOTENTES (IF NOT EXISTS / ON CONFLICT DO NOTHING):
--   correr el script dos veces no rompe nada.
-- Orden de aplicacion (respetar): el mismo de abajo.
-- ============================================================================

-- Tabla de control (en prod ya existe; se crea por seguridad).
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- [1/8] 20260707_01_helpdesk_org_structure.sql
-- SHA-256: a2102e3ade5cfe5bda0edd8d25254c7aaee9e593567830464a71882f15929940
-- ----------------------------------------------------------------------------
-- Estructura organizacional del inventario Help Desk (integridad referencial).
--
-- Modela dos relaciones muchos-a-muchos sobre los catalogos planos existentes
-- (helpdesk_asset_units, helpdesk_asset_areas) sin alterarlos:
--   * Unidad <-> Area: una unidad agrupa varias areas y un area puede pertenecer
--     a varias unidades (helpdesk_unit_areas).
--   * Area <-> Responsable: un area tiene uno o mas usuarios responsables y un
--     usuario puede ser responsable de varias areas (helpdesk_area_responsibles).
-- El responsable es un usuario del sistema (public.users, id UUID), no un empleado.
--
-- Aditivo y no destructivo: no toca datos ni columnas existentes. La jerarquia se
-- alimenta desde la nueva UI de estructura; las areas/activos actuales siguen
-- funcionando aunque aun no tengan relaciones cargadas.
BEGIN;

-- Unidad <-> Area (M:N)
CREATE TABLE IF NOT EXISTS public.helpdesk_unit_areas (
  unit_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_units(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_areas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (unit_id, area_id)
);
CREATE INDEX IF NOT EXISTS ix_helpdesk_unit_areas_area ON public.helpdesk_unit_areas (area_id);

-- Area <-> Responsable (users) (M:N)
CREATE TABLE IF NOT EXISTS public.helpdesk_area_responsibles (
  area_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_areas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (area_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_helpdesk_area_responsibles_user ON public.helpdesk_area_responsibles (user_id);

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260707_01_helpdesk_org_structure.sql', 'a2102e3ade5cfe5bda0edd8d25254c7aaee9e593567830464a71882f15929940')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [2/8] 20260708_01_helpdesk_handovers.sql
-- SHA-256: 7c68af5f0271831a5c91211cdcb4fdaab1fbd406c14e43bec837cb33c409110c
-- ----------------------------------------------------------------------------
-- Acta de entrega-recepcion de activos (ISO 15189:2022, trazabilidad de movimientos).
--
-- Primera evidencia de movimiento del inventario: la entrega formal de los activos
-- de una unidad/area a su responsable. El operador/RH coteja en sitio con el
-- responsable, ambos firman (firma electronica trazada) y se genera un acta PDF
-- con fecha/hora. Soporta multiples entregas parciales: un activo entregado (con
-- item en un acta FIRMADA) no vuelve a estar disponible para otra acta salvo que
-- la anterior se anule (VOID). La invariante de "un activo en una sola acta
-- firmada" se refuerza en el servicio (signHandover) bajo transaccion + FOR UPDATE.
--
-- Aditivo y no destructivo: solo agrega tablas/seeds nuevos; no toca datos ni
-- columnas existentes.
BEGIN;

-- Secuencia atomica para el folio del acta (mismo patron que 20260620_01).
CREATE SEQUENCE IF NOT EXISTS public.helpdesk_handover_code_seq;

-- --- Acta (cabecera) ---
CREATE TABLE IF NOT EXISTS public.helpdesk_handovers (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT NOT NULL,
  unit_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_units(id),
  area_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_areas(id),
  -- Quien entrega (operador/RH/admin): usuario del sistema + nombre para la firma.
  delivered_by_user_id UUID NULL REFERENCES public.users(id),
  delivered_by_name TEXT NOT NULL,
  -- Quien recibe (responsable del area): usuario del sistema + nombre para la firma.
  received_by_user_id UUID NULL REFERENCES public.users(id),
  received_by_name TEXT NOT NULL,
  handover_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  void_reason TEXT NULL,
  notes TEXT NULL,
  -- Firmas electronicas trazadas (PNG en disco) y acta PDF generada.
  deliverer_signature_path TEXT NULL,
  receiver_signature_path TEXT NULL,
  document_path TEXT NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_helpdesk_handovers_status CHECK (status IN ('DRAFT', 'SIGNED', 'VOID'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_handovers_folio
  ON public.helpdesk_handovers (folio);
CREATE INDEX IF NOT EXISTS ix_helpdesk_handovers_area
  ON public.helpdesk_handovers (area_id);
CREATE INDEX IF NOT EXISTS ix_helpdesk_handovers_status
  ON public.helpdesk_handovers (status);
CREATE INDEX IF NOT EXISTS ix_helpdesk_handovers_received_by
  ON public.helpdesk_handovers (received_by_user_id);

-- --- Items del acta (activos entregados) ---
CREATE TABLE IF NOT EXISTS public.helpdesk_handover_items (
  handover_id BIGINT NOT NULL REFERENCES public.helpdesk_handovers(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id) ON DELETE CASCADE,
  receipt_condition_id BIGINT NULL REFERENCES public.helpdesk_receipt_conditions(id),
  observations TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (handover_id, asset_id)
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_handover_items_asset
  ON public.helpdesk_handover_items (asset_id);

-- --- Seeds: tipo de evento de ciclo de vida + tipo de documento ---
-- Cada activo entregado recibe un evento HANDOVER en su expediente, con el acta
-- PDF (kind HANDOVER_ACT) ligada como evidencia.
INSERT INTO public.helpdesk_lifecycle_event_types (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('HANDOVER', 'Entrega-Recepcion', 'Entrega-recepcion del equipo a su responsable (acta firmada).', 15)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_lifecycle_event_types existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('HANDOVER_ACT', 'Acta de entrega-recepcion', 'Acta de entrega-recepcion de activos con firmas.', 15)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_document_kinds existing WHERE UPPER(existing.code) = source.code
);

-- Alinear la secuencia del folio con el maximo id existente.
SELECT setval(
  'public.helpdesk_handover_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_handovers), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_handovers), 0) > 0
);

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260708_01_helpdesk_handovers.sql', '7c68af5f0271831a5c91211cdcb4fdaab1fbd406c14e43bec837cb33c409110c')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [3/8] 20260708_02_helpdesk_asset_movements.sql
-- SHA-256: 2de00e9bb9ff0276d928f84bee47a9df18c878dfa75b0cdb4e9f64f55b040c7d
-- ----------------------------------------------------------------------------
-- Movimientos del activo (ISO 15189:2022, trazabilidad de cambios).
--
-- Registra los cambios de unidad / area / categoria / responsable de un activo.
-- Cuando cambia unidad, area o categoria, el codigo de inventario se regenera
-- (UNIDAD-AREA-CATEGORIA-NNN, consecutivo por area) y se puede reimprimir la
-- etiqueta. Cada movimiento deja evidencia con firma electronica de los
-- involucrados (quien ejecuta + responsable destino) y un evento MOVEMENT en el
-- expediente del activo. Sin PDF (la evidencia son las firmas + el evento).
--
-- Aditivo y no destructivo.
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.helpdesk_movement_code_seq;

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_movements (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT NOT NULL,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id) ON DELETE CASCADE,
  movement_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NULL,
  -- Estado antes/después (NULL en el lado que no cambia).
  from_unit_id BIGINT NULL REFERENCES public.helpdesk_asset_units(id),
  to_unit_id BIGINT NULL REFERENCES public.helpdesk_asset_units(id),
  from_area_id BIGINT NULL REFERENCES public.helpdesk_asset_areas(id),
  to_area_id BIGINT NULL REFERENCES public.helpdesk_asset_areas(id),
  from_category_id BIGINT NULL REFERENCES public.helpdesk_asset_categories(id),
  to_category_id BIGINT NULL REFERENCES public.helpdesk_asset_categories(id),
  from_asset_code TEXT NULL,
  to_asset_code TEXT NULL,
  code_changed BOOLEAN NOT NULL DEFAULT FALSE,
  -- Involucrados + firma electronica trazada (PNG en disco).
  performed_by_user_id UUID NULL REFERENCES public.users(id),
  performed_by_name TEXT NOT NULL,
  performed_by_signature_path TEXT NULL,
  responsible_user_id UUID NULL REFERENCES public.users(id),
  responsible_name TEXT NOT NULL,
  responsible_signature_path TEXT NULL,
  -- Evento de ciclo de vida generado (trazabilidad en el expediente).
  lifecycle_event_id BIGINT NULL REFERENCES public.helpdesk_asset_lifecycle_events(id) ON DELETE SET NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_asset_movements_folio
  ON public.helpdesk_asset_movements (folio);
CREATE INDEX IF NOT EXISTS ix_helpdesk_asset_movements_asset
  ON public.helpdesk_asset_movements (asset_id, movement_at DESC);

-- Tipo de evento de ciclo de vida para el movimiento/reasignacion.
INSERT INTO public.helpdesk_lifecycle_event_types (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('MOVEMENT', 'Movimiento / Reasignacion', 'Cambio de unidad, area, categoria o responsable del activo.', 65)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_lifecycle_event_types existing WHERE UPPER(existing.code) = source.code
);

SELECT setval(
  'public.helpdesk_movement_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_asset_movements), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_asset_movements), 0) > 0
);

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260708_02_helpdesk_asset_movements.sql', '2de00e9bb9ff0276d928f84bee47a9df18c878dfa75b0cdb4e9f64f55b040c7d')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [4/8] 20260709_01_helpdesk_calibration.sql
-- SHA-256: ff92ecc917b6a273180db5181061921a0e0db2905030403b3101a681a5aeaa39
-- ----------------------------------------------------------------------------
-- Modulo de Calibracion (ISO 15189:2022, control metrologico 6.5).
-- Motor espejo del de mantenimiento (planes -> ordenes programadas con
-- recurrencia al cerrar), pero orientado a certificados en vez de checklist:
-- la orden captura numero de certificado y proxima fecha de calibracion.
-- Reusa el catalogo generico public.helpdesk_maintenance_frequencies
-- (interval_months) para no duplicar frecuencias.
-- schedule_mode admite FREQUENCY (deriva la proxima fecha del intervalo) o
-- CALENDAR (fechas explicitas provistas por el proveedor/responsable).
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.helpdesk_calibration_plan_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.helpdesk_calibration_order_code_seq;

CREATE TABLE IF NOT EXISTS public.helpdesk_calibration_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_code TEXT NOT NULL,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id),
  frequency_id BIGINT NULL REFERENCES public.helpdesk_maintenance_frequencies(id),
  schedule_mode TEXT NOT NULL DEFAULT 'FREQUENCY',
  responsible_employee_id BIGINT NULL REFERENCES public.employees(id),
  provider_name TEXT NULL,
  standard_ref TEXT NULL,
  quality_document_id UUID NULL REFERENCES public.documents(id),
  title TEXT NOT NULL,
  description TEXT NULL,
  starts_on DATE NOT NULL,
  next_due_on DATE NOT NULL,
  tolerance_before_days INTEGER NOT NULL DEFAULT 0,
  tolerance_after_days INTEGER NOT NULL DEFAULT 0,
  certificate_required BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_calibration_plans_plan_code
  ON public.helpdesk_calibration_plans (UPPER(plan_code))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS ix_helpdesk_calibration_plans_asset_id
  ON public.helpdesk_calibration_plans (asset_id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_calibration_plans_next_due_on
  ON public.helpdesk_calibration_plans (next_due_on);

CREATE TABLE IF NOT EXISTS public.helpdesk_calibration_orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT NOT NULL,
  plan_id BIGINT NOT NULL REFERENCES public.helpdesk_calibration_plans(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id),
  scheduled_for DATE NOT NULL,
  window_starts_on DATE NULL,
  window_ends_on DATE NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  completed_by_user_id UUID NULL REFERENCES public.users(id),
  provider_name TEXT NULL,
  result TEXT NULL,
  certificate_no TEXT NULL,
  calibration_due_on DATE NULL,
  findings TEXT NULL,
  evidence_notes TEXT NULL,
  lifecycle_event_id BIGINT NULL REFERENCES public.helpdesk_asset_lifecycle_events(id),
  rescheduled_from DATE NULL,
  rescheduled_at TIMESTAMPTZ NULL,
  reschedule_reason TEXT NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_calibration_orders_order_code
  ON public.helpdesk_calibration_orders (UPPER(order_code));

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_calibration_orders_plan_date
  ON public.helpdesk_calibration_orders (plan_id, scheduled_for);

CREATE INDEX IF NOT EXISTS ix_helpdesk_calibration_orders_scheduled_for
  ON public.helpdesk_calibration_orders (scheduled_for, status);

CREATE INDEX IF NOT EXISTS ix_helpdesk_calibration_orders_status
  ON public.helpdesk_calibration_orders (status, scheduled_for);

-- Alinear las secuencias con el maximo id existente (idempotencia en re-corridas).
SELECT setval(
  'public.helpdesk_calibration_plan_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_calibration_plans), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_calibration_plans), 0) > 0
);

SELECT setval(
  'public.helpdesk_calibration_order_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_calibration_orders), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_calibration_orders), 0) > 0
);

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260709_01_helpdesk_calibration.sql', 'ff92ecc917b6a273180db5181061921a0e0db2905030403b3101a681a5aeaa39')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [5/8] 20260709_02_helpdesk_maintenance_schedule_mode.sql
-- SHA-256: 7414a30d07eaaf5d0feb5d184c7fdf87a26667556cf9d9c43f3d66d38c5b40a0
-- ----------------------------------------------------------------------------
-- Modo de calendario para planes de mantenimiento (paridad con calibracion).
-- FREQUENCY: la proxima fecha se deriva del intervalo (comportamiento actual).
-- CALENDAR: las fechas las provee el proveedor/responsable y se cargan como
-- ordenes explicitas (el cierre NO autogenera la siguiente en este modo).
BEGIN;

ALTER TABLE public.helpdesk_maintenance_plans
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'FREQUENCY';

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260709_02_helpdesk_maintenance_schedule_mode.sql', '7414a30d07eaaf5d0feb5d184c7fdf87a26667556cf9d9c43f3d66d38c5b40a0')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [6/8] 20260709_03_helpdesk_service_reminders.sql
-- SHA-256: 2d4c50fcce5e7cb0de31f9804a82dbe6d4ffba688f9a09070543d7095072d493
-- ----------------------------------------------------------------------------
-- Recordatorios de servicio (mantenimiento y calibracion): marca de idempotencia
-- para que el cron avise una sola vez por orden. Se reinicia (NULL) al reprogramar
-- una orden para que el aviso vuelva a dispararse con la nueva fecha.
BEGIN;

ALTER TABLE public.helpdesk_maintenance_orders
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ NULL;

ALTER TABLE public.helpdesk_calibration_orders
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ NULL;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260709_03_helpdesk_service_reminders.sql', '2d4c50fcce5e7cb0de31f9804a82dbe6d4ffba688f9a09070543d7095072d493')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [7/8] 20260709_04_helpdesk_module_rename.sql
-- SHA-256: 84dabb3d3d688f428ac5d4dbb31eb9a83423ff6404cdb3be3876ead87e2beb29
-- ----------------------------------------------------------------------------
-- Renombra el NOMBRE VISIBLE del modulo HELPDESK (el codigo 'HELPDESK' NO cambia).
-- El modulo dejo de ser solo mesa de ayuda: hoy incluye el inventario y ciclo de
-- vida de activos ISO 15189 (entrega-recepcion, movimientos, mantenimiento,
-- calibracion, calendario) ademas de los tickets de soporte.
-- Solo actualiza public.modules.name/description; no toca code ni accesos.
BEGIN;

UPDATE public.modules
   SET name = 'Gestión de Activos y Soporte',
       description = 'Inventario y ciclo de vida de activos (ISO 15189): mantenimiento, calibración, entrega-recepción, movimientos y mesa de ayuda.'
 WHERE UPPER(code) = 'HELPDESK';

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260709_04_helpdesk_module_rename.sql', '84dabb3d3d688f428ac5d4dbb31eb9a83423ff6404cdb3be3876ead87e2beb29')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [8/8] 20260709_05_helpdesk_module_name_short.sql
-- SHA-256: 0b80a76e172c0a15a78aa58bbc90813def2d9ac5e6a200b3b8d110663d36236f
-- ----------------------------------------------------------------------------
-- Ajuste del nombre visible del modulo HELPDESK: se acorta a "Gestion de Activos"
-- (se retira "y Soporte" del titulo). El codigo 'HELPDESK' no cambia.
BEGIN;

UPDATE public.modules
   SET name = 'Gestión de Activos'
 WHERE UPPER(code) = 'HELPDESK';

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260709_05_helpdesk_module_name_short.sql', '0b80a76e172c0a15a78aa58bbc90813def2d9ac5e6a200b3b8d110663d36236f')
ON CONFLICT (filename) DO NOTHING;

-- Verificacion (opcional): deben aparecer las 8 filas registradas.
-- SELECT filename, applied_at FROM public.schema_migrations
--  WHERE filename LIKE '2026070%' ORDER BY filename;
