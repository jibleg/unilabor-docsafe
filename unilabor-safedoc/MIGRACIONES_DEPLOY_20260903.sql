-- MIGRACIONES_DEPLOY_20260903.sql (v2) — aplicar por pgAdmin en prod (sgc.unilabor-app.com)
-- Consolida 20260828_01..07 + 20260831_01..07 + 20260902_01..03 en UNA transaccion y las
-- registra en schema_migrations con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260825_02:
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- Si una ya estuviera aplicada, el INSERT o el DDL abortara y hara ROLLBACK completo.
BEGIN;

-- ============ 20260828_01_rh_induction_positions.sql ============
-- =============================================================================
-- RH - Induccion por puesto (ISO 15189:2022 6.2): Bloque 0, catalogo de puestos
--
-- Base para el modulo de induccion (7 fases, REH-MAN-002): catalogo minimo de
-- puesto/categoria (nombre + documentos obligatorios + competencias tecnicas,
-- SIN replicar la ficha completa de REH-MAN-001) y la relacion real
-- colaborador<->puesto, que es M:N (un colaborador puede tener 2+ puestos
-- activos a la vez). `employees.position` (texto libre) NO se toca: sigue
-- mostrandose donde ya se muestra, solo deja de ser el insumo de induccion.
--
-- 100% ADITIVA: 4 tablas nuevas + 1 columna NULL-able en `documents` + 2
-- permisos + otorgamiento a roles RH existentes. No modifica ninguna tabla
-- existente salvo el ADD COLUMN aditivo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catalogo de puestos/categorias
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_positions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_positions_code
  ON public.rh_positions (UPPER(code));

CREATE INDEX IF NOT EXISTS idx_rh_positions_active
  ON public.rh_positions (is_active);

