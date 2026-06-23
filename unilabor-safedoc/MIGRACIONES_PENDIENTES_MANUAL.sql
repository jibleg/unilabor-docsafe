-- =====================================================================
-- SafeDoc — migraciones pendientes para aplicar MANUALMENTE en pgAdmin4
-- Bloque: modulo Evaluaciones + Help Desk ISO 15189 + endurecimiento.
-- Generado desde sql/ (archivos >= 20260617).
--
-- Seguro de correr completo: cada migracion va en su propia transaccion
-- (BEGIN/COMMIT) y es idempotente (IF NOT EXISTS / WHERE NOT EXISTS /
-- ON CONFLICT). Re-aplicar algo ya aplicado NO hace nada.
-- Tambien registra cada una en schema_migrations (mismo checksum que el
-- runner) para que luego `migrate:status` las vea como aplicadas.
--
-- Asume que las migraciones base (<= 20260422: auth, RH, Help Desk base)
-- YA estan aplicadas en prod. Si ves un error "relation ... does not
-- exist", avisa: falta una migracion previa.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 20260617_01_eval_training_courses.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 31 (EVAL-01) - Capacitaciones (training_courses).
-- Entidad ancla de las evaluaciones de capacitacion exigidas por ISO 15189:2022.
-- Idempotente: segura de re-correr; el migration runner la aplica una sola vez.

CREATE TABLE IF NOT EXISTS public.training_courses (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NULL,
  -- Vigencia de la constancia generada (meses). 0 = sin vencimiento. Default 12 (anual, ISO).
  certificate_validity_months INTEGER NOT NULL DEFAULT 12,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_training_courses_validity CHECK (certificate_validity_months >= 0)
);

CREATE INDEX IF NOT EXISTS idx_training_courses_is_active
  ON public.training_courses (is_active);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_01_eval_training_courses.sql', '6866ca12d4058677f14dac5346765268af5a8058f9deda926fd7194d5416de10') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_02_eval_templates.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 31 (EVAL-02) - Plantillas de evaluacion (evaluation_templates).
-- Una plantilla pertenece a una capacitacion y define la regla de calificacion,
-- la ventana de tiempo y el modo de entrega del banco de preguntas.
-- requires_manual_grading NO se almacena: se deriva en consulta de la existencia
-- de preguntas tipo 'open' (evita desincronizacion).

CREATE TABLE IF NOT EXISTS public.evaluation_templates (
  id BIGSERIAL PRIMARY KEY,
  training_course_id BIGINT NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT NULL,
  passing_score INTEGER NOT NULL DEFAULT 80,
  window_hours INTEGER NOT NULL DEFAULT 72,
  selection_mode TEXT NOT NULL DEFAULT 'all',
  random_count INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_eval_templates_passing CHECK (passing_score BETWEEN 0 AND 100),
  CONSTRAINT chk_eval_templates_window CHECK (window_hours > 0),
  CONSTRAINT chk_eval_templates_selection CHECK (selection_mode IN ('all', 'random')),
  CONSTRAINT chk_eval_templates_random_count CHECK (random_count IS NULL OR random_count > 0),
  CONSTRAINT chk_eval_templates_status CHECK (status IN ('draft', 'published'))
);

CREATE INDEX IF NOT EXISTS idx_eval_templates_course
  ON public.evaluation_templates (training_course_id);

CREATE INDEX IF NOT EXISTS idx_eval_templates_status
  ON public.evaluation_templates (status);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_02_eval_templates.sql', '93a5f88440652f44767ca1843738ded244174f943f9fc763c9411d2ae09697c5') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_03_eval_questions.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 31 (EVAL-03) - Banco de preguntas (evaluation_questions).
-- Tipos: single/multiple/boolean = auto-calificables; open = calificacion manual por RH.

CREATE TABLE IF NOT EXISTS public.evaluation_questions (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_eval_questions_type CHECK (type IN ('single', 'multiple', 'boolean', 'open')),
  CONSTRAINT chk_eval_questions_points CHECK (points > 0)
);

