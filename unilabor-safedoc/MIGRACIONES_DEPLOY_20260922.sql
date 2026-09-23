-- MIGRACIONES_DEPLOY_20260922.sql — aplicar por pgAdmin (o psql desde el VPS) en prod (sgc.unilabor-app.com)
-- Contiene 20260922_01 (interruptor por fase "Completar checklist al aprobar") y
-- 20260922_02 (Programa de Mantenimiento de activos: plantillas, programa por activo,
-- recurrencia/ventana, ordenes proyectadas, verificacion post-reparacion, evidencia),
-- y las registra en schema_migrations con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260914_01
-- (si aun no se aplico MIGRACIONES_DEPLOY_20260914.sql, aplicar ese primero):
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- EFECTO EN PROD (01): agrega 1 columna booleana (default FALSE) y enciende el interruptor
-- SOLO en la Fase 1 (su historico ya se aplico con SCRIPT_PROD_20260922_CHECKLIST_FASE1_APROBADOS.sql).
-- EFECTO EN PROD (02): 4 tablas nuevas, columnas nuevas en planes/ordenes/documentos de activo,
-- plan_id de ordenes pasa a NULL-able, constraint de estado de ordenes admite PENDING_VALIDATION,
-- frecuencia BIMONTHLY y 2 tipos de documento; backfill: cada activo con planes activos recibe un
-- programa v1 (fuente INTERNAL). No borra ni modifica ordenes existentes.
-- Aplicar ANTES del deploy del backend: el codigo nuevo lee las columnas al listar fases/ordenes.
-- ENV nuevas (opcionales) en ecosystem.config.js: HELPDESK_ESCALATION_EMAIL, SERVICE_ESCALATION_DAYS
-- (default 3), DIRECTORY_UPLOAD_MAINTENANCE_DOCUMENTS (default uploads/maintenance-documents).
BEGIN;