-- ---------------------------------------------------------------------------
-- 2. Competencias tecnicas del puesto (alimenta la seleccion aleatoria de
--    Fase 7 / REH-REG-003, columna COMPETENCIA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_position_competencies (
  id BIGSERIAL PRIMARY KEY,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  competency_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_position_competencies_position
  ON public.rh_position_competencies (position_id);

-- ---------------------------------------------------------------------------
-- 3. Documentos obligatorios del puesto (Fase 5: "los documentos de la
--    categoria son los documentos del puesto que debe si o si leer")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_position_documents (
  id BIGSERIAL PRIMARY KEY,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_position_documents
  ON public.rh_position_documents (position_id, document_id);

-- ---------------------------------------------------------------------------
-- 4. Colaborador <-> puesto (M:N real, decision confirmada por el usuario)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_employee_positions (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ended_at TIMESTAMPTZ NULL,
  assigned_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_employee_positions_ended
    CHECK (is_active OR ended_at IS NOT NULL)
);

-- A lo sumo un puesto ACTIVO por (colaborador, puesto) — evita duplicar el
-- mismo puesto dos veces vigente, sin impedir que se reasigne tras terminarlo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_employee_positions_active
  ON public.rh_employee_positions (employee_id, position_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_rh_employee_positions_employee
  ON public.rh_employee_positions (employee_id);

CREATE INDEX IF NOT EXISTS idx_rh_employee_positions_position
  ON public.rh_employee_positions (position_id);

-- ---------------------------------------------------------------------------
-- 5. Codigo de documento SGC (ej. "REH-INS-001"), columna NULL-able en
--    `documents`. Sin unicidad forzada: versiones historicas superseded
--    podrian compartir codigo con la vigente. Se etiqueta manualmente desde
--    la UI de Calidad al implementar (sin importador automatico).
-- ---------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_code
  ON public.documents (UPPER(code))
  WHERE code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. RBAC
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT
  src.code,
  m.id,
  split_part(src.code, '.', 2),
  split_part(src.code, '.', 3),
  src.description
FROM (
  VALUES
    ('RH.INDUCTION.MANAGE', 'RH',
     'Administrar puestos, competencias, documentos por puesto e inducciones de colaboradores'),
    ('RH.SELF.INDUCTION',   'RH',
     'Ver mi propio progreso de induccion por puesto')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('RH_VIEWER', 'RH.SELF.INDUCTION'),
    ('RH_EDITOR', 'RH.INDUCTION.MANAGE'),
    ('RH_EDITOR', 'RH.SELF.INDUCTION'),
    ('RH_ADMIN',  'RH.INDUCTION.MANAGE'),
    ('RH_ADMIN',  'RH.SELF.INDUCTION')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT to_regclass('public.rh_positions'), to_regclass('public.rh_position_competencies'),
--          to_regclass('public.rh_position_documents'), to_regclass('public.rh_employee_positions');
--   SELECT column_name FROM information_schema.columns WHERE table_name='documents' AND column_name='code';
--   SELECT code FROM public.permissions WHERE code LIKE 'RH.INDUCTION%' OR code = 'RH.SELF.INDUCTION';
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260828_01_rh_induction_positions.sql', '1def71318a46da206289d5f77a4e9db4a186da9c602f9b61d789a881b5d257d5');

-- ============ 20260828_02_rh_induction_phases.sql ============
-- =============================================================================
-- RH - Induccion por puesto (ISO 15189:2022 6.2): Bloque 1, Fases 1-4
-- (institucionales, iguales para todo colaborador)
--
-- Cada fase institucional se modela como una fila de `training_courses`: reusa
-- integro el motor de Evaluaciones (plantilla con passing_score=80, asignacion,
-- calificacion) y el de constancias (certificate_templates con N firmantes,
-- archivo automatico en expediente) sin tocarles una linea. Lo unico nuevo es
-- la capa de induccion: que fase le toca a cada colaborador, que documentos
-- del SGC debe leer antes de poder presentar la evaluacion de esa fase, y el
-- amarre a los acuses reales de Sala de Lectura (quality_reading_acknowledgements)
-- que ya traen el gate anti-fraude de lectura resuelto.
--
-- 100% ADITIVA: 4 tablas nuevas + siembra de catalogo fijo (7 fases) + 4
-- `training_courses` (Fases 1-4). No modifica ninguna tabla existente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catalogo fijo de las 7 fases (REH-MAN-002 §6.2.2.6 a 6.2.2.13)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_phases (
  id BIGSERIAL PRIMARY KEY,
  phase_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  responsible_label TEXT NOT NULL,
  scope TEXT NOT NULL,
  -- Solo se llena para fases INSTITUTIONAL (1-4): una unica training_course
  -- para todos. Las fases POSITION (5-7) se resuelven por puesto en
  -- `rh_induction_phase_positions` (bloque futuro), aqui queda NULL.
  training_course_id BIGINT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_induction_phases_number CHECK (phase_number BETWEEN 1 AND 7),
  CONSTRAINT chk_rh_induction_phases_scope CHECK (scope IN ('INSTITUTIONAL', 'POSITION'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_phases_number
  ON public.rh_induction_phases (phase_number);

-- ---------------------------------------------------------------------------
-- 2. Documentos obligatorios por fase institucional (los 16 documentos que
--    diste, mapeados tema por tema; se enlazan por codigo desde el backend
--    una vez que `documents.code` este poblado — ver Bloque 0)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_phase_documents (
  id BIGSERIAL PRIMARY KEY,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_phase_documents
  ON public.rh_induction_phase_documents (phase_id, document_id);

-- ---------------------------------------------------------------------------
-- 3. Inscripcion de un colaborador en una fase
--
-- El estado real de la evaluacion vive en `evaluation_assignments` (no se
-- duplica aqui): `evaluation_assignment_id` se llena solo cuando la lectura
-- se completa. Antes de eso, "en que va" se deriva de
-- `reading_completed_at IS NULL` (leyendo) vs no-NULL (ya puede evaluarse).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_enrollments (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE RESTRICT,
  reading_completed_at TIMESTAMPTZ NULL,
  evaluation_assignment_id BIGINT NULL REFERENCES public.evaluation_assignments(id) ON DELETE SET NULL,
  enrolled_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un colaborador solo se inscribe una vez por fase (reintentos de evaluacion
-- vencida/reprobada se resuelven dentro del propio evaluation_assignments,
-- que ya soporta reintento — no se crea otra inscripcion).
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_enrollments
  ON public.rh_induction_enrollments (employee_id, phase_id);

CREATE INDEX IF NOT EXISTS idx_rh_induction_enrollments_employee
  ON public.rh_induction_enrollments (employee_id);

CREATE INDEX IF NOT EXISTS idx_rh_induction_enrollments_phase
  ON public.rh_induction_enrollments (phase_id);

-- ---------------------------------------------------------------------------
-- 4. Documento por documento, el acuse real de Sala de Lectura ligado a esta
--    inscripcion. `acknowledgement_id` es la fuente de verdad de si ya se leyo
--    y firmo (se consulta en vivo contra quality_reading_acknowledgements.status,
--    nunca se duplica aqui).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_reading_items (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES public.rh_induction_enrollments(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  acknowledgement_id BIGINT NULL REFERENCES public.quality_reading_acknowledgements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_reading_items
  ON public.rh_induction_reading_items (enrollment_id, document_id);

CREATE INDEX IF NOT EXISTS idx_rh_induction_reading_items_enrollment
  ON public.rh_induction_reading_items (enrollment_id);

CREATE INDEX IF NOT EXISTS idx_rh_induction_reading_items_ack
  ON public.rh_induction_reading_items (acknowledgement_id);

-- ---------------------------------------------------------------------------
-- 5. Siembra: 4 training_courses (Fases 1-4), certificado sin vencimiento (es
--    autorizacion, no capacitacion recurrente) — RH autora el cuestionario y
--    configura las 3 firmas (Director General/RH/Responsable de fase) desde
--    la UI YA EXISTENTE de Evaluaciones, sin pantallas nuevas para esto.
-- ---------------------------------------------------------------------------
INSERT INTO public.training_courses (code, title, description, certificate_validity_months)
SELECT src.code, src.title, src.description, 0
FROM (
  VALUES
    ('INDUCCION-FASE-1', 'Fase 1 - Bienvenida e induccion institucional',
     'Reglamento interno, codigo de conducta, confidencialidad, principios eticos e imparcialidad.'),
    ('INDUCCION-FASE-2', 'Fase 2 - Induccion al Sistema de Gestion de Calidad',
     'Manual de Calidad, control de documentos/registros, gestion de riesgos, no conformidades y trabajo no conforme.'),
    ('INDUCCION-FASE-3', 'Fase 3 - Salud y bioseguridad',
     'Seguridad e higiene y manejo de Residuos Peligrosos Biologico-Infecciosos (RPBI).'),
    ('INDUCCION-FASE-4', 'Fase 4 - Sistema informatico del laboratorio',
     'Control de datos y gestion de la informacion del SIL.')
) AS src(code, title, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.training_courses existing WHERE existing.code = src.code
);

-- ---------------------------------------------------------------------------
-- 6. Siembra: catalogo fijo de las 7 fases, ligando las institucionales (1-4)
--    a la training_course recien sembrada.
-- ---------------------------------------------------------------------------
INSERT INTO public.rh_induction_phases (phase_number, name, responsible_label, scope, training_course_id)
SELECT src.phase_number, src.name, src.responsible_label, src.scope, tc.id
FROM (
  VALUES
    (1, 'Bienvenida e induccion institucional', 'Coordinacion de RH',      'INSTITUTIONAL', 'INDUCCION-FASE-1'),
    (2, 'Induccion al SGC',                     'Coordinacion de Calidad', 'INSTITUTIONAL', 'INDUCCION-FASE-2'),
    (3, 'Salud y bioseguridad',                 'Supervision de Bioseguridad', 'INSTITUTIONAL', 'INDUCCION-FASE-3'),
    (4, 'Sistema informatico del laboratorio',  'Coordinacion SIL',        'INSTITUTIONAL', 'INDUCCION-FASE-4'),
    (5, 'Induccion tecnica por area/puesto',    'Coordinador de area',     'POSITION', NULL),
    (6, 'Capacitacion practica supervisada',    'Coordinador de area',     'POSITION', NULL),
    (7, 'Evaluacion de competencia inicial',    'Coordinador de area',     'POSITION', NULL)
) AS src(phase_number, name, responsible_label, scope, training_course_code)
LEFT JOIN public.training_courses tc ON tc.code = src.training_course_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_induction_phases existing WHERE existing.phase_number = src.phase_number
);


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT phase_number, name, scope, training_course_id FROM public.rh_induction_phases ORDER BY phase_number;
--   SELECT code, title FROM public.training_courses WHERE code LIKE 'INDUCCION-FASE-%' ORDER BY code;
--   SELECT to_regclass('public.rh_induction_phase_documents'), to_regclass('public.rh_induction_enrollments'),
--          to_regclass('public.rh_induction_reading_items');
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260828_02_rh_induction_phases.sql', '76a2ccdf681b61baf57b8a292196a1156a3d26dcdd67dc1d062722f756e70295');

-- ============ 20260828_03_notification_log_whatsapp_channel.sql ============
-- =============================================================================
-- Agrega 'whatsapp' como canal valido de notification_log (integracion Whapi
-- Cloud, usada primero por el modulo de induccion para avisar al responsable
-- de fase). 100% ADITIVA: solo amplia el CHECK existente, no borra datos.
-- =============================================================================

ALTER TABLE public.notification_log
  DROP CONSTRAINT IF EXISTS chk_notification_channel;

ALTER TABLE public.notification_log
  ADD CONSTRAINT chk_notification_channel CHECK (channel IN ('email', 'sms', 'whatsapp'));


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname = 'chk_notification_channel';
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260828_03_notification_log_whatsapp_channel.sql', 'd3cef1043fd61ac6cd0e63806210704bf2548175fde77007daac201101fee5a5');

-- ============ 20260828_04_rh_induction_phase_contact.sql ============
-- =============================================================================
-- Contacto del responsable de fase (nombre + telefono), para poder avisarle
-- por WhatsApp (Whapi Cloud) cuando un colaborador queda listo para su
-- evaluacion. RH lo captura manualmente por fase (arranca vacio/NULL, no
-- bloquea nada si no se configura: la notificacion simplemente se omite).
-- 100% ADITIVA.
-- =============================================================================

ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS responsible_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS responsible_phone TEXT NULL;


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'rh_induction_phases' AND column_name IN ('responsible_name', 'responsible_phone');
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260828_04_rh_induction_phase_contact.sql', 'f759aee1b4430391b571740ed5605f5b3258f3d0361e77264d399e722d290259');

-- ============ 20260828_05_certificate_templates_optional_folio.sql ============
-- =============================================================================
-- Constancias: el folio se vuelve opcional por plantilla (decision del usuario
-- para el modulo de Induccion, donde la constancia se identifica solo por el
-- nombre del colaborador, sin codigo). Default TRUE: ninguna capacitacion
-- existente cambia de comportamiento salvo que alguien lo desactive a proposito.
-- 100% ADITIVA.
-- =============================================================================

ALTER TABLE public.certificate_templates
  ADD COLUMN IF NOT EXISTS show_folio BOOLEAN NOT NULL DEFAULT TRUE;


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT column_name, column_default FROM information_schema.columns
--     WHERE table_name = 'certificate_templates' AND column_name = 'show_folio';
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260828_05_certificate_templates_optional_folio.sql', '1fb0e9798bf46599a636b525cd08c745a5e839615b61be94c79bf3f8d358a4f3');

-- ============ 20260828_06_quality_viewer_backfill.sql ============
-- =============================================================================
-- Otorga QUALITY_VIEWER a todo colaborador con usuario vinculado que hoy no
-- tenga ningun rol del modulo QUALITY. Es el minimo necesario para poder leer
-- y firmar en Sala de Lectura (permiso QUALITY.SELF.READING), requisito real
-- para el modulo de Induccion (Bloque 1). NO toca a quien ya tiene
-- QUALITY_ADMIN/EDITOR/VIEWER/READER/READING_MANAGER (no se degrada ni
-- duplica acceso). 100% ADITIVA, idempotente (ON CONFLICT DO NOTHING).
-- =============================================================================

INSERT INTO public.user_roles (user_id, role_id, is_active)
SELECT DISTINCT e.user_id, r.id, TRUE
FROM public.employees e
INNER JOIN public.roles r ON UPPER(r.code) = 'QUALITY_VIEWER'
WHERE e.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.roles existing_role ON existing_role.id = ur.role_id
    WHERE ur.user_id = e.user_id
      AND ur.is_active = TRUE
      AND existing_role.module_id = r.module_id
  )
ON CONFLICT (user_id, role_id) DO NOTHING;


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT COUNT(DISTINCT e.id) FROM employees e WHERE e.user_id IS NOT NULL; -- total vinculados
--   SELECT COUNT(DISTINCT e.id) FROM employees e
--     INNER JOIN user_roles ur ON ur.user_id = e.user_id AND ur.is_active = TRUE
--     INNER JOIN roles r ON r.id = ur.role_id
--     WHERE e.user_id IS NOT NULL AND r.module_id = (SELECT id FROM modules WHERE code = 'QUALITY');
--     -- debe ser igual al total vinculados
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260828_06_quality_viewer_backfill.sql', 'f9435aee02bccc28c2004c6f978f84d99e81b79a7e39c203b7c870376b3d9016');

-- ============ 20260828_07_rh_induction_master_record.sql ============
-- =============================================================================
-- RH - Induccion por puesto: Formato de Induccion consolidado (REH-REG-005)
--
-- Agrega, sobre lo ya construido en Bloque 1 (Fases 1-4), las 3 piezas que la
-- hoja INDUCCION de REH-REG-005 pide y que todavia no existian: checklist de
-- contenidos por fase, columna SUPERVISOR por inscripcion, y el bloque de
-- EFICACIA DEL PROGRAMA DE INDUCCION que la ema exige y el manual REH-MAN-002
-- no contempla. El reporte consolidado en si (que agrega esto + lo que ya
-- calculan getEmployeeInductionProgress/listPhaseEnrollments) vive en codigo,
-- no en SQL.
--
-- 100% ADITIVA: 2 tablas nuevas + 1 columna nueva en rh_induction_enrollments.
-- No modifica ninguna otra tabla existente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catalogo de contenidos por fase ("CONTENIDO DE CADA FASE, marque conforme
--    se imparta" - hoja INDUCCION filas 35-78 de REH-REG-005). Se siembra
--    exacto para las Fases 1-4 (las unicas construidas hoy); editable despues
--    por RH, mismo patron que rh_induction_phase_documents.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_phase_checklist_items (
  id BIGSERIAL PRIMARY KEY,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_induction_checklist_items_phase
  ON public.rh_induction_phase_checklist_items (phase_id);

-- ---------------------------------------------------------------------------
-- 2. Progreso del checklist por inscripcion (quien lo marco y cuando).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_checklist_progress (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES public.rh_induction_enrollments(id) ON DELETE CASCADE,
  checklist_item_id BIGINT NOT NULL REFERENCES public.rh_induction_phase_checklist_items(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_checklist_progress
  ON public.rh_induction_checklist_progress (enrollment_id, checklist_item_id);

-- ---------------------------------------------------------------------------
-- 3. Columna SUPERVISOR de la tabla de 7 fases (la ema exige "personal en
--    induccion supervisado en todo momento"; el manual solo lo preveia en
--    Fases 5-6). Campo libre, no obligatorio.
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS supervisor_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. EFICACIA DEL PROGRAMA DE INDUCCION (hoja INDUCCION filas 101-110). La ema
--    la exige expresamente y el manual no la tiene; RH la captura cuando
--    corresponde (no hay gate automatico todavia, Fase 7 no existe).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_induction_effectiveness_reviews (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  method TEXT NOT NULL,
  result_percentage NUMERIC(5, 2) NULL,
  performs_as_expected BOOLEAN NULL,
  evidence_notes TEXT NULL,
  reviewed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_induction_effectiveness_employee
  ON public.rh_induction_effectiveness_reviews (employee_id);

-- ---------------------------------------------------------------------------
-- 5. Siembra del checklist de contenidos, exacto de la hoja INDUCCION.
-- ---------------------------------------------------------------------------
INSERT INTO public.rh_induction_phase_checklist_items (phase_id, item_text, sort_order)
SELECT p.id, src.item_text, src.sort_order
FROM public.rh_induction_phases p
INNER JOIN (
  VALUES
    (1, 'Recepción del colaborador', 1),
    (1, 'Alta en reloj biométrico', 2),
    (1, 'Bienvenida formal', 3),
    (1, 'Presentación del jefe inmediato', 4),
    (1, 'Presentación del equipo de trabajo', 5),
    (1, 'Entrega de documentos internos', 6),
    (1, 'Recorrido por instalaciones', 7),
    (1, 'Organigrama y líneas de autoridad', 8),
    (1, 'Normas internas y disciplinarias', 9),
    (1, 'Código de vestimenta', 10),
    (1, 'Confidencialidad y aviso de privacidad', 11),
    (2, 'Historia de UNILABOR®', 1),
    (2, 'Misión, visión y valores', 2),
    (2, 'Política de calidad', 3),
    (2, 'Objetivos de calidad', 4),
    (2, 'Introducción a la ISO 15189:2022', 5),
    (2, 'Mapa de procesos', 6),
    (2, 'Indicadores de calidad', 7),
    (2, 'Control de documentos', 8),
    (2, 'Control de registros', 9),
    (2, 'Gestión de riesgos', 10),
    (2, 'Trabajo no conforme', 11),
    (3, 'Identificación de riesgos', 1),
    (3, 'Uso de equipo de protección personal (EPP)', 2),
    (3, 'Higiene y control de infecciones', 3),
    (3, 'Manejo de residuos peligrosos biológico-infecciosos (RPBI)', 4),
    (3, 'Servicios de salud laboral, manejo de accidentes y emergencias', 5),
    (4, 'Acceso al sistema LIS', 1),
    (4, 'Seguridad informática', 2),
    (4, 'Registro de pacientes', 3),
    (4, 'Gestión del proceso analítico', 4),
    (4, 'Validación y liberación de resultados', 5),
    (4, 'Control de calidad en el sistema', 6),
    (4, 'Gestión documental y reportes', 7),
    (4, 'Continuidad operativa', 8),
    (4, 'Inducción básica al módulo de almacén (inventarios)', 9)
) AS src(phase_number, item_text, sort_order) ON src.phase_number = p.phase_number
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_induction_phase_checklist_items existing
   WHERE existing.phase_id = p.id AND existing.item_text = src.item_text
);


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT p.phase_number, COUNT(*) FROM public.rh_induction_phase_checklist_items c
--     INNER JOIN public.rh_induction_phases p ON p.id = c.phase_id
--    GROUP BY p.phase_number ORDER BY p.phase_number;
--   -- Esperado: 1=11, 2=11, 3=5, 4=9
--   SELECT to_regclass('public.rh_induction_checklist_progress'),
--          to_regclass('public.rh_induction_effectiveness_reviews');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'rh_induction_enrollments' AND column_name = 'supervisor_employee_id';
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260828_07_rh_induction_master_record.sql', 'a57e6ea031cf0bf03e9d5aa3f2fadc0afafe2eca8a2892631de3bf48dda1a2e3');

-- ============ 20260831_01_rh_question_bank.sql ============
-- =============================================================================
-- RH - Induccion por puesto: banco de preguntas generado por IA
--
-- RH hoy escribe a mano cada pregunta de las evaluaciones de Fases 1-4 en
-- EvaluationTemplateEditorModal. Este banco es una capa de staging/curacion:
-- el backend genera preguntas candidatas con la API de Claude a partir del
-- texto de los documentos obligatorios de la fase, y quedan PENDING_REVIEW
-- hasta que RH las aprueba/edita/descarta. Solo entonces se copian (desde el
-- frontend) al arreglo de preguntas real de la plantilla, que se persiste con
-- el endpoint YA EXISTENTE PUT /templates/:templateId/questions — este banco
-- nunca escribe directo en evaluation_questions.
--
-- Reusa el permiso RH.INDUCTION.MANAGE (ya otorgado a RH_ADMIN/RH_EDITOR en
-- 20260828_01) en vez de crear uno nuevo: son los mismos actores que ya
-- administran fases, documentos y evaluaciones de induccion.
--
-- 100% ADITIVA: 2 tablas nuevas. No modifica ninguna tabla existente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Una fila por corrida de generacion (trazabilidad ISO: quien, cuando, de
--    que documentos, con que modelo).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_question_bank_batches (
  id BIGSERIAL PRIMARY KEY,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  document_ids UUID[] NOT NULL,
  requested_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT NULL,
  question_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_question_bank_batches_status CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_rh_question_bank_batches_phase
  ON public.rh_question_bank_batches (phase_id);

-- ---------------------------------------------------------------------------
-- 2. Una fila por pregunta candidata. `options` es JSONB (no tabla
--    relacional): esta tabla es solo staging, nunca la consulta el motor de
--    examen (evaluation_assignment_questions), asi que no necesita el mismo
--    modelo relacional que evaluation_question_options.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_question_bank_items (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES public.rh_question_bank_batches(id) ON DELETE CASCADE,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  document_id UUID NULL REFERENCES public.documents(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Mismos tipos que evaluation_questions.type (training.schema.ts / types/index.ts).
  CONSTRAINT chk_rh_question_bank_items_type CHECK (type IN ('single', 'multiple', 'boolean', 'open')),
  CONSTRAINT chk_rh_question_bank_items_status CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_rh_question_bank_items_phase
  ON public.rh_question_bank_items (phase_id, status);

CREATE INDEX IF NOT EXISTS idx_rh_question_bank_items_batch
  ON public.rh_question_bank_items (batch_id);


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT to_regclass('public.rh_question_bank_batches'), to_regclass('public.rh_question_bank_items');
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260831_01_rh_question_bank.sql', '462f61e4593cfed2f96de5ac10d8efd2032e5d87749a88dbd7807e931e809890');

-- ============ 20260831_02_employees_branch.sql ============
-- =============================================================================
-- RH - Sucursal del colaborador (campo "SUCURSAL" de la constancia de
-- Induccion, ver 20260831_04_certificate_induction_notes.sql)
--
-- Reusa el catalogo YA EXISTENTE de unidades de Helpdesk (helpdesk_asset_units,
-- "unidad de diagnostico") en vez de crear un catalogo nuevo duplicado. No se
-- toca esa tabla, solo se referencia desde employees.
--
-- 100% ADITIVA: 1 columna NULL-able en `employees`. No modifica ninguna
-- tabla existente salvo el ADD COLUMN aditivo.
-- =============================================================================

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS branch_id BIGINT NULL REFERENCES public.helpdesk_asset_units(id);

CREATE INDEX IF NOT EXISTS idx_employees_branch_id
  ON public.employees (branch_id)
  WHERE branch_id IS NOT NULL;


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'employees' AND column_name = 'branch_id';
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260831_02_employees_branch.sql', 'bda2d6743f6558ab162ccbc5fadfad867c188df6c8cd9ff57b805f718bd82308');

-- ============ 20260831_03_rh_induction_phase_duration.sql ============
-- =============================================================================
-- RH - Duracion (horas) por fase de Induccion
--
-- Campo "DURACION" de la constancia de Induccion: es propio de la FASE (no
-- del colaborador ni de la evaluacion) — todos los aprobados de la Fase 1
-- comparten la misma duracion. RH lo edita desde la pagina de fases.
--
-- 100% ADITIVA: 1 columna NULL-able en `rh_induction_phases`. Mismo patron
-- que 20260828_04 (contacto del responsable).
-- =============================================================================

ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(5,1) NULL;


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT phase_number, name, duration_hours FROM public.rh_induction_phases ORDER BY phase_number;
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260831_03_rh_induction_phase_duration.sql', '68e6087f7e86936e65d80d3310174b385fbbdcb19bf8199674551056f0767c89');

-- ============ 20260831_04_prog_ind_fase_types.sql ============
-- =============================================================================
-- RH - Tipos documentales por fase de Induccion en la seccion PROG_IND
--
-- Las constancias de cada fase de Induccion se archivan en el expediente del
-- colaborador dentro de la seccion "Programa de Induccion" (PROG_IND), un tipo
-- documental por fase (IND_FASE_1..7), en orden de fase y con el nombre de la
-- fase — en vez del tipo generico COURSE_CERTIFICATE de la seccion Constancias
-- (que sigue usandose para las capacitaciones normales).
--
-- En prod la seccion PROG_IND ya existe (creada por RH desde la UI) junto con
-- un tipo placeholder BI_INST ("Fase 1 - Bienvenida...") sin documentos: se
-- renombra a IND_FASE_1 (conserva su id, no hay filas que lo referencien) para
-- no duplicar "Fase 1". En una BD sin esa seccion, se crea todo desde cero.
--
-- is_required = FALSE en los tipos sembrados: son constancias auto-generadas
-- al acreditar la fase, no cargas obligatorias — marcarlos requeridos haria
-- que el sistema de alertas de expediente los reclamara a todo colaborador.
-- =============================================================================

-- 1. Seccion PROG_IND (idempotente; en prod ya existe).
INSERT INTO public.document_sections (code, name, description, is_active, sort_order)
SELECT 'PROG_IND', 'Programa de Inducción',
       'Constancias y formatos del programa de induccion por fases (ISO 15189:2022 6.2).',
       TRUE, 15
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_sections WHERE UPPER(code) = 'PROG_IND'
);

-- 2. El placeholder BI_INST creado a mano en prod ES la Fase 1: se renombra a
--    IND_FASE_1 (mismo id, cero documentos lo usan) para no sembrar un duplicado.
UPDATE public.document_types
   SET code = 'IND_FASE_1', is_required = FALSE, updated_at = NOW()
 WHERE UPPER(code) = 'BI_INST'
   AND section_id = (SELECT id FROM public.document_sections WHERE UPPER(code) = 'PROG_IND')
   AND NOT EXISTS (SELECT 1 FROM public.document_types WHERE UPPER(code) = 'IND_FASE_1');

-- 3. Un tipo por fase (nombre y orden tomados del catalogo rh_induction_phases).
--    sort_order = 10 * numero de fase, para que FORMA_INDUCC (sort 1) siga primero
--    y las fases queden en orden 1..7 entre si.
INSERT INTO public.document_types (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_active, sort_order)
SELECT
  s.id,
  'IND_FASE_' || p.phase_number,
  'Fase ' || p.phase_number || ' - ' || p.name,
  'Constancia de aprobacion de la fase ' || p.phase_number || ' del programa de induccion (generada automaticamente).',
  FALSE, FALSE, FALSE, TRUE,
  10 * p.phase_number
FROM public.rh_induction_phases p
CROSS JOIN (SELECT id FROM public.document_sections WHERE UPPER(code) = 'PROG_IND') s
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_types dt WHERE UPPER(dt.code) = 'IND_FASE_' || p.phase_number
);

-- 4. Normaliza nombre/orden del tipo de Fase 1 renombrado en el paso 2 (quedo
--    con el nombre manual de RH y sort 2).
UPDATE public.document_types dt
   SET name = 'Fase ' || p.phase_number || ' - ' || p.name,
       sort_order = 10 * p.phase_number,
       updated_at = NOW()
  FROM public.rh_induction_phases p
 WHERE UPPER(dt.code) = 'IND_FASE_' || p.phase_number
   AND (dt.name <> 'Fase ' || p.phase_number || ' - ' || p.name OR dt.sort_order <> 10 * p.phase_number);


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT dt.code, dt.name, dt.sort_order, dt.is_required
--     FROM public.document_types dt
--     JOIN public.document_sections s ON s.id = dt.section_id
--    WHERE UPPER(s.code) = 'PROG_IND' ORDER BY dt.sort_order;
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260831_04_prog_ind_fase_types.sql', '2a729ab2f38f83d7c669e6a7fcb7cd168129cbe9ada36d70312e44addeaccb8f');

-- ============ 20260831_05_rh_induction_closure.sql ============
-- =============================================================================
-- RH - Cierre formal del Formato de Induccion (REH-REG-005)
--
-- Convierte el master record (reporte de avance del Bloque 1.5) en la
-- EVIDENCIA DOCUMENTAL final del proceso de induccion: RH cierra el registro
-- con 3 firmas digitales (Colaborador / Coordinacion de RH / Coordinador del
-- area), se genera el PDF definitivo y se archiva en el expediente bajo el
-- tipo FORMA_INDUCC de la seccion PROG_IND.
--
-- Cierre por etapas (decision del usuario): hoy el dictamen positivo es
-- APROBADA_INSTITUCIONAL (Fases 1-4, unicas construidas); cuando exista el
-- Bloque REH-REG-003 (Fases 5-7) el dictamen definitivo sera
-- APROBADA_COMPLETA. NO_APROBADA procede en cualquier momento con motivo.
--
-- Un cierre nunca se borra: una correccion genera un cierre nuevo y el
-- anterior queda is_current = FALSE (el documento archivado se versiona por
-- el mecanismo normal del expediente).
-- =============================================================================

-- 1. Tipo documental FORMA_INDUCC en PROG_IND. En prod ya existe (creado por
--    RH desde la UI); esta siembra lo garantiza en cualquier BD.
INSERT INTO public.document_types (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_active, sort_order)
SELECT s.id, 'FORMA_INDUCC', 'Formato de inducción',
       'Registro transversal de las 7 fases del programa de induccion (REH-REG-005), archivado al cerrar el proceso.',
       FALSE, FALSE, FALSE, TRUE, 1
FROM (SELECT id FROM public.document_sections WHERE UPPER(code) = 'PROG_IND') s
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_types WHERE UPPER(code) = 'FORMA_INDUCC'
);

-- 2. Cierres del registro de induccion.
CREATE TABLE IF NOT EXISTS public.rh_induction_record_closures (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  closing_notes TEXT NULL,
  collaborator_signature_path TEXT NOT NULL,
  rh_signature_path TEXT NOT NULL,
  area_signature_path TEXT NOT NULL,
  rh_signatory_name TEXT NOT NULL,
  area_signatory_name TEXT NOT NULL,
  closed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  document_id BIGINT NULL REFERENCES public.employee_documents(id) ON DELETE SET NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_induction_closures_verdict
    CHECK (verdict IN ('APROBADA_INSTITUCIONAL', 'APROBADA_COMPLETA', 'NO_APROBADA'))
);

-- Un solo cierre vigente por colaborador.
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_closures_current
  ON public.rh_induction_record_closures (employee_id)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_rh_induction_closures_employee
  ON public.rh_induction_record_closures (employee_id);


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT to_regclass('public.rh_induction_record_closures');
--   SELECT dt.code, s.code FROM public.document_types dt
--     JOIN public.document_sections s ON s.id = dt.section_id
--    WHERE UPPER(dt.code) = 'FORMA_INDUCC';
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260831_05_rh_induction_closure.sql', 'e64109ffc1329c4ba839bd0236669da8e9bf953acb448048255d11bed3793ba3');

-- ============ 20260831_06_rh_competency_evaluation.sql ============
-- =============================================================================
-- RH - Evaluacion de competencia tecnica, desempeno laboral y conocimientos
--     (REH-REG-003) — CR-02/03: modelo de datos
--
-- Instrumento de la Fase 7 de Induccion y de la reevaluacion anual que exige
-- la ema (GEV-GU-DT-001: competencia al menos cada 12 meses). Tres secciones
-- ponderadas (competencia 50% / desempeno 20% / conocimiento 30%), items
-- valorados por criticidad (A=5, M=3, B=1) con calificacion 1-4, regla de
-- VETO (una competencia de criticidad A con calif < 3 dictamina NO COMPETENTE
-- aunque el porcentaje global apruebe) y dictamen por bandas:
--   >= 90 COMPETENTE_Y_AUTORIZADO | 80-89 COMPETENTE_CON_OBSERVACIONES
--   70-79 COMPETENTE_BAJO_SUPERVISION | < 70 NO_COMPETENTE
-- Todo el calculo vive en el backend (rh-competency-evaluation.service.ts);
-- aqui solo se persisten los resultados sellados al cerrar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Criticidad en las competencias del puesto (CR-02). Default M: el valor
--    intermedio, RH ajusta puesto por puesto.
-- ---------------------------------------------------------------------------
ALTER TABLE public.rh_position_competencies
  ADD COLUMN IF NOT EXISTS criticality TEXT NOT NULL DEFAULT 'M';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_rh_position_competencies_criticality'
  ) THEN
    ALTER TABLE public.rh_position_competencies
      ADD CONSTRAINT chk_rh_position_competencies_criticality CHECK (criticality IN ('A', 'M', 'B'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Catalogo de criterios de desempeno (los 7 precargados del REH-REG-003).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_performance_criteria (
  id BIGSERIAL PRIMARY KEY,
  criterion_text TEXT NOT NULL,
  criticality TEXT NOT NULL DEFAULT 'M',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_performance_criteria_criticality CHECK (criticality IN ('A', 'M', 'B'))
);

INSERT INTO public.rh_performance_criteria (criterion_text, criticality, sort_order)
SELECT src.criterion_text, src.criticality, src.sort_order
FROM (
  VALUES
    ('Puntualidad y asistencia',     'M', 1),
    ('Trabajo en equipo',            'B', 2),
    ('Cumplimiento de actividades',  'A', 3),
    ('Confidencialidad',             'A', 4),
    ('Responsabilidad',              'M', 5),
    ('Actitud de servicio',          'M', 6),
    ('Apego a procesos',             'A', 7)
) AS src(criterion_text, criticality, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.rh_performance_criteria);

-- ---------------------------------------------------------------------------
-- 3. Evaluaciones (una por corrida; DRAFT mientras se captura, CLOSED al
--    firmarse — los resultados se sellan al cerrar).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_competency_evaluations (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE RESTRICT,
  evaluation_type TEXT NOT NULL,
  evaluation_date DATE NOT NULL,
  evaluator_name TEXT NOT NULL,
  reference_course_id BIGINT NULL REFERENCES public.training_courses(id) ON DELETE SET NULL,
  reference_course_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',

  -- Resultados sellados al cerrar (NULL en borrador).
  competency_pct NUMERIC(5,2) NULL,
  performance_pct NUMERIC(5,2) NULL,
  knowledge_pct NUMERIC(5,2) NULL,
  final_pct NUMERIC(5,2) NULL,
  veto_applied BOOLEAN NOT NULL DEFAULT FALSE,
  dictamen TEXT NULL,
  authorization_result TEXT NULL,
  authorized_at DATE NULL,
  valid_until DATE NULL,

  -- Firmas del cierre (5): rutas PNG + nombres de quienes no son el
  -- colaborador/evaluador (esos nombres ya viven en la fila).
  collaborator_signature_path TEXT NULL,
  evaluator_signature_path TEXT NULL,
  area_signature_path TEXT NULL,
  rh_signature_path TEXT NULL,
  director_signature_path TEXT NULL,
  area_signatory_name TEXT NULL,
  rh_signatory_name TEXT NULL,
  director_signatory_name TEXT NULL,

  document_id BIGINT NULL REFERENCES public.employee_documents(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_comp_eval_type CHECK (evaluation_type IN
    ('INICIAL', 'PERIODICA', 'REEVALUACION', 'CAMBIO_PUESTO', 'POST_CAPACITACION')),
  CONSTRAINT chk_rh_comp_eval_status CHECK (status IN ('DRAFT', 'CLOSED')),
  CONSTRAINT chk_rh_comp_eval_dictamen CHECK (dictamen IS NULL OR dictamen IN
    ('COMPETENTE_Y_AUTORIZADO', 'COMPETENTE_CON_OBSERVACIONES', 'COMPETENTE_BAJO_SUPERVISION', 'NO_COMPETENTE')),
  CONSTRAINT chk_rh_comp_eval_authorization CHECK (authorization_result IS NULL OR authorization_result IN
    ('AUTORIZADO', 'AUTORIZADO_CON_SEGUIMIENTO', 'NO_AUTORIZADO'))
);

CREATE INDEX IF NOT EXISTS idx_rh_comp_eval_employee
  ON public.rh_competency_evaluations (employee_id, status);

CREATE INDEX IF NOT EXISTS idx_rh_comp_eval_valid_until
  ON public.rh_competency_evaluations (valid_until)
  WHERE valid_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Items de las 3 secciones (discriminadas por `section`).
--    COMPETENCIA: item_text + criticality + method + score(1-4) + observations
--    DESEMPENO:   item_text + criticality + score(1-4) + observations
--    CONOCIMIENTO: item_text (pregunta) + criticality + expected/given answer
--                  + is_correct (la calif 4/1 se deriva, no se guarda)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_competency_evaluation_items (
  id BIGSERIAL PRIMARY KEY,
  evaluation_id BIGINT NOT NULL REFERENCES public.rh_competency_evaluations(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  item_text TEXT NOT NULL,
  criticality TEXT NOT NULL DEFAULT 'M',
  method TEXT NULL,
  score INTEGER NULL,
  expected_answer TEXT NULL,
  given_answer TEXT NULL,
  is_correct BOOLEAN NULL,
  observations TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT chk_rh_comp_item_section CHECK (section IN ('COMPETENCIA', 'DESEMPENO', 'CONOCIMIENTO')),
  CONSTRAINT chk_rh_comp_item_criticality CHECK (criticality IN ('A', 'M', 'B')),
  CONSTRAINT chk_rh_comp_item_method CHECK (method IS NULL OR method IN ('OD', 'RR', 'ES', 'EP', 'SI')),
  CONSTRAINT chk_rh_comp_item_score CHECK (score IS NULL OR (score BETWEEN 1 AND 4))
);

CREATE INDEX IF NOT EXISTS idx_rh_comp_items_evaluation
  ON public.rh_competency_evaluation_items (evaluation_id, section);

-- ---------------------------------------------------------------------------
-- 5. Plan de acciones (obligatorio en servicio cuando el dictamen no es
--    COMPETENTE_Y_AUTORIZADO).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_competency_evaluation_actions (
  id BIGSERIAL PRIMARY KEY,
  evaluation_id BIGINT NOT NULL REFERENCES public.rh_competency_evaluations(id) ON DELETE CASCADE,
  improvement_area TEXT NOT NULL,
  required_action TEXT NOT NULL,
  responsible TEXT NULL,
  due_date DATE NULL,
  follow_up TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rh_comp_actions_evaluation
  ON public.rh_competency_evaluation_actions (evaluation_id);

-- ---------------------------------------------------------------------------
-- 6. Tipo documental del registro archivado, en la seccion Competencias
--    laborales (WORK_COMPETENCIES). El PDF archivado lleva expiry_date =
--    vigencia de 12 meses para que las alertas de expediente existentes lo
--    reclamen al vencer (CR-05).
-- ---------------------------------------------------------------------------
INSERT INTO public.document_types (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_active, sort_order)
SELECT s.id, 'COMPETENCY_EVALUATION', 'Evaluación de competencia (REH-REG-003)',
       'Evaluacion de competencia tecnica, desempeno laboral y conocimientos; vigencia de 12 meses.',
       FALSE, FALSE, TRUE, TRUE, 5
FROM (SELECT id FROM public.document_sections WHERE UPPER(code) = 'WORK_COMPETENCIES') s
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_types WHERE UPPER(code) = 'COMPETENCY_EVALUATION'
);

-- ---------------------------------------------------------------------------
-- 7. RBAC: permiso propio (mas amplio que la induccion: tambien reevaluacion
--    anual), otorgado a los mismos roles RH que administran induccion.
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT src.code, m.id, split_part(src.code, '.', 2), split_part(src.code, '.', 3), src.description
FROM (
  VALUES ('RH.COMPETENCY.MANAGE', 'RH',
          'Capturar, cerrar y consultar evaluaciones de competencia (REH-REG-003)')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES ('RH_EDITOR', 'RH.COMPETENCY.MANAGE'), ('RH_ADMIN', 'RH.COMPETENCY.MANAGE')) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT criterion_text, criticality FROM public.rh_performance_criteria ORDER BY sort_order;
--   SELECT to_regclass('public.rh_competency_evaluations'),
--          to_regclass('public.rh_competency_evaluation_items'),
--          to_regclass('public.rh_competency_evaluation_actions');
--   SELECT code FROM public.permissions WHERE code = 'RH.COMPETENCY.MANAGE';
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260831_06_rh_competency_evaluation.sql', 'a3275f59e28211aeda8c64d78499fb6efbf8661612889f48f85c576e4fbad572');

-- ============ 20260831_07_rh_induction_position_phases.sql ============
-- =============================================================================
-- RH - Fases 5 y 6 de Induccion (POSITION: tecnica por puesto y practica
--      supervisada) — el "bloque futuro" previsto en 20260828_02.
--
-- Cada puesto habilita su propia training_course por fase POSITION (5-6), de
-- modo que TODO el motor existente (plantilla de evaluacion quiz/practica,
-- asignacion, calificacion, constancia oficial de Induccion, archivo en
-- PROG_IND) se reusa sin tocarlo:
--   Fase 5: lectura de los documentos del puesto (rh_position_documents) en
--           Sala de Lectura + cuestionario del curso del puesto.
--   Fase 6: practica supervisada -> evaluacion tipo 'practical' (RH captura
--           la calificacion 0-10 en la pantalla existente).
-- La Fase 7 NO usa esta tabla: su instrumento es el REH-REG-003.
--
-- 100% ADITIVA: 1 tabla puente + 1 columna NULL-able en enrollments (el curso
-- resuelto al inscribir, porque para fases POSITION depende del puesto del
-- colaborador y no de la fase).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rh_induction_phase_positions (
  id BIGSERIAL PRIMARY KEY,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  training_course_id BIGINT NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_phase_positions
  ON public.rh_induction_phase_positions (phase_id, position_id);

CREATE INDEX IF NOT EXISTS idx_rh_induction_phase_positions_course
  ON public.rh_induction_phase_positions (training_course_id);

ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS training_course_id BIGINT NULL REFERENCES public.training_courses(id) ON DELETE SET NULL;


-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT to_regclass('public.rh_induction_phase_positions');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'rh_induction_enrollments' AND column_name = 'training_course_id';
-- =============================================================================
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260831_07_rh_induction_position_phases.sql', '6b67ca83c162ea57b67b558e512894dd97d87088fd9410b0448b12f87c35d551');

-- ============ 20260902_01_rh_positions_seed_reh_man_001.sql ============
-- Siembra del catálogo de puestos y sus competencias técnicas desde el
-- REH-MAN-001 Manual de la Organización V.1 (apartado COMPETENCIAS TÉCNICAS de
-- cada descriptiva). Idempotente: si el código de puesto ya existe, no toca nada
-- (ni el puesto ni sus competencias).

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'DG', 'Director General', 10
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'DG')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Planeación y dirección estratégica', 1),
 ('Administración de recursos humanos, financieros, tecnológicos y materiales', 2),
 ('Interpretación de requisitos legales, normativos y de acreditación', 3),
 ('Gestión institucional de riesgos y oportunidades', 4),
 ('Gestión de la imparcialidad y confidencialidad', 5),
 ('Evaluación de indicadores y desempeño organizacional', 6),
 ('Revisión de la eficacia del Sistema de Gestión de la Calidad', 7),
 ('Dirección de la revisión por la dirección', 8),
 ('Gestión de cambios organizacionales', 9),
 ('Gestión de proveedores y servicios externos', 10),
 ('Continuidad operativa y respuesta ante contingencias', 11),
 ('Seguimiento de auditorías, acciones correctivas y oportunidades de mejora', 12),
 ('Evaluación del desempeño de las coordinaciones', 13),
 ('Toma de decisiones basada en evidencia', 14)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CSGC', 'Coordinador del Sistema de Gestión de Calidad', 20
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CSGC')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de la norma ISO 15189:2022', 1),
 ('Sistemas de gestión de calidad (ISO 9001, ISO 15189, etc.)', 2),
 ('Auditorías internas y metodologías de mejora continua (PDCA, Lean, Six Sigma)', 3),
 ('Elaboración y control de documentación del sistema', 4),
 ('Indicadores de gestión de calidad y tableros de control', 5),
 ('Competencias en liderazgo, trabajo en equipo y comunicación efectiva', 6),
 ('Manejo de herramientas digitales para gestión documental y de calidad', 7),
 ('Conocimientos en auditoría interna y externa', 8),
 ('Conocimiento en metodologías para el análisis de causas raíz y solución de problemas (Ishikawa, 5 por qué)', 9),
 ('Conocimiento en análisis masivo de datos a través herramientas como power BI', 10),
 ('Conocimiento de herramienta de gestión Balanced Scorecard', 11),
 ('Conocimiento de indicadore de desempeño KPI´S', 12),
 ('Dominio de guía CLSI c24 a4', 13),
 ('Manejo de paquetería office', 14),
 ('Nivel medio de estadística cuantitativa', 15),
 ('Conocimiento en gestión de operaciones y procesos', 16)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'SBIO', 'Supervisor de Bioseguridad', 30
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'SBIO')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Identificar peligros y evaluar riesgos de bioseguridad', 1),
 ('Definir y verificar controles conforme a la jerarquía de control de riesgos. Supervisar prácticas seguras en las fases preanalítica, analítica y postanalítica', 2),
 ('Gestionar RPBI y verificar su trazabilidad documental', 3),
 ('Seleccionar y supervisar el uso correcto del EPP', 4),
 ('Interpretar hojas de datos de seguridad y compatibilidad química', 5),
 ('Coordinar la respuesta ante derrames, exposiciones y emergencias', 6),
 ('Investigar incidentes y accidentes mediante análisis de causa', 7),
 ('Elaborar programas, procedimientos, listas de verificación e informes', 8),
 ('Impartir capacitación y evaluar su eficacia', 9),
 ('Planear y evaluar simulacros', 10),
 ('Analizar indicadores y tendencias de seguridad', 11),
 ('Verificar equipos y materiales de emergencia dentro de su alcance', 12),
 ('Gestionar acciones correctivas y verificar su eficacia', 13),
 ('Manejar hojas de cálculo, presentaciones y sistemas institucionales', 14),
 ('Comunicar riesgos y medidas de control de manera clara y oportuna', 15)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CAF', 'Coordinador de Administración y Finanzas', 40
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CAF')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Elaborar y controlar presupuestos, flujo de efectivo y proyecciones financieras', 1),
 ('Analizar ingresos, egresos, cuentas por cobrar, cuentas por pagar y variaciones presupuestales', 2),
 ('Revisar conciliaciones bancarias, cortes de caja y registros contables', 3),
 ('Verificar facturas, comprobantes fiscales y documentación soporte', 4),
 ('Coordinar cálculos y pagos de nómina, prestaciones y obligaciones relacionadas', 5),
 ('Aplicar conocimientos de legislación fiscal, laboral y de seguridad social dentro del alcance del puesto', 6),
 ('Gestionar compras, cotizaciones, órdenes de compra, contratos y pagos a proveedores', 7),
 ('Coordinar la selección, evaluación y seguimiento de proveedores', 8),
 ('Implementar controles internos y separación de funciones', 9),
 ('Identificar riesgos financieros, administrativos, de abastecimiento y fraude', 10),
 ('Supervisar inventarios, almacén y mantenimiento', 11),
 ('Elaborar y analizar indicadores de desempeño', 12),
 ('Manejar XLAB, XLAB Inventario, sistemas contables y banca electrónica autorizada', 13),
 ('Utilizar hojas de cálculo y herramientas digitales para análisis y control', 14),
 ('Elaborar reportes financieros y administrativos claros, exactos y oportunos', 15),
 ('Preparar evidencia para auditorías internas, externas y evaluaciones EMA', 16),
 ('Aplicar controles de confidencialidad y protección de información', 17),
 ('Gestionar acciones correctivas y oportunidades de mejora', 18)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'ACON', 'Auxiliar de Contabilidad', 50
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'ACON')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Registro y control contable de operaciones', 1),
 ('Verificación de comprobantes fiscales digitales', 2),
 ('Conciliación bancaria y control de caja', 3),
 ('Cálculo y control de nómina y prestaciones', 4),
 ('Elaboración y seguimiento de órdenes de compra', 5),
 ('Evaluación y reevaluación de proveedores externos conforme a ISO 15189:2022', 6),
 ('Manejo de hoja de cálculo y sistemas contables', 7),
 ('Control y resguardo de registros conforme al Sistema de Gestión de la Calidad', 8)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'ALM', 'Almacén', 60
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'ALM')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Recibir e inspeccionar productos contra documentos de compra y criterios establecidos', 1),
 ('Verificar lote, caducidad, cantidad, presentación, integridad y condiciones de transporte', 2),
 ('Controlar inventarios físicos y electrónicos', 3),
 ('Aplicar FEFO y PEPS según corresponda', 4),
 ('Mantener la trazabilidad de entradas, salidas, devoluciones y transferencias', 5),
 ('Controlar productos en cuarentena, rechazados, caducados o retirados', 6),
 ('Vigilar y registrar condiciones de temperatura y humedad', 7),
 ('Responder ante desviaciones de almacenamiento y activar controles de contingencia', 8),
 ('Interpretar etiquetas, instrucciones de conservación y fichas de datos de seguridad', 9),
 ('Segregar sustancias químicas conforme a su compatibilidad y riesgo', 10),
 ('Calcular existencias mínimas, máximas, consumo y puntos de reorden', 11),
 ('Preparar y entregar requisiciones con exactitud', 12),
 ('Manejar hojas de cálculo, sistemas de inventario y herramientas ofimáticas', 13),
 ('Identificar riesgos, productos no conformes y oportunidades de mejora', 14),
 ('Elaborar reportes de inventario, consumo, caducidades, diferencias y desempeño de proveedores', 15)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'MNT', 'Mantenimiento', 70
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'MNT')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Elaborar y ejecutar programas de mantenimiento preventivo', 1),
 ('Diagnosticar y atender fallas básicas de infraestructura y servicios', 2),
 ('Realizar reparaciones eléctricas menores dentro del alcance autorizado', 3),
 ('Realizar reparaciones hidráulicas y sanitarias menores', 4),
 ('Ejecutar trabajos básicos de pintura, carpintería, herrería y albañilería', 5),
 ('Inspeccionar instalaciones y detectar condiciones inseguras', 6),
 ('Clasificar solicitudes según urgencia, riesgo e impacto operativo', 7),
 ('Aplicar medidas de bloqueo, señalización y control de acceso', 8),
 ('Utilizar herramientas y equipo de protección personal de forma segura', 9),
 ('Controlar proveedores y verificar reportes de servicio', 10),
 ('Documentar actividades, hallazgos, refacciones y liberación de áreas', 11),
 ('Mantener inventario y control de herramientas y materiales', 12),
 ('Participar en planes de contingencia y continuidad operativa', 13),
 ('Identificar riesgos de contaminación y proteger las áreas durante una intervención', 14),
 ('Manejar hojas de cálculo, correo electrónico y sistemas institucionales para registrar solicitudes y actividades', 15),
 ('Analizar fallas repetitivas y proponer acciones de mejora', 16)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CRH', 'Coordinador de Recursos Humanos', 80
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CRH')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretar y aplicar los requisitos de ISO 15189:2022 relacionados con personal, competencia, autorización, imparcialidad, confidencialidad y registros', 1),
 ('Elaborar, revisar y controlar perfiles y descripciones de puesto', 2),
 ('Ejecutar procesos de reclutamiento, selección y contratación con criterios definidos y evidencia objetiva', 3),
 ('Verificar la autenticidad, suficiencia y vigencia de documentos de formación y experiencia', 4),
 ('Planear y controlar la inducción, entrenamiento, capacitación y desarrollo del personal', 5),
 ('Diseñar y administrar evaluaciones de competencia y desempeño con criterios objetivos y trazables', 6),
 ('Controlar autorizaciones, restricciones, suspensiones y reevaluaciones del personal', 7),
 ('Integrar, proteger, conservar y recuperar expedientes laborales y de competencia', 8),
 ('Elaborar la Detección de Necesidades y el Programa Anual de Capacitación', 9),
 ('Evaluar y documentar la eficacia de la capacitación', 10),
 ('Administrar incidencias, vacaciones, permisos, incapacidades, suplencias, movimientos y bajas', 11),
 ('Aplicar legislación laboral y políticas institucionales dentro de su ámbito de competencia', 12),
 ('Elaborar y analizar indicadores de Recursos Humanos', 13),
 ('Identificar riesgos de competencia, cobertura, imparcialidad y continuidad operativa', 14),
 ('Gestionar acciones correctivas y oportunidades de mejora relacionadas con el personal', 15),
 ('Preparar y presentar evidencia documental durante auditorías y evaluaciones EMA', 16),
 ('Manejar herramientas ofimáticas, hojas de cálculo, bases de datos y sistemas institucionales de Recursos Humanos', 17),
 ('Redactar oficios, comunicados, actas, informes y documentos laborales con claridad y control documental', 18)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'SGEN', 'Servicios Generales', 90
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'SGEN')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Ejecutar correctamente actividades de limpieza, sanitización y desinfección de instalaciones, mobiliario y áreas del laboratorio', 1),
 ('Conocimiento y cumplimiento de normas de bioseguridad', 2),
 ('Utilizar correctamente el equipo de protección personal de acuerdo con las actividades realizadas', 3),
 ('Manejar correctamente materiales, herramientas, productos químicos y equipos asignados para sus funciones', 4),
 ('Manejo seguro de residuos peligrosos (RPBI)', 5),
 ('Seguimiento de procedimientos', 6),
 ('Aplicación de procedimientos de limpieza y desinfección', 7),
 ('Identificación de riesgos biológicos, químicos y físicos', 8),
 ('Aplicación de medidas de bioseguridad y prevención de contaminación cruzada', 9),
 ('Respuesta inicial ante derrames o condiciones inseguras', 10)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'LAV', 'Lavado de Material', 100
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'LAV')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Lavado y desinfección de material reutilizable', 1),
 ('Manejo seguro de material contaminado', 2),
 ('Uso correcto de detergentes y desinfectantes', 3),
 ('Aplicación de medidas de bioseguridad', 4),
 ('Uso adecuado de equipo de protección personal', 5),
 ('Prevención de contaminación cruzada', 6),
 ('Manejo y almacenamiento de material limpio', 7),
 ('Identificación de material dañado o no apto para uso', 8),
 ('Limpieza y desinfección de áreas y equipos relacionados', 9),
 ('Cumplimiento de procedimientos documentados', 10)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CSI', 'Coordinador de Sistemas de la Información', 110
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CSI')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Administración de Sistemas de Información del Laboratorio (SIL/LIS), garantizando su disponibilidad, integridad, confidencialidad y continuidad operativa', 1),
 ('Administración y gestión de bases de datos relacionales, incluyendo PostgreSQL, MariaDB, MySQL, Microsoft SQL Server, Oracle o tecnologías equivalentes', 2),
 ('Desarrollo, mantenimiento e implementación de aplicaciones web mediante lenguajes y frameworks de programación modernos (Delphi, HTML, CSS, Tailwind CSS, JavaScript, TypeScript, React, Next.js o tecnologías equivalentes)', 3),
 ('Administración de servidores Linux y Windows Server, incluyendo instalación, configuración, actualización, monitoreo y mantenimiento', 4),
 ('Administración de servidores web y servicios asociados (Apache, Nginx o tecnologías equivalentes)', 5),
 ('Administración de infraestructura virtualizada y servidores privados virtuales (VPS), incluyendo el despliegue y mantenimiento de aplicaciones institucionales', 6),
 ('Administración de redes, servicios de comunicación y conectividad necesarios para la operación del laboratorio', 7),
 ('Mantenimiento preventivo, correctivo y diagnóstico de equipos de cómputo e infraestructura tecnológica', 8),
 ('Gestión, verificación y recuperación de respaldos de información, garantizando la disponibilidad y continuidad de los datos institucionales', 9),
 ('Diseño, implementación, mantenimiento y evaluación de planes de contingencia y recuperación ante desastres para los sistemas de información', 10),
 ('Validación, gestión de cambios y documentación de sistemas informáticos conforme a los procedimientos institucionales y a los requisitos de la Norma ISO 15189:2022', 11),
 ('Conocimiento de los requisitos de gestión de la información, seguridad de la información y continuidad operativa establecidos en la Norma ISO 15189:2022 y demás disposiciones aplicables', 12),
 ('Administración de controles de acceso, seguridad informática, monitoreo y protección de la infraestructura tecnológica', 13),
 ('Capacidad para interpretar documentación técnica en inglés relacionada con sistemas operativos, bases de datos, infraestructura tecnológica y Sistemas de Información del Laboratorio', 14)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CCM', 'Coordinador de Comercialización, Mercadotecnia y Relaciones Públicas', 120
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CCM')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de los requisitos de la Norma ISO 15189:2022 y de la documentación del Sistema de Gestión de la Calidad relacionada con las actividades bajo su responsabilidad', 1),
 ('Conocimiento de los servicios, procesos y modelo de atención que ofrece el laboratorio clínico', 2),
 ('Conocimiento de los procesos de comercialización, mercadotecnia, relaciones públicas y desarrollo de negocios', 3),
 ('Atención, servicio y seguimiento a clientes, médicos, empresas e instituciones, orientado a la satisfacción del usuario', 4),
 ('Técnicas de negociación, desarrollo comercial, establecimiento y seguimiento de convenios institucionales', 5),
 ('Manejo, análisis e interpretación de indicadores de desempeño (KPI), elaboración de reportes ejecutivos y evaluación de resultados comerciales', 6),
 ('Manejo de Microsoft Office (Word, Excel, PowerPoint y Outlook) para la elaboración de reportes, análisis de información y presentaciones ejecutivas', 7),
 ('Manejo del Sistema de Información del Laboratorio (LIS) utilizado por el laboratorio para las funciones inherentes al puesto', 8),
 ('Conocimiento y aplicación de los procedimientos, instructivos, políticas y registros del Sistema de Gestión de la Calidad relacionados con su proceso', 9),
 ('Comunicación oral y escrita efectiva para la atención de usuarios, coordinación interdepartamental y representación institucional', 10),
 ('Conocimiento y manejo de herramientas para el diseño, edición y administración de material publicitario, contenido digital y medios de comunicación institucional', 11),
 ('Análisis estadístico básico, interpretación de indicadores y elaboración de información para la toma de decisiones', 12),
 ('Organización, coordinación y seguimiento de eventos corporativos, campañas de promoción y relaciones institucionales', 13),
 ('Manejo de redes sociales, plataformas digitales y herramientas de comunicación para la difusión de los servicios institucionales, conforme a las políticas del laboratorio', 14),
 ('Conocimiento de la normatividad aplicable en materia de publicidad de servicios de salud y de los procedimientos institucionales para la gestión de permisos y autorizaciones cuando corresponda', 15)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'VTA', 'Ventas', 130
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'VTA')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Conocimiento de los requisitos del Sistema de Gestión de la Calidad aplicables a su puesto, conforme a la Norma ISO 15189:2022', 1),
 ('Conocimiento del portafolio de servicios, alcance de las pruebas, requisitos preanalíticos y condiciones generales de prestación de los servicios del laboratorio', 2),
 ('Conocimiento de las políticas comerciales y de atención al cliente del laboratorio', 3),
 ('Técnicas de ventas consultivas, negociación, atención y servicio al cliente', 4),
 ('Manejo de Microsoft Office', 5),
 ('Manejo del Sistema de Información del Laboratorio (LIS) conforme a las funciones autorizadas para el puesto', 6),
 ('Elaboración de reportes de actividades, indicadores comerciales y seguimiento de clientes', 7),
 ('Conocimiento y aplicación de los procedimientos del Sistema de Gestión de la Calidad relacionados con su proceso', 8),
 ('Comunicación efectiva, relaciones institucionales y manejo profesional de clientes', 9),
 ('Conocimiento de los principios de confidencialidad, protección de datos personales y manejo de información institucional', 10),
 ('Identificación, comunicación y seguimiento de riesgos, quejas y oportunidades de mejora relacionadas con la atención y comercialización de los servicios', 11)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CPP', 'Coordinador de Procedimientos Preanalíticos', 140
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CPP')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de la Norma ISO 15189:2022, con énfasis en los apartados 6.2, 7.2 y 7.5', 1),
 ('Diseño y control de procesos preanalíticos', 2),
 ('Establecimiento y verificación de criterios de aceptación y rechazo de muestras', 3),
 ('Supervisión técnica y evaluación de la competencia del personal', 4),
 ('Control de condiciones de conservación y transporte de muestras', 5),
 ('Elaboración y análisis de indicadores de calidad del proceso preexamen', 6),
 ('Investigación de desviaciones, análisis de causa raíz y gestión de acciones correctivas', 7),
 ('Gestión documental y control de registros', 8),
 ('Manejo del sistema de información del laboratorio (X-Lab)', 9)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RSUB', 'Responsable de Subrogación y Envíos a Laboratorios Externos', 150
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RSUB')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Selección, evaluación y seguimiento del desempeño de laboratorios de referencia', 1),
 ('Verificación de requisitos de muestra por tipo de estudio subrogado', 2),
 ('Alicuotado, identificación y embalaje de muestras biológicas', 3),
 ('Control de cadena de frío y de condiciones de transporte', 4),
 ('Integración y verificación de informes de laboratorios externos', 5),
 ('Documentación de incidencias y análisis de causa raíz', 6),
 ('Manejo de sistemas informáticos y plataformas de laboratorios de referencia', 7),
 ('Control de registros y trazabilidad documental', 8)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'ASDM', 'Analista de Separación y Distribución de Muestras', 160
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'ASDM')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Verificación de idoneidad de muestras primarias', 1),
 ('Aplicación de criterios de aceptación y rechazo', 2),
 ('Operación segura y verificación de centrífugas', 3),
 ('Alicuotado e identificación de muestras derivadas', 4),
 ('Control de condiciones de conservación y cadena de frío', 5),
 ('Registro y trazabilidad de muestras en el sistema informático', 6),
 ('Documentación de trabajo no conforme', 7),
 ('Aplicación de medidas de bioseguridad', 8)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'ACEN', 'Auxiliar de Centrifugación', 170
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'ACEN')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Recepción y verificación de muestras', 1),
 ('Aplicación de criterios de aceptación y rechazo', 2),
 ('Operación segura de centrífugas', 3),
 ('Balanceo y distribución adecuada de muestras', 4),
 ('Manejo de muestras', 5),
 ('Prevención de contaminación cruzada', 6),
 ('Aplicación de medidas de bioseguridad', 7),
 ('Manejo de RPBI', 8),
 ('Cumplimiento de procedimientos documentados', 9)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'FLEB', 'Flebotomista', 180
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'FLEB')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Identificación correcta del paciente', 1),
 ('Técnicas de flebotomía', 2),
 ('Orden de extracción de tubos', 3),
 ('Manejo y conservación de muestras biológicas', 4),
 ('Criterios de aceptación y rechazo de muestras', 5),
 ('Etiquetado y trazabilidad de muestras', 6),
 ('Atención segura al paciente', 7),
 ('Manejo de contingencias durante la toma de muestras', 8),
 ('Aplicación de medidas de bioseguridad', 9),
 ('Uso adecuado de equipo de protección personal', 10),
 ('Manejo de RPBI', 11),
 ('Cumplimiento de procedimientos documentados', 12)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RA', 'Recepcionistas', 190
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RA')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de la norma ISO 15189:2022', 1),
 ('Recepción e identificación de pacientes', 2),
 ('Registro y verificación de información en sistemas informáticos', 3),
 ('Programación y control de citas', 4),
 ('Facturación y manejo de efectivo', 5),
 ('Gestión y entrega de resultados', 6),
 ('Control documental y trazabilidad de registros', 7),
 ('Atención y orientación al paciente', 8),
 ('Manejo de sistemas informáticos de laboratorio', 9),
 ('Aplicación de procedimientos del Sistema de Gestión de Calidad', 10),
 ('Protección de datos personales y confidencialidad de la información', 11)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'AP', 'Atención a Pacientes', 200
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'AP')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Atención y orientación a pacientes y usuarios', 1),
 ('Manejo de conmutador telefónico y canales de comunicación institucional', 2),
 ('Uso de sistemas informáticos, correo electrónico y plataformas autorizadas por el laboratorio', 3),
 ('Confidencialidad de la información y protección de datos personales', 4),
 ('Gestión y seguimiento de solicitudes, quejas, sugerencias e incidencias', 5),
 ('Política, objetivos de calidad y requisitos aplicables del Sistema de Gestión de Calidad', 6),
 ('Manejo básico de XLAB y sistemas institucionales aplicables al puesto', 7)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CHOF', 'Choferes', 210
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CHOF')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Uso y manejo adecuado de contenedores y neveras de traslado', 1),
 ('Conocimiento y cumplimiento del reglamento de tránsito vigente', 2),
 ('Manejo y traslado de muestras biológicas conforme a los procedimientos establecidos', 3),
 ('Llenado correcto de bitácoras, registros y formatos de UNILABOR', 4),
 ('Conocimiento básico de bioseguridad, seguridad e higiene', 5),
 ('Cumplimiento de políticas de confidencialidad y protección de datos', 6),
 ('Conducción segura y manejo defensivo', 7),
 ('Operación e inspección básica del vehículo', 8),
 ('Gestión de rutas, logística y puntualidad en entregas', 9),
 ('Atención y respuesta ante emergencias o contingencias', 10),
 ('Control y resguardo adecuado de los materiales transportados', 11),
 ('Bioseguridad y transporte seguro de muestras o materiales sensibles (cuando aplique)', 12),
 ('Conservación de trazabilidad, integridad y condiciones de transporte (temperatura, cadena de custodia, estabilidad, etc.)', 13)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CPA', 'Coordinador de Procedimientos Analíticos', 220
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CPA')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación integral de la Norma ISO 15189:2022', 1),
 ('Planeación y coordinación de procesos analíticos multidisciplinarios', 2),
 ('Diseño y evaluación de programas de aseguramiento de la validez de los resultados', 3),
 ('Validación y verificación de métodos analíticos', 4),
 ('Autorización y evaluación del personal signatario', 5),
 ('Aplicación e interpretación del control estadístico de la calidad (reglas de Westgard, gráficos de Levey-Jennings)', 6),
 ('Validación técnica y liberación de resultados', 7),
 ('Verificación del desempeño de métodos y equipos analíticos', 8),
 ('Trazabilidad metrológica y manejo de materiales de referencia', 9),
 ('Investigación de desviaciones, trabajo no conforme y análisis de causa raíz', 10),
 ('Gestión documental y control de registros', 11),
 ('Gestión de riesgos aplicada al proceso analítico', 12),
 ('Manejo del sistema de información del laboratorio', 13)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'AN-C', 'Analista "C"', 230
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'AN-C')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Ejecución autónoma de procedimientos analíticos en múltiples disciplinas', 1),
 ('Validación y liberación de resultados como personal signatario', 2),
 ('Supervisión técnica y entrenamiento de personal analista', 3),
 ('Resolución de desviaciones técnicas durante el proceso de examen', 4),
 ('Aplicación e interpretación del control estadístico de la calidad (reglas de Westgard, gráficos de Levey-Jennings)', 5),
 ('Validación técnica y liberación de resultados', 6),
 ('Verificación del desempeño de métodos y equipos analíticos', 7),
 ('Trazabilidad metrológica y manejo de materiales de referencia', 8),
 ('Investigación de desviaciones, trabajo no conforme y análisis de causa raíz', 9),
 ('Gestión documental y control de registros', 10),
 ('Gestión de riesgos aplicada al proceso analítico', 11),
 ('Manejo del sistema de información del laboratorio', 12)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'AN-B', 'Analista "B"', 240
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'AN-B')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de los procedimientos del Sistema de Gestión de la Calidad y de los requisitos aplicables de la norma ISO 15189:2022', 1),
 ('Procesamiento analítico de muestras biológicas conforme a los procedimientos establecidos', 2),
 ('Operación, verificación operativa y cuidado de los equipos analíticos autorizados para su puesto', 3),
 ('Aplicación e interpretación del control de calidad interno y participación en Programas de Evaluación Externa de la Calidad, cuando aplique', 4),
 ('Validación técnica de resultados conforme a las actividades y autorizaciones asignadas', 5),
 ('Aplicación de los criterios de aceptación y rechazo de muestras', 6),
 ('Gestión documental, control de registros y trazabilidad de muestras, resultados e información', 7),
 ('Identificación y notificación de desviaciones, incidentes, riesgos y trabajos no conformes conforme al Sistema de Gestión de la Calidad', 8),
 ('Manejo de los sistemas informáticos del laboratorio (LIS, XLAB u otros autorizados)', 9)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RHEM', 'Responsable de Hematología', 250
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RHEM')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación de estudios hematológicos', 1),
 ('Interpretación de estudios de coagulación', 2),
 ('Evaluación microscópica de frotis sanguíneos', 3),
 ('Validación técnica y autorización para la liberación de resultados', 4),
 ('Interpretación de valores de alerta críticos', 5),
 ('Control estadístico de la calidad y aplicación de las reglas de Westgard', 6),
 ('Manejo de analizadores hematológicos y de coagulación', 7),
 ('Evaluación del desempeño analítico', 8),
 ('Gestión de equipos, calibración y verificación', 9),
 ('Gestión documental', 10),
 ('Gestión de riesgos', 11),
 ('Investigación de desviaciones y análisis de causa raíz', 12),
 ('Interpretación y aplicación de la norma ISO 15189:2022', 13)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RIES', 'Responsable de Inmunología Especial', 260
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RIES')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de los requisitos de la Norma ISO 15189:2022 y de los procedimientos del Sistema de Gestión de la Calidad', 1),
 ('Supervisión y, cuando las necesidades operativas lo requieran, operación de los analizadores y sistemas analíticos del área de Inmunología Especial', 2),
 ('Validación, verificación, autorización y liberación de resultados conforme a las competencias y autorizaciones vigentes', 3),
 ('Interpretación técnica de los inmunoensayos y evaluación de la consistencia de los resultados', 4),
 ('Supervisión de la aplicación, interpretación y seguimiento del Control de Calidad Interno', 5),
 ('Interpretación de las gráficas de Levey-Jennings y aplicación de las reglas de Westgard para la toma de decisiones técnicas', 6),
 ('Coordinación y evaluación de la participación del área en los Programas de Evaluación Externa de la Calidad', 7),
 ('Gestión, evaluación y seguimiento de resultados críticos, resultados inconsistentes y desviaciones analíticas', 8),
 ('Verificación de métodos de examen y evaluación de su desempeño, conforme a los procedimientos establecidos', 9),
 ('Evaluación de la incertidumbre de la medición, cuando aplique', 10),
 ('Identificación, evaluación y gestión de riesgos asociados al proceso analítico', 11),
 ('Investigación de desviaciones, incidentes, trabajo no conforme, no conformidades y análisis de causa raíz, así como implementación y seguimiento de acciones correctivas', 12),
 ('Supervisión de la operación, verificación y gestión del mantenimiento de los equipos analíticos e instrumentos de medición del área', 13),
 ('Gestión documental, control de registros y aseguramiento de la trazabilidad de muestras, resultados e información conforme al Sistema de Gestión de la Calidad', 14),
 ('Manejo del Sistema de Información del Laboratorio (SIL, LIS, XLAB u otros autorizados)', 15),
 ('Aplicación de los requisitos de bioseguridad, seguridad e higiene y manejo de RPBI', 16)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RQC', 'Responsable de Química Clínica', 270
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RQC')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación técnica de pruebas de Química Clínica', 1),
 ('Validación técnica y autorización de resultados', 2),
 ('Aplicación e interpretación de las reglas de Westgard', 3),
 ('Control estadístico de la calidad', 4),
 ('Manejo, operación y verificación de analizadores automatizados de Química Clínica', 5),
 ('Verificación y validación de métodos de examen', 6),
 ('Gestión documental', 7),
 ('Gestión de riesgos', 8),
 ('Investigación y análisis de desviaciones, incidentes y no conformidades', 9),
 ('Evaluación del desempeño analítico', 10)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RMIC', 'Responsable de Microbiología', 280
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RMIC')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Cultivo, aislamiento e identificación de microorganismos', 1),
 ('Realización e interpretación de tinciones y pruebas bioquímicas', 2),
 ('Ejecución e interpretación de pruebas de susceptibilidad antimicrobiana', 3),
 ('Control de calidad con cepas de referencia y manejo de cepario', 4),
 ('Operación y verificación de campana de bioseguridad, incubadoras y autoclave', 5),
 ('Aplicación e interpretación del control estadístico de la calidad (reglas de Westgard, gráficos de Levey-Jennings)', 6),
 ('Validación técnica y liberación de resultados', 7),
 ('Verificación del desempeño de métodos y equipos analíticos', 8),
 ('Trazabilidad metrológica y manejo de materiales de referencia', 9),
 ('Investigación de desviaciones, trabajo no conforme y análisis de causa raíz', 10),
 ('Gestión documental y control de registros', 11),
 ('Gestión de riesgos aplicada al proceso analítico', 12),
 ('Manejo del sistema de información del laboratorio', 13)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RPAR', 'Responsable de Parasitología', 290
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RPAR')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Examen macroscópico y microscópico de muestras coproparasitoscópicas', 1),
 ('Aplicación de métodos de concentración y tinciones', 2),
 ('Identificación morfológica de parásitos y sus estadios evolutivos', 3),
 ('Preparación y control de reactivos y colorantes', 4),
 ('Aplicación e interpretación del control estadístico de la calidad (reglas de Westgard, gráficos de Levey-Jennings)', 5),
 ('Validación técnica y liberación de resultados', 6),
 ('Verificación del desempeño de métodos y equipos analíticos', 7),
 ('Trazabilidad metrológica y manejo de materiales de referencia', 8),
 ('Investigación de desviaciones, trabajo no conforme y análisis de causa raíz', 9),
 ('Gestión documental y control de registros', 10),
 ('Gestión de riesgos aplicada al proceso analítico', 11),
 ('Manejo del sistema de información del laboratorio', 12)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RIRU', 'Responsable de Inmunología Rutinaria', 300
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RIRU')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Ejecución e interpretación de pruebas serológicas e inmunológicas de rutina', 1),
 ('Aplicación de criterios de reactividad, confirmación y repetición', 2),
 ('Operación y verificación de equipos de inmunoensayo', 3),
 ('Manejo confidencial de resultados sensibles', 4),
 ('Aplicación e interpretación del control estadístico de la calidad (reglas de Westgard, gráficos de Levey-Jennings)', 5),
 ('Validación técnica y liberación de resultados', 6),
 ('Verificación del desempeño de métodos y equipos analíticos', 7),
 ('Trazabilidad metrológica y manejo de materiales de referencia', 8),
 ('Investigación de desviaciones, trabajo no conforme y análisis de causa raíz', 9),
 ('Gestión documental y control de registros', 10),
 ('Gestión de riesgos aplicada al proceso analítico', 11),
 ('Manejo del sistema de información del laboratorio', 12)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RTOX', 'Responsable de Toxicología', 310
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RTOX')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de la norma ISO 15189:2022', 1),
 ('Aplicación y supervisión de la cadena de custodia de muestras', 2),
 ('Validación, verificación y liberación de resultados toxicológicos', 3),
 ('Interpretación de resultados de pruebas para la detección de drogas de abuso y otras pruebas toxicológicas', 4),
 ('Aplicación, interpretación y seguimiento del control de calidad interno', 5),
 ('Participación, evaluación y seguimiento de los Programas de Evaluación Externa de la Calidad', 6),
 ('Aplicación de criterios de aceptación y rechazo de muestras', 7),
 ('Gestión documental, control de registros y trazabilidad de la información', 8),
 ('Identificación, evaluación y gestión de riesgos asociados al proceso analítico', 9),
 ('Operación, verificación y supervisión del mantenimiento de equipos analíticos', 10),
 ('Investigación y seguimiento de desviaciones, incidentes y no conformidades', 11),
 ('Supervisión técnica del personal y evaluación de la competencia', 12)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RURO', 'Responsable de Uroanálisis', 320
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RURO')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Análisis físico, químico y microscópico de orina', 1),
 ('Identificación de elementos formes en sedimento urinario', 2),
 ('Validación técnica de resultados', 3),
 ('Aplicación e interpretación del control estadístico de calidad', 4),
 ('Gestión documental', 5),
 ('Gestión de riesgos', 6),
 ('Manejo, verificación y aseguramiento del desempeño de equipos analíticos', 7),
 ('Investigación de desviaciones, incidentes y análisis de causa raíz', 8),
 ('Interpretación de criterios de aceptación, rechazo y validación de resultados', 9)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'RAND', 'Responsable de Andrología', 330
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'RAND')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de la Norma ISO 15189:2022, en los requisitos relacionados con las actividades del área de Andrología', 1),
 ('Conocimiento y aplicación del Manual de la OMS para el examen y procesamiento del semen humano, en su edición vigente', 2),
 ('Procesamiento, evaluación e interpretación de estudios de Andrología conforme a los procedimientos y métodos implementados por el laboratorio', 3),
 ('Evaluación de la concentración, movilidad, vitalidad, morfología y demás parámetros seminales aplicables', 4),
 ('Identificación de condiciones preanalíticas, analíticas y postanalíticas que puedan afectar la calidad o validez de los resultados', 5),
 ('Aplicación de criterios de aceptación, rechazo, conservación, procesamiento y trazabilidad de las muestras', 6),
 ('Control de calidad y aseguramiento de la validez de los resultados', 7),
 ('Validación técnica, liberación y revisión de resultados del área de Andrología', 8),
 ('Identificación y gestión de desviaciones, resultados atípicos, trabajo no conforme y no conformidades', 9),
 ('Gestión de riesgos aplicada a las actividades del área', 10),
 ('Bioseguridad, manejo de RPBI y prevención de riesgos ocupacionales', 11),
 ('Gestión documental, control de registros y mantenimiento de la trazabilidad de la información', 12),
 ('Supervisión técnica, evaluación del desempeño y apoyo en la capacitación del personal asignado al área', 13),
 ('Participación en auditorías internas, revisión de hallazgos e implementación de acciones correctivas y de mejora', 14),
 ('Manejo de Microsoft Office, Sistema de Información del Laboratorio y demás herramientas informáticas institucionales', 15)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'AN-A', 'Analista "A"', 340
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'AN-A')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de los requisitos de la Norma ISO 15189:2022 y de la documentación vigente del Sistema de Gestión de la Calidad', 1),
 ('Ejecución e interpretación de procedimientos analíticos en una o más disciplinas del laboratorio clínico', 2),
 ('Aseguramiento de la validez de los resultados mediante la aplicación del Control Interno de la Calidad, la participación en Programas de Evaluación Externa de la Calidad y la ejecución de las actividades establecidas por el laboratorio para el monitoreo del desempeño analítico', 3),
 ('Revisión, verificación e interpretación de resultados analíticos conforme a los criterios técnicos establecidos por el laboratorio y a los procedimientos institucionales, previo a su validación por el personal autorizado', 4),
 ('Interpretación de gráficas de control, reglas de control estadístico y evaluación del desempeño analítico', 5),
 ('Operación, verificación y mantenimiento de primer nivel de equipos e instrumentos analíticos', 6),
 ('Manejo de reactivos, calibradores, materiales de referencia y controles de calidad conforme a las especificaciones técnicas aplicables', 7),
 ('Identificación, documentación y gestión de trabajos no conformes, desviaciones e incidentes relacionados con el proceso analítico', 8),
 ('Aplicación de los principios de trazabilidad metrológica y participación en actividades de incertidumbre de medición y verificación o validación de métodos, cuando sean aplicables a su área de trabajo y conforme a los procedimientos institucionales', 9),
 ('Manejo del Sistema Informático de Laboratorio (SIL/LIS), sistemas institucionales y registros electrónicos aplicables', 10),
 ('Aplicación de medidas de bioseguridad, seguridad e higiene durante el proceso analítico', 11),
 ('Gestión documental, control de registros y aseguramiento de la trazabilidad de la información generada durante el proceso analítico', 12),
 ('Identificación, evaluación y control de riesgos asociados al proceso analítico conforme a los procedimientos institucionales', 13),
 ('Interpretación de especificaciones técnicas, instructivos de fabricantes y documentación científica relacionada con las metodologías analíticas bajo su responsabilidad', 14)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'AUXA', 'Auxiliar Analista', 350
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'AUXA')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Preparación de materiales, reactivos y soluciones', 1),
 ('Manejo e identificación de muestras biológicas', 2),
 ('Limpieza, desinfección y mantenimiento de primer nivel de equipos', 3),
 ('Verificación y registro de condiciones de conservación', 4),
 ('Control de caducidades e inventario de insumos', 5),
 ('Aplicación de medidas de bioseguridad y manejo de RPBI', 6),
 ('Registro completo y oportuno de bitácoras', 7)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CSE', 'Coordinador de Servicios Especiales', 360
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CSE')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Interpretación y aplicación de los requisitos de la Norma ISO 15189:2022 y de los procedimientos del Sistema de Gestión de la Calidad aplicables a su proceso', 1),
 ('Conocimiento integral de los servicios que ofrece el laboratorio, sus condiciones de prestación, requisitos preanalíticos y criterios para la programación de servicios especiales', 2),
 ('Planeación, organización y coordinación logística de servicios de toma de muestras extramuros y eventos especiales', 3),
 ('Conocimiento de los requisitos para la preparación del paciente, toma, identificación, conservación, transporte, recepción y entrega de muestras biológicas, conforme a los procedimientos institucionales', 4),
 ('Atención, comunicación y servicio al cliente, incluyendo la gestión de requerimientos de empresas, instituciones y usuarios', 5),
 ('Coordinación, supervisión y seguimiento del desempeño del personal bajo su responsabilidad', 6),
 ('Manejo de Microsoft Office y herramientas digitales para la elaboración de reportes, indicadores y control operativo', 7),
 ('Conocimiento y aplicación de los principios de bioseguridad, seguridad e higiene, manejo de RPBI y gestión de riesgos aplicables a las actividades bajo su responsabilidad', 8),
 ('Conocimiento de los procedimientos de cadena de custodia aplicables a los estudios que así lo requieran', 9),
 ('Manejo del Sistema de Información del Laboratorio (LIS) utilizado por la organización para la programación, seguimiento y consulta de los servicios', 10),
 ('Conocimiento y aplicación de los procedimientos, políticas, instructivos y registros del Sistema de Gestión de la Calidad relacionados con su proceso', 11),
 ('Conocimiento de la gestión documental, control de registros, manejo de información confidencial y protección de datos personales aplicables a los servicios especiales', 12)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'REE', 'Recepción de Eventos Especiales', 370
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'REE')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Conocimiento y aplicación de los procedimientos del Sistema de Gestión de la Calidad relacionados con su proceso', 1),
 ('Recepción, identificación y registro de pacientes conforme a los procedimientos institucionales', 2),
 ('Atención y servicio al paciente', 3),
 ('Manejo del Sistema de Información del Laboratorio (LIS) y de las aplicaciones autorizadas por la empresa', 4),
 ('Conocimiento y aplicación de la cadena de custodia para las pruebas que así lo requieran', 5),
 ('Protección de datos personales y confidencialidad de la información', 6),
 ('Control de registros y trazabilidad de la información', 7),
 ('Manejo de equipo de cómputo y paquetería informática básica', 8)
) AS x(txt, ord);