CREATE INDEX IF NOT EXISTS idx_eval_questions_template
  ON public.evaluation_questions (template_id);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_03_eval_questions.sql', '4d3f2f5796697701190c0f22c9c035130f8ee72e214eed08f78878c5b8d0dcb7') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_04_eval_question_options.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 31 (EVAL-04) - Opciones de pregunta (evaluation_question_options).
-- Solo para tipos auto-calificables (single/multiple/boolean). is_correct marca la
-- respuesta correcta usada por la auto-calificacion de sprints posteriores.

CREATE TABLE IF NOT EXISTS public.evaluation_question_options (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES public.evaluation_questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_question_options_question
  ON public.evaluation_question_options (question_id);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_04_eval_question_options.sql', '3475a754f4a08471ee4354812593e7b66284051d4a7011aef5a08f8f23b2959f') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_05_employees_phone.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 31 (EVAL-05) - Telefono del colaborador.
-- Habilita la notificacion por SMS (LabsMobile) de sprints posteriores. Nullable,
-- formato E.164 validado en la capa Zod. Migracion aditiva e idempotente.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone TEXT NULL;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_05_employees_phone.sql', 'ec7fc080430c9cdd0e05bceaa2047aabf7d0216d2f8a83994abf2fd2ffe9a06c') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_06_eval_assignments.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 32 (EVAL-16) - Asignaciones de evaluacion (evaluation_assignments).
-- Una asignacion es la instancia de una plantilla para un colaborador, con su
-- ventana de tiempo (72h) y el ciclo de vida de la evaluacion.

CREATE TABLE IF NOT EXISTS public.evaluation_assignments (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NULL,
  submitted_at TIMESTAMPTZ NULL,
  graded_at TIMESTAMPTZ NULL,
  score INTEGER NULL,
  max_score INTEGER NULL,
  percentage NUMERIC(5, 2) NULL,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  notified_email_at TIMESTAMPTZ NULL,
  notified_sms_at TIMESTAMPTZ NULL,
  reminder_sent_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_eval_assignments_status CHECK (
    status IN ('pending', 'in_progress', 'submitted', 'grading', 'passed', 'failed', 'expired', 'authorized_late')
  ),
  CONSTRAINT chk_eval_assignments_attempt CHECK (attempt_no >= 1)
);

CREATE INDEX IF NOT EXISTS idx_eval_assignments_template
  ON public.evaluation_assignments (template_id);

CREATE INDEX IF NOT EXISTS idx_eval_assignments_employee
  ON public.evaluation_assignments (employee_id);

CREATE INDEX IF NOT EXISTS idx_eval_assignments_status
  ON public.evaluation_assignments (status);

CREATE INDEX IF NOT EXISTS idx_eval_assignments_deadline
  ON public.evaluation_assignments (deadline_at);

-- Idempotencia: a lo sumo una asignacion VIGENTE por (plantilla, colaborador).
-- Los estados terminales (passed/failed/expired/authorized_late) no bloquean
-- una eventual reasignacion (recapacitacion).
CREATE UNIQUE INDEX IF NOT EXISTS ux_eval_assignments_active
  ON public.evaluation_assignments (template_id, employee_id)
  WHERE status IN ('pending', 'in_progress', 'submitted', 'grading');
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_06_eval_assignments.sql', '1c00e2fd4d3e1d85dc67c12237920d04dc39eccbc2d7f9df4d35a13787f91092') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_07_eval_assignment_questions.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 32 (EVAL-17) - Snapshot de preguntas por asignacion.
-- Fija que preguntas le tocaron a cada colaborador (clave para el modo aleatorio:
-- cada asignacion recibe su propio subconjunto). Se congela al instanciar.

CREATE TABLE IF NOT EXISTS public.evaluation_assignment_questions (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES public.evaluation_assignments(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES public.evaluation_questions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_eval_assignment_questions UNIQUE (assignment_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_assignment_questions_assignment
  ON public.evaluation_assignment_questions (assignment_id);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_07_eval_assignment_questions.sql', '789dadbdcbda3bbe437ae9ec928ed22e000083dfcc78ba735569fff9e6b6871c') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_08_eval_responses.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 33 (EVAL-28) - Respuestas del colaborador (evaluation_responses).
-- Una fila por (asignacion, pregunta). selected_option_ids para preguntas de
-- opcion (single/multiple/boolean); text_answer para abiertas. is_correct y
-- points_awarded los fija la auto-calificacion (objetivas) o RH (abiertas).

CREATE TABLE IF NOT EXISTS public.evaluation_responses (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES public.evaluation_assignments(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES public.evaluation_questions(id) ON DELETE CASCADE,
  selected_option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  text_answer TEXT NULL,
  is_correct BOOLEAN NULL,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  graded_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_eval_responses UNIQUE (assignment_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_responses_assignment
  ON public.evaluation_responses (assignment_id);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_08_eval_responses.sql', 'bfcc74e89e0abc9d02e4dff1ae0ae43fbada5498a8f732514a031ac7193fb6b8') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_09_eval_certificate_templates.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 35 (EVAL-48) - Plantilla de constancia (certificate_templates).
-- Una plantilla disenable por capacitacion: textos con placeholders, logo y
-- orientacion. El mismo motor de render produce el preliminar (datos de muestra)
-- y la constancia real (Sprint 36).

CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id BIGSERIAL PRIMARY KEY,
  training_course_id BIGINT NOT NULL UNIQUE REFERENCES public.training_courses(id) ON DELETE CASCADE,
  title_text TEXT NOT NULL DEFAULT 'Constancia de capacitacion',
  body_text TEXT NOT NULL DEFAULT 'Se otorga la presente constancia a {{nombre}} por acreditar la capacitacion "{{capacitacion}}" con una calificacion de {{calificacion}} el {{fecha}}.',
  logo_path TEXT NULL,
  orientation TEXT NOT NULL DEFAULT 'landscape',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_certificate_orientation CHECK (orientation IN ('landscape', 'portrait'))
);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_09_eval_certificate_templates.sql', 'a66b4878b50403aa04328097f262cd809c3067aa72748bb92683608799612169') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_10_eval_certificate_signatures.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 35 (EVAL-49) - Firmas de la constancia (certificate_template_signatures).
-- 1..N firmas por plantilla (nombre, cargo y opcional imagen de firma).

CREATE TABLE IF NOT EXISTS public.certificate_template_signatures (
  id BIGSERIAL PRIMARY KEY,
  certificate_template_id BIGINT NOT NULL REFERENCES public.certificate_templates(id) ON DELETE CASCADE,
  signatory_name TEXT NOT NULL,
  role TEXT NULL,
  signature_image_path TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificate_signatures_template
  ON public.certificate_template_signatures (certificate_template_id);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_10_eval_certificate_signatures.sql', 'e2af7303fd55872bdb8cd86349c406acbee946465a185d95b8b300f6b3ebbd99') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_11_eval_assignment_certificate.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 36 (EVAL-58) - Enlace de la asignacion con su constancia generada.
-- Permite idempotencia (no regenerar) y exponer la constancia al colaborador.

ALTER TABLE public.evaluation_assignments
  ADD COLUMN IF NOT EXISTS certificate_document_id BIGINT NULL
    REFERENCES public.employee_documents(id) ON DELETE SET NULL;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_11_eval_assignment_certificate.sql', 'b064025c10277417063b4a51f7af75a66bc417039f06c3c7988236fe250a73c0') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_12_notification_log.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 37 (EVAL-66) - Bitacora de notificaciones (notification_log).
-- Trazabilidad ISO de los avisos por correo y SMS (disponibilidad de evaluacion,
-- no-acreditado). Registra exito/fallo sin bloquear el flujo de negocio.

CREATE TABLE IF NOT EXISTS public.notification_log (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  assignment_id BIGINT NULL REFERENCES public.evaluation_assignments(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  error TEXT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_notification_channel CHECK (channel IN ('email', 'sms')),
  CONSTRAINT chk_notification_status CHECK (status IN ('sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_notification_log_assignment
  ON public.notification_log (assignment_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at
  ON public.notification_log (sent_at DESC);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_12_notification_log.sql', 'e71c42b2abcbe3c11b33644152df9d9b1b87ab047ba22198f6aa5823cb23bbd5') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_13_eval_late_request.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 38 (EVAL-78) - Solicitud de autorizacion extemporanea.
-- Marca cuando el colaborador (o RH a su nombre) solicita reabrir una evaluacion
-- vencida. RH la autoriza reabriendo la ventana.

ALTER TABLE public.evaluation_assignments
  ADD COLUMN IF NOT EXISTS late_requested_at TIMESTAMPTZ NULL;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_13_eval_late_request.sql', 'e8da3b4f080af7f71b3c1c57c5754b4ae473ea829553b4cf07e337b17f2880cf') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260617_14_outbox_content.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Bandeja de salida: guarda el contenido del envio (asunto y cuerpo) ademas del
-- estado, para trazabilidad completa de correos y SMS. Extiende notification_log.

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS subject TEXT NULL,
  ADD COLUMN IF NOT EXISTS body TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON public.notification_log (channel);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260617_14_outbox_content.sql', '979dc8d87c25392f1449cdc9a56f0adb9ffe165beaba16dd7e472d291d68f01e') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260618_01_employee_documents_reference_key.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Constancias por capacitacion: un colaborador puede tener varias constancias
-- vigentes (una POR CURSO), no una sola por tipo de documento.
-- Se agrega `reference_key` como discriminador y se reemplaza el indice unico de
-- "una vigente por tipo" por dos indices parciales:
--   - documentos normales (reference_key NULL): siguen siendo singleton por tipo
--     (un contrato vigente, un CV vigente, etc.).
--   - documentos con referencia (constancias = 'training_course:<id>'): unicos por
--     (empleado, tipo, referencia) => una constancia vigente por capacitacion.

ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS reference_key TEXT NULL;

-- Backfill: las constancias de capacitacion ya emitidas se etiquetan con su curso.
UPDATE public.employee_documents ed
   SET reference_key = 'training_course:' || t.training_course_id
  FROM public.evaluation_assignments a
  JOIN public.evaluation_templates t ON t.id = a.template_id
 WHERE a.certificate_document_id = ed.id
   AND ed.reference_key IS NULL;

DROP INDEX IF EXISTS public.ux_employee_documents_current_type;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_documents_current_singleton
  ON public.employee_documents (employee_id, document_type_id)
  WHERE is_current = TRUE AND reference_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_documents_current_referenced
  ON public.employee_documents (employee_id, document_type_id, reference_key)
  WHERE is_current = TRUE AND reference_key IS NOT NULL;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260618_01_employee_documents_reference_key.sql', '2b4195e5932ecda65d2a8d08223e0e068bb387563081be94b7ebda8727e0462a') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260620_01_helpdesk_code_sequences.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Generacion atomica de codigos HD-/MP-/OM- (mesa de ayuda).
-- Antes los codigos se calculaban con `COALESCE(MAX(id),0)+1`, lo que bajo
-- concurrencia produce el MISMO codigo para dos solicitudes simultaneas y
-- colisiona contra el indice unico. Se reemplaza por secuencias dedicadas:
-- `nextval` es atomico y nunca repite, sin importar la concurrencia.
-- Cada secuencia se inicializa al MAX(id) actual para continuar la numeracion
-- existente sin chocar con codigos ya emitidos.

CREATE SEQUENCE IF NOT EXISTS public.helpdesk_ticket_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.helpdesk_maintenance_plan_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.helpdesk_maintenance_order_code_seq;

-- Alinear el valor actual de cada secuencia con el maximo id ya existente.
-- is_called = (max > 0): si la tabla esta vacia, el primer nextval devuelve 1;
-- si ya hay filas, el primer nextval devuelve max+1.
SELECT setval(
  'public.helpdesk_ticket_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_tickets), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_tickets), 0) > 0
);

SELECT setval(
  'public.helpdesk_maintenance_plan_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_maintenance_plans), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_maintenance_plans), 0) > 0
);

SELECT setval(
  'public.helpdesk_maintenance_order_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_maintenance_orders), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_maintenance_orders), 0) > 0
);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260620_01_helpdesk_code_sequences.sql', 'fdd1954c333378c549f9ddb37efd1a1b86ac7f7522ee84b7b49f65e868039501') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260622_01_helpdesk_iso_catalogs.sql
-- ---------------------------------------------------------------------
BEGIN;
-- =====================================================================
-- HD-ISO-01: Catalogos nuevos para el ciclo de vida + evidencias ISO 15189:2022
-- (proveedores, condicion de recepcion, motivos de baja, tipos de documento,
--  tipos de evento de ciclo de vida) + tabla de consecutivos para el codigo
--  de inventario autogenerado, y reseed de catalogos segun la plantilla
--  Inventario-UNILABOR.xlsx (2 unidades, 26 areas, clasificaciones, modalidades).
-- =====================================================================

-- --- Proveedores (proveedor != marca) ---
CREATE TABLE IF NOT EXISTS public.helpdesk_suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  rfc TEXT NULL,
  contact TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_suppliers_name
  ON public.helpdesk_suppliers (UPPER(name));

-- --- Condicion al recibir el equipo (ISO 6.4.4) ---
CREATE TABLE IF NOT EXISTS public.helpdesk_receipt_conditions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_receipt_conditions_code
  ON public.helpdesk_receipt_conditions (UPPER(code));

-- --- Motivos de baja ---
CREATE TABLE IF NOT EXISTS public.helpdesk_disposal_reasons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_disposal_reasons_code
  ON public.helpdesk_disposal_reasons (UPPER(code));

-- --- Tipos/categorias de documento de evidencia ---
CREATE TABLE IF NOT EXISTS public.helpdesk_document_kinds (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_document_kinds_code
  ON public.helpdesk_document_kinds (UPPER(code));

-- --- Tipos de evento del ciclo de vida ---
CREATE TABLE IF NOT EXISTS public.helpdesk_lifecycle_event_types (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_lifecycle_event_types_code
  ON public.helpdesk_lifecycle_event_types (UPPER(code));

-- --- Consecutivos para el codigo de inventario autogenerado ---
-- scope_key = 'UNIDAD-AREA-CLASIFICACION' (codigos), contador independiente por combinacion.
CREATE TABLE IF NOT EXISTS public.helpdesk_asset_code_counters (
  scope_key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- Seeds
-- =====================================================================

INSERT INTO public.helpdesk_receipt_conditions (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('OPERATIONAL', 'Operativo conforme', 'Equipo recibido operativo y conforme.', 10),
    ('DAMAGED', 'Danado', 'Equipo recibido con dano fisico o funcional.', 20),
    ('INCOMPLETE', 'Incompleto', 'Equipo recibido sin accesorios o componentes.', 30),
    ('NEEDS_CALIBRATION', 'Requiere calibracion', 'Equipo recibido pendiente de calibracion/verificacion.', 40)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_receipt_conditions existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_disposal_reasons (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('NO_SUPPORT', 'Falta de soporte', 'Sin soporte tecnico o refacciones del proveedor.', 10),
    ('UNREPAIRABLE', 'Falla irreparable', 'Falla que no admite reparacion costo-efectiva.', 20),
    ('REPLACEMENT', 'Cambio / Reemplazo', 'Sustituido por un equipo nuevo o superior.', 30),
    ('OBSOLESCENCE', 'Obsolescencia', 'Tecnologia obsoleta o fuera de uso.', 40)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_disposal_reasons existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_document_kinds (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('INVOICE', 'Factura', 'Factura o recibo de adquisicion.', 10),
    ('PURCHASE_ORDER', 'Orden de compra', 'Orden de compra al proveedor.', 20),
    ('USER_MANUAL', 'Manual de usuario', 'Manual de operacion del equipo.', 30),
    ('INSTRUCTIVE', 'Instructivo', 'Instructivo de uso o procedimiento.', 40),
    ('INSERT', 'Inserto', 'Inserto tecnico del proveedor.', 50),
    ('SERVICE_ORDER', 'Orden de servicio', 'Orden de servicio del proveedor.', 60),
    ('MAINTENANCE_REPORT', 'Reporte de mantenimiento', 'Reporte de mantenimiento preventivo o correctivo.', 70),
    ('CALIBRATION_CERT', 'Certificado de calibracion', 'Certificado de calibracion / verificacion metrologica.', 80),
    ('DECOMMISSION_ACT', 'Acta de baja', 'Acta o evidencia de baja del equipo.', 90),
    ('WARRANTY', 'Garantia', 'Poliza o evidencia de garantia.', 100),
    ('OTHER', 'Otros', 'Otros documentos del proveedor.', 999)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_document_kinds existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_lifecycle_event_types (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('ACQUISITION', 'Adquisicion', 'Ingreso/compra del equipo a UNILABOR.', 10),
    ('COMMISSIONING', 'Instalacion / Puesta en marcha', 'Instalacion y puesta en servicio.', 20),
    ('MAINTENANCE', 'Mantenimiento', 'Mantenimiento preventivo o correctivo.', 30),
    ('CALIBRATION', 'Calibracion', 'Calibracion o verificacion metrologica (ISO 6.5).', 40),
    ('INCIDENT', 'Incidente / Falla', 'Falla, incidente o evento adverso.', 50),
    ('RELOCATION', 'Reubicacion', 'Cambio de ubicacion o area.', 60),
    ('DECOMMISSION', 'Baja', 'Baja del equipo del inventario.', 70)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_lifecycle_event_types existing WHERE UPPER(existing.code) = source.code
);

-- =====================================================================
-- Reseed de catalogos segun la plantilla Inventario-UNILABOR.xlsx
-- (codigos cortos para componer el codigo ISO UNIDAD-AREA-CLASIFICACION-###)
-- =====================================================================

-- Unidades (A / B)
INSERT INTO public.helpdesk_asset_units (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('A', 'UNILABOR CENTRO', 'Unidad Unilabor Centro.', 1),
    ('B', 'UNILABOR CIDE', 'Unidad Unilabor CIDE.', 2)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_units existing WHERE UPPER(existing.code) = source.code
);

-- Areas (26 segun plantilla)
INSERT INTO public.helpdesk_asset_areas (code, name, description, sort_order)
SELECT source.code, source.name, NULL, source.sort_order
FROM (
  VALUES
    ('VAL', 'VALIDACION', 10),
    ('URO', 'UROANALISIS', 20),
    ('TOX', 'TOXICOLOGIA', 30),
    ('TEL', 'TELEFONISTA', 40),
    ('SDI', 'SEPARACION Y DISTRIBUCION', 50),
    ('REC', 'CALL CENTER', 60),
    ('QCL', 'QUIMICA CLINICA', 70),
    ('PAR', 'PARASITOLOGIA', 80),
    ('MIC', 'MICROBIOLOGIA', 90),
    ('IRU', 'INMUNOLOGIA RUTINARIA', 100),
    ('IES', 'INMUNOLOGIA ESPECIAL', 110),
    ('HEM', 'HEMATOLOGIA', 120),
    ('DGE', 'DIRECCION GENERAL', 130),
    ('MRP', 'COORDINACION MERCADOTECNIA Y RELACIONES PUBLICAS', 140),
    ('TEI', 'COORDINACION DE TECNOLOGIA E INFORMACION', 150),
    ('SGC', 'COORDINACION DE SISTEMA DE GESTION DE CALIDAD', 160),
    ('SES', 'COORDINACION DE SERVICIOS ESPECIALES', 170),
    ('REH', 'COORDINACION DE RECURSOS HUMANOS', 180),
    ('AYF', 'ADMINISTRACION Y FINANZAS', 190),
    ('CRE', 'CAPTURA DE RESULTADOS', 200),
    ('ALM', 'ALMACEN', 210),
    ('AND', 'ANDROLOGIA', 220),
    ('MEQ', 'MANTENIMIENTO Y EQUIPOS', 230),
    ('SGE', 'SERVICIOS GENERALES', 240),
    ('TMU', 'TOMA DE MUESTRA', 250),
    ('SUB', 'SUBROGACION', 260)
) AS source(code, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_areas existing WHERE UPPER(existing.code) = source.code
);

-- Clasificaciones (categorias) canonicas de la plantilla
INSERT INTO public.helpdesk_asset_categories (code, name, description, sort_order)
SELECT source.code, source.name, NULL, source.sort_order
FROM (
  VALUES
    ('MBL', 'MOBILIARIO', 10),
    ('EQL', 'EQUIPO DE LABORATORIO', 20),
    ('EQC', 'EQUIPO DE COMPUTO', 30),
    ('EQR', 'EQUIPO DE REFRIGERACION', 40)
) AS source(code, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_categories existing WHERE UPPER(existing.code) = source.code
);

-- Modalidades de compra de la plantilla
INSERT INTO public.helpdesk_purchase_modalities (code, name, description, sort_order)
SELECT source.code, source.name, NULL, source.sort_order
FROM (
  VALUES
    ('ACTIVO_FIJO', 'Activo fijo', 1),
    ('COMODATO', 'Comodato', 2)
) AS source(code, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_purchase_modalities existing WHERE UPPER(existing.code) = source.code
);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260622_01_helpdesk_iso_catalogs.sql', 'bf247b374ac4ba13d81d535e549078f240a5c4408608611d4d5869ee218f26c3') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260622_02_helpdesk_assets_iso_columns.sql
-- ---------------------------------------------------------------------
BEGIN;
-- =====================================================================
-- HD-ISO-01: Columnas ISO 15189:2022 en helpdesk_assets
-- (proveedor, fechas de recepcion/puesta en marcha, condicion al recibir,
--  baja con motivo, y bandera de codigo manual/preservado).
-- Reusa acquired_on (fecha factura), warranty_expires_on, brand/model/serial,
-- location y responsible_employee_id ya existentes.
-- =====================================================================

ALTER TABLE public.helpdesk_assets
  ADD COLUMN IF NOT EXISTS supplier_id BIGINT NULL REFERENCES public.helpdesk_suppliers(id),
  ADD COLUMN IF NOT EXISTS received_on DATE NULL,
  ADD COLUMN IF NOT EXISTS placed_in_service_on DATE NULL,
  ADD COLUMN IF NOT EXISTS receipt_condition_id BIGINT NULL REFERENCES public.helpdesk_receipt_conditions(id),
  ADD COLUMN IF NOT EXISTS decommissioned_on DATE NULL,
  ADD COLUMN IF NOT EXISTS disposal_reason_id BIGINT NULL REFERENCES public.helpdesk_disposal_reasons(id),
  ADD COLUMN IF NOT EXISTS asset_code_overridden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_helpdesk_assets_supplier_id
  ON public.helpdesk_assets (supplier_id);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260622_02_helpdesk_assets_iso_columns.sql', '2430ff2a9b3bc25a6205ef23aec0e9580825173e8efb4aa2267d99ad07b7ca73') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260622_03_helpdesk_lifecycle_events.sql
-- ---------------------------------------------------------------------
BEGIN;
-- =====================================================================
-- HD-ISO-03: Eventos del ciclo de vida del equipo (ISO 15189:2022 6.4/6.5).
-- Cada evento (adquisicion, instalacion, mantenimiento, calibracion,
-- incidente, reubicacion, baja) es un registro trazable que ademas puede
-- portar evidencias PDF (helpdesk_asset_documents.lifecycle_event_id).
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.helpdesk_lifecycle_event_code_seq;

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_lifecycle_events (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id) ON DELETE CASCADE,
  event_type_id BIGINT NOT NULL REFERENCES public.helpdesk_lifecycle_event_types(id),
  event_code TEXT NOT NULL,
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  -- cruces opcionales segun el tipo de evento
  maintenance_order_id BIGINT NULL REFERENCES public.helpdesk_maintenance_orders(id),
  ticket_id BIGINT NULL REFERENCES public.helpdesk_tickets(id),
  supplier_id BIGINT NULL REFERENCES public.helpdesk_suppliers(id),
  -- trazabilidad de quien ejecuta
  performed_by_employee_id BIGINT NULL REFERENCES public.employees(id),
  performed_by_provider TEXT NULL,
  cost NUMERIC(14,2) NULL,
  currency TEXT NULL DEFAULT 'MXN',
  -- calibracion (ISO 6.5 trazabilidad metrologica)
  calibration_certificate_no TEXT NULL,
  calibration_due_on DATE NULL,
  -- baja
  disposal_reason_id BIGINT NULL REFERENCES public.helpdesk_disposal_reasons(id),
  -- reubicacion
  from_location_id BIGINT NULL REFERENCES public.helpdesk_locations(id),
  to_location_id BIGINT NULL REFERENCES public.helpdesk_locations(id),
  notes TEXT NULL,
  -- acta/reporte generado automaticamente (se enlaza tras crear el documento)
  generated_act_document_id BIGINT NULL REFERENCES public.helpdesk_asset_documents(id) ON DELETE SET NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hd_lifecycle_events_asset
  ON public.helpdesk_asset_lifecycle_events (asset_id, event_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_hd_lifecycle_events_type
  ON public.helpdesk_asset_lifecycle_events (event_type_id);

-- Alinear la secuencia con el maximo id existente (mismo patron que 20260620_01).
SELECT setval(
  'public.helpdesk_lifecycle_event_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_asset_lifecycle_events), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_asset_lifecycle_events), 0) > 0
);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260622_03_helpdesk_lifecycle_events.sql', '49a8fc237e3175aa054be0426e107c75791c776c50cdb68e88d6afd4b71f7f7c') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260622_04_helpdesk_asset_documents_evidence.sql
-- ---------------------------------------------------------------------
BEGIN;
-- =====================================================================
-- HD-ISO-04: Construye la tabla helpdesk_asset_documents (existente pero sin uso)
-- como sistema de evidencias: enlace a evento de ciclo de vida, categoria
-- (document_kind), y versionado portado de employee_documents.
-- =====================================================================

ALTER TABLE public.helpdesk_asset_documents
  ADD COLUMN IF NOT EXISTS lifecycle_event_id BIGINT NULL
    REFERENCES public.helpdesk_asset_lifecycle_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_kind_id BIGINT NULL
    REFERENCES public.helpdesk_document_kinds(id),
  ADD COLUMN IF NOT EXISTS reference_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS replaces_document_id BIGINT NULL
    REFERENCES public.helpdesk_asset_documents(id),
  ADD COLUMN IF NOT EXISTS issued_on DATE NULL,
  ADD COLUMN IF NOT EXISTS expires_on DATE NULL;

CREATE INDEX IF NOT EXISTS ix_hd_asset_docs_event
  ON public.helpdesk_asset_documents (lifecycle_event_id);

CREATE INDEX IF NOT EXISTS ix_hd_asset_docs_current
  ON public.helpdesk_asset_documents (asset_id, is_current);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260622_04_helpdesk_asset_documents_evidence.sql', '627c16206d88f6dc963c01f5f9351f3f9675a9ab3c6d7f881026cbb5028994bc') ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- 20260623_01_helpdesk_hardening.sql
-- ---------------------------------------------------------------------
BEGIN;
-- =====================================================================
-- Endurecimiento Help Desk MVP (2a capa):
--  1) Indice parcial de SLA para el reporte de tickets "vencidos"
--     (consulta `due_at < NOW()` en helpdesk-ticket.read).
--  2) CHECK de estado de ordenes de mantenimiento. Los valores de `status`
--     son 100% controlados por codigo (start/reschedule/close), por lo que
--     restringirlos a nivel BD es seguro y atrapa estados invalidos.
--
-- NOTA: NO se agrega CHECK sobre `risk_level` ni `order_checklist.result`:
-- el schema (helpdesk.schema.ts) deja esos campos como texto libre a proposito,
-- y un CHECK los romperia. Decision documentada, no omision.
-- =====================================================================

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_due_at
  ON public.helpdesk_tickets (due_at)
  WHERE due_at IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_helpdesk_maintenance_orders_status'
  ) THEN
    ALTER TABLE public.helpdesk_maintenance_orders
      ADD CONSTRAINT chk_helpdesk_maintenance_orders_status
      CHECK (status IN ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS', 'CLOSED'));
  END IF;
END $$;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260623_01_helpdesk_hardening.sql', 'd6ae35cca0c1b7bb50e48105ef7b4ca0c66c998c3bb18bd69e6be6f9c192b22c') ON CONFLICT (filename) DO NOTHING;
COMMIT;