-- ============ 20260922_01_rh_induction_phase_auto_checklist.sql ============
-- =============================================================================
-- RH/Induccion - Interruptor por fase "Completar checklist al aprobar"
--
-- El Checklist de contenidos de cada fase (REH-REG-005, "marque conforme se
-- imparta") se marcaba a mano por RH inscrito por inscrito. Con este
-- interruptor encendido, en cuanto la evaluacion de la fase queda en 'passed'
-- el sistema marca automaticamente TODOS los contenidos de la inscripcion, con
-- la cuenta recursos.humanos@unilabor.mx como autora de las marcas. RH conserva
-- el desmarcado manual (el gancho solo corre al emitir la constancia).
--
-- 100% ADITIVA: 1 columna booleana. Fase 1 arranca encendida porque su
-- historico ya se aplico con el script SCRIPT_PROD_20260922_CHECKLIST_FASE1_APROBADOS.sql;
-- el resto de fases arranca apagado y RH decide.
-- =============================================================================
ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS auto_complete_checklist_on_pass BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.rh_induction_phases
   SET auto_complete_checklist_on_pass = TRUE
 WHERE phase_number = 1;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260922_01_rh_induction_phase_auto_checklist.sql', '05b1ae448bdbb3d1e5a592c504bc05de6ac3260b3bd0aaf5c268e019f6bfa748');

-- ============ 20260922_02_helpdesk_maintenance_program.sql ============
-- =============================================================================
-- Help Desk / Programa de Mantenimiento de activos (ISO 15189:2022 6.4.5, 6.4.7)
--
-- Extiende el motor de planes/ordenes de mantenimiento existente con:
--   1. Plantillas por categoria de activo (rutinas + tareas base). Las mantiene
--      Help Desk; solo pre-llenan el programa de cada activo.
--   2. Programa PERSONALIZADO por activo, versionado y con fuente documentada
--      (manual del fabricante, programa del proveedor, contrato o criterio
--      interno). Cada rutina del programa es un plan del motor actual.
--   3. Recurrencia: frecuencia bimestral, intervalo personalizado (valor +
--      unidad), anclaje fijo/flotante, fin de recurrencia, pausa con motivo.
--      La ventana desde/hasta reusa tolerance_before/after_days.
--   4. Ordenes proyectadas (is_projected) para poblar el calendario a futuro,
--      verificacion post-reparacion ligada a ticket (plan_id NULL), ejecucion
--      real (ejecutor, proveedor, downtime, firmas, validacion, constancia).
--   5. Evidencia de la orden en el expediente del activo (maintenance_order_id).
--
-- 100% ADITIVA salvo: helpdesk_maintenance_orders.plan_id pasa a NULL-able
-- (necesario para ordenes de verificacion post-reparacion sin plan).
-- Backfill: cada activo con planes activos recibe un programa version 1 con
-- fuente INTERNAL y sus planes se ligan a el; las ordenes existentes no se tocan.
-- =============================================================================

-- 1. Frecuencia bimestral -----------------------------------------------------
INSERT INTO public.helpdesk_maintenance_frequencies (code, name, interval_months, description, sort_order)
SELECT 'BIMONTHLY', 'Bimestral', 2, 'Ejecucion cada dos meses.', 15
WHERE NOT EXISTS (SELECT 1 FROM public.helpdesk_maintenance_frequencies WHERE UPPER(code) = 'BIMONTHLY');

-- 2. Plantillas por categoria -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.helpdesk_maintenance_templates (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NULL REFERENCES public.helpdesk_asset_categories(id),
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_hd_maint_templates_category
  ON public.helpdesk_maintenance_templates (category_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.helpdesk_maintenance_template_routines (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES public.helpdesk_maintenance_templates(id) ON DELETE CASCADE,
  service_kind TEXT NOT NULL DEFAULT 'PREVENTIVE',
  title TEXT NOT NULL,
  description TEXT NULL,
  frequency_id BIGINT NULL REFERENCES public.helpdesk_maintenance_frequencies(id),
  custom_interval_value INTEGER NULL,
  custom_interval_unit TEXT NULL,
  executor_kind TEXT NOT NULL DEFAULT 'INTERNAL_TECH',
  window_before_days INTEGER NOT NULL DEFAULT 0,
  window_after_days INTEGER NOT NULL DEFAULT 7,
  checklist_required BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_hd_tpl_routine_kind CHECK (service_kind IN ('PREVENTIVE', 'VERIFICATION', 'ELECTRICAL_SAFETY', 'OTHER')),
  CONSTRAINT chk_hd_tpl_routine_unit CHECK (custom_interval_unit IS NULL OR custom_interval_unit IN ('DAY', 'WEEK', 'MONTH')),
  CONSTRAINT chk_hd_tpl_routine_executor CHECK (executor_kind IN ('INTERNAL_OPERATOR', 'INTERNAL_TECH', 'EXTERNAL_PROVIDER'))
);
CREATE INDEX IF NOT EXISTS ix_hd_maint_tpl_routines_template
  ON public.helpdesk_maintenance_template_routines (template_id, sort_order);

CREATE TABLE IF NOT EXISTS public.helpdesk_maintenance_template_tasks (
  id BIGSERIAL PRIMARY KEY,
  routine_id BIGINT NOT NULL REFERENCES public.helpdesk_maintenance_template_routines(id) ON DELETE CASCADE,
  task_text TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_hd_maint_tpl_tasks_routine
  ON public.helpdesk_maintenance_template_tasks (routine_id, sort_order);

-- 3. Programa por activo (versionado) ------------------------------------------
CREATE TABLE IF NOT EXISTS public.helpdesk_asset_maintenance_programs (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  template_id BIGINT NULL REFERENCES public.helpdesk_maintenance_templates(id),
  source_kind TEXT NOT NULL DEFAULT 'INTERNAL',
  source_document_id UUID NULL REFERENCES public.documents(id),
  source_asset_document_id BIGINT NULL REFERENCES public.helpdesk_asset_documents(id) ON DELETE SET NULL,
  source_reference TEXT NULL,
  source_notes TEXT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE NULL,
  change_reason TEXT NULL,
  deviates_from_template BOOLEAN NOT NULL DEFAULT FALSE,
  deviation_reason TEXT NULL,
  projection_months INTEGER NOT NULL DEFAULT 12,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_hd_program_status CHECK (status IN ('ACTIVE', 'SUPERSEDED')),
  CONSTRAINT chk_hd_program_source CHECK (source_kind IN ('MANUFACTURER_MANUAL', 'PROVIDER_PROGRAM', 'SERVICE_CONTRACT', 'INTERNAL')),
  CONSTRAINT chk_hd_program_projection CHECK (projection_months BETWEEN 1 AND 36)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hd_asset_programs_version
  ON public.helpdesk_asset_maintenance_programs (asset_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hd_asset_programs_active
  ON public.helpdesk_asset_maintenance_programs (asset_id) WHERE status = 'ACTIVE';

-- 4. Rutinas (planes) ---------------------------------------------------------
ALTER TABLE public.helpdesk_maintenance_plans
  ADD COLUMN IF NOT EXISTS program_id BIGINT NULL REFERENCES public.helpdesk_asset_maintenance_programs(id),
  ADD COLUMN IF NOT EXISTS template_routine_id BIGINT NULL REFERENCES public.helpdesk_maintenance_template_routines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_kind TEXT NOT NULL DEFAULT 'PREVENTIVE',
  ADD COLUMN IF NOT EXISTS custom_interval_value INTEGER NULL,
  ADD COLUMN IF NOT EXISTS custom_interval_unit TEXT NULL,
  ADD COLUMN IF NOT EXISTS anchor_mode TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN IF NOT EXISTS recurrence_end_on DATE NULL,
  ADD COLUMN IF NOT EXISTS recurrence_max_occurrences INTEGER NULL,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS executor_kind TEXT NOT NULL DEFAULT 'INTERNAL_TECH',
  ADD COLUMN IF NOT EXISTS supplier_id BIGINT NULL REFERENCES public.helpdesk_suppliers(id),
  ADD COLUMN IF NOT EXISTS deviates_from_template BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deviation_reason TEXT NULL;
CREATE INDEX IF NOT EXISTS ix_hd_maint_plans_program
  ON public.helpdesk_maintenance_plans (program_id);

-- 5. Ordenes ------------------------------------------------------------------
ALTER TABLE public.helpdesk_maintenance_orders ALTER COLUMN plan_id DROP NOT NULL;
-- Estado nuevo PENDING_VALIDATION: ejecutada, en espera de la firma del responsable del activo.
ALTER TABLE public.helpdesk_maintenance_orders DROP CONSTRAINT IF EXISTS chk_helpdesk_maintenance_orders_status;
ALTER TABLE public.helpdesk_maintenance_orders
  ADD CONSTRAINT chk_helpdesk_maintenance_orders_status
  CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'RESCHEDULED', 'PENDING_VALIDATION', 'CLOSED'));
ALTER TABLE public.helpdesk_maintenance_orders
  ADD COLUMN IF NOT EXISTS is_projected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS program_version INTEGER NULL,
  ADD COLUMN IF NOT EXISTS service_kind TEXT NOT NULL DEFAULT 'PREVENTIVE',
  ADD COLUMN IF NOT EXISTS ticket_id BIGINT NULL REFERENCES public.helpdesk_tickets(id),
  ADD COLUMN IF NOT EXISTS derived_ticket_id BIGINT NULL REFERENCES public.helpdesk_tickets(id),
  ADD COLUMN IF NOT EXISTS executed_by_employee_id BIGINT NULL REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS supplier_id BIGINT NULL REFERENCES public.helpdesk_suppliers(id),
  ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS technician_signature_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS responsible_signature_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS validated_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS lifecycle_event_id BIGINT NULL REFERENCES public.helpdesk_asset_lifecycle_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS constancia_document_id BIGINT NULL REFERENCES public.helpdesk_asset_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS escalation_notified_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS ix_hd_maint_orders_scheduled_status
  ON public.helpdesk_maintenance_orders (scheduled_for, status);
CREATE INDEX IF NOT EXISTS ix_hd_maint_orders_asset
  ON public.helpdesk_maintenance_orders (asset_id, scheduled_for);
CREATE INDEX IF NOT EXISTS ix_hd_maint_orders_ticket
  ON public.helpdesk_maintenance_orders (ticket_id) WHERE ticket_id IS NOT NULL;

-- 6. Evidencia de la orden en el expediente del activo --------------------------
ALTER TABLE public.helpdesk_asset_documents
  ADD COLUMN IF NOT EXISTS maintenance_order_id BIGINT NULL REFERENCES public.helpdesk_maintenance_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_hd_asset_docs_maint_order
  ON public.helpdesk_asset_documents (maintenance_order_id) WHERE maintenance_order_id IS NOT NULL;

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT 'MAINTENANCE_CONSTANCIA', 'Constancia de mantenimiento', 'Registro de ejecucion de una orden de mantenimiento (ISO 15189 6.4.7).', 130
WHERE NOT EXISTS (SELECT 1 FROM public.helpdesk_document_kinds WHERE UPPER(code) = 'MAINTENANCE_CONSTANCIA');
INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT 'MAINTENANCE_EVIDENCE', 'Evidencia de mantenimiento', 'Fotos, reportes o certificados adjuntos a una orden de mantenimiento.', 131
WHERE NOT EXISTS (SELECT 1 FROM public.helpdesk_document_kinds WHERE UPPER(code) = 'MAINTENANCE_EVIDENCE');

-- 7. Backfill: programa version 1 para activos con planes activos ---------------
INSERT INTO public.helpdesk_asset_maintenance_programs (asset_id, version, status, source_kind, source_notes, effective_from, change_reason)
SELECT DISTINCT p.asset_id, 1, 'ACTIVE', 'INTERNAL',
       'Programa inicial generado automaticamente a partir de los planes existentes.',
       COALESCE((SELECT MIN(p2.starts_on) FROM public.helpdesk_maintenance_plans p2 WHERE p2.asset_id = p.asset_id AND p2.is_active), CURRENT_DATE),
       'Migracion 20260922_02: envoltura de planes existentes.'
  FROM public.helpdesk_maintenance_plans p
 WHERE p.is_active = TRUE
   AND p.program_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.helpdesk_asset_maintenance_programs g WHERE g.asset_id = p.asset_id AND g.status = 'ACTIVE');

UPDATE public.helpdesk_maintenance_plans p
   SET program_id = g.id
  FROM public.helpdesk_asset_maintenance_programs g
 WHERE g.asset_id = p.asset_id AND g.status = 'ACTIVE' AND p.program_id IS NULL;

UPDATE public.helpdesk_maintenance_orders o
   SET program_version = 1
  FROM public.helpdesk_maintenance_plans p
 WHERE p.id = o.plan_id AND o.program_version IS NULL AND p.program_id IS NOT NULL;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260922_02_helpdesk_maintenance_program.sql', 'd68a4350f36e978d6c55c922545fdd0690a93b2f71976149348ee1e2e3f6071b');

COMMIT;

-- POST-CHEQUEO:
--   SELECT phase_number, auto_complete_checklist_on_pass FROM public.rh_induction_phases ORDER BY 1;
--   (debe mostrar Fase 1 = true y el resto = false)
--   SELECT COUNT(*) FROM public.helpdesk_asset_maintenance_programs;   -- = activos con planes activos
--   SELECT code FROM public.helpdesk_maintenance_frequencies WHERE code = 'BIMONTHLY';
--   SELECT conname FROM pg_constraint WHERE conname = 'chk_helpdesk_maintenance_orders_status';