WITH pos AS (
  INSERT INTO rh_positions (code, name, sort_order)
  SELECT 'CUST', 'Custodio', 380
  WHERE NOT EXISTS (SELECT 1 FROM rh_positions WHERE upper(code) = 'CUST')
  RETURNING id
)
INSERT INTO rh_position_competencies (position_id, competency_text, sort_order, criticality)
SELECT pos.id, x.txt, x.ord, 'M' FROM pos, (VALUES
 ('Identificación correcta del paciente', 1),
 ('Manejo de cadena de custodia', 2),
 ('Criterios de aceptación y rechazo de muestras', 3),
 ('Etiquetado y trazabilidad de muestras', 4),
 ('Aplicación de medidas de bioseguridad', 5),
 ('Uso adecuado de equipo de protección personal', 6),
 ('Cumplimiento de procedimientos documentados', 7)
) AS x(txt, ord);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260902_01_rh_positions_seed_reh_man_001.sql', 'd9a7c901eeb07969c2d6a596b662c0f7930239eddf7a3508d40efcc5a768ce3b');

-- ============ 20260902_02_eval_attempt_time_limit.sql ============
-- Limite de duracion del intento en evaluaciones tipo quiz: minutos que tiene
-- el colaborador para terminar desde que pulsa "Iniciar" (NULL = sin limite).
-- Complementa a window_hours (plazo para PRESENTAR desde la asignacion).
ALTER TABLE public.evaluation_templates
  ADD COLUMN IF NOT EXISTS attempt_time_limit_minutes integer
  CHECK (attempt_time_limit_minutes IS NULL OR attempt_time_limit_minutes > 0);
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260902_02_eval_attempt_time_limit.sql', 'cbdc98e6f13792b866deedc580614d2e1866ecd40a2b5de0b61cdc0fe88d30ca');

-- ============ 20260902_03_rh_induction_reading_time_limit.sql ============
-- Limite de tiempo de lectura por fase de induccion (horas). Al inscribir se
-- congela la fecha limite en el enrollment (reading_deadline_at); al vencer,
-- la evaluacion de la fase se abre aunque la lectura no este completa.
ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS reading_time_limit_hours integer
  CHECK (reading_time_limit_hours IS NULL OR reading_time_limit_hours > 0);

ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS reading_deadline_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rh_induction_enrollments_reading_deadline
  ON public.rh_induction_enrollments (reading_deadline_at)
  WHERE reading_deadline_at IS NOT NULL AND evaluation_assignment_id IS NULL;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20260902_03_rh_induction_reading_time_limit.sql', '84aaff280c4fef36466ee8892ed4b4cccd595a4eaeb0ca04418a481a6bdc19fa');

COMMIT;
