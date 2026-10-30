-- MIGRACIONES_DEPLOY_20261030.sql - (1) Catalogo de secciones del colaborador, (2) areas del proceso por puesto, (3) ANA-REG-060: supervisor por inscripcion y firma en dos pasos, (4) Carta de asignacion de puesto REH-REG-008. Correr DESPUES de SCRIPT_PROD_20261030_NORMALIZAR_AREAS_COLABORADORES.sql (pgAdmin)
-- ============ 20261030_01_rh_employee_areas.sql ============
-- =============================================================================
-- RH - Catalogo de areas del colaborador.
--
-- employees.area era texto libre y acumulo variantes de la misma area
-- (Validacion / VALIDACIÓN, ADMINISTRATIVA / ADMINISTRATIVO, SERVCIOS...).
-- Desde ahora el expediente elige el area de este catalogo (lista con
-- buscador) y el backend rechaza areas fuera de el. employees.area sigue
-- siendo texto (lo leen muchos modulos) pero solo guarda nombres del catalogo.
--
--   name_key: nombre sin mayusculas, acentos ni espacios dobles; impide dar de
--             alta "Validacion" si ya existe "VALIDACIÓN".
--
-- Siembra: las areas distintas que hoy tienen los colaboradores ACTIVOS. Correr DESPUES
-- de SCRIPT_PROD_20261030_NORMALIZAR_AREAS_COLABORADORES.sql para no sembrar
-- variantes. Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_employee_areas (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_employee_areas_name_key ON public.rh_employee_areas (name_key);

INSERT INTO public.rh_employee_areas (name, name_key)
SELECT DISTINCT ON (k.name_key) k.name, k.name_key
  FROM (
    SELECT regexp_replace(trim(e.area), '\s+', ' ', 'g') AS name,
           translate(lower(regexp_replace(trim(e.area), '\s+', ' ', 'g')), 'áéíóúü', 'aeiouu') AS name_key
      FROM public.employees e
     WHERE e.is_active = TRUE AND e.area IS NOT NULL AND trim(e.area) <> ''
  ) k
 ORDER BY k.name_key, k.name
ON CONFLICT (name_key) DO NOTHING;

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261030_01_rh_employee_areas.sql', '5dea30722f9f0d8c864c34e8d49773b6cf4a97c37260fb245840d0408d33530f') ON CONFLICT (filename) DO NOTHING;
-- ============ 20261030_02_rh_process_areas.sql ============
-- =============================================================================
-- RH - Areas del proceso (Preanalitica, Analitica, Posanalitica, Administracion).
--
-- En UNILABOR el AREA la rige el PUESTO: cada puesto pertenece a una de estas
-- cuatro areas. Un colaborador con varios puestos puede estar en varias areas.
-- El campo employees.area pasa a ser la "Seccion / Departamento" del
-- colaborador (VALIDACIÓN, HEMATOLOGÍA, RECEPCIÓN...; catalogo
-- rh_employee_areas) y no cambia.
--
--   * rh_process_areas                 catalogo de las 4 areas.
--   * rh_positions.process_area_id     area a la que pertenece el puesto
--                                      (NULL = pendiente de clasificar).
--   * rh_supervision_area_signatories  los firmantes del ANA-REG-060 pasan a
--                                      configurarse por area del proceso:
--                                      area_key = codigo del area (PRE, ANA,
--                                      POS, ADM). Se descartan las filas por
--                                      seccion (configuracion previa, sin
--                                      evidencia; en prod la tabla esta vacia).
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_process_areas (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_process_areas_code ON public.rh_process_areas (code);

INSERT INTO public.rh_process_areas (code, name, sort_order) VALUES
  ('PRE', 'PREANALÍTICA', 1),
  ('ANA', 'ANALÍTICA', 2),
  ('POS', 'POSANALÍTICA', 3),
  ('ADM', 'ADMINISTRACIÓN', 4)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.rh_positions
  ADD COLUMN IF NOT EXISTS process_area_id BIGINT NULL REFERENCES public.rh_process_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rh_positions_process_area ON public.rh_positions (process_area_id);

DELETE FROM public.rh_supervision_area_signatories s
 WHERE NOT EXISTS (SELECT 1 FROM public.rh_process_areas pa WHERE pa.code = s.area_key);

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261030_02_rh_process_areas.sql', '1b2c8193733f8dd26c92bfc2950397a96970794abe8f31b189ae7efbe9e26c5a') ON CONFLICT (filename) DO NOTHING;

-- ============ 20261030_03_rh_supervision_assigned_signers.sql ============
-- =============================================================================
-- RH/Induccion - ANA-REG-060: supervisor asignado por colaborador y puesto,
-- responsable del area como colaborador y firma en dos pasos.
--
--   * El Supervisor / Auditor de la Fase 6 es el SUPERVISOR DE LA INSCRIPCION
--     (rh_induction_enrollments.supervisor_employee_id, colaborador x puesto;
--     el mismo dato que imprime el REH-REG-005). La lista guarda una copia
--     (supervisor_employee_id) que se sincroniza mientras esta en borrador.
--   * El Responsable del Area se configura por area del proceso como
--     colaborador (rh_supervision_area_signatories.area_responsible_employee_id).
--   * Firma en dos pasos desde "Mis supervisiones" (cada quien con su cuenta):
--       DRAFT --(supervisor califica y firma)--> SUPERVISOR_SIGNED
--             --(responsable del area avala y firma)--> CLOSED
--     RH puede seguir cerrando en una sola sesion cuando ambos estan presentes.
--
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_supervision_area_signatories
  ADD COLUMN IF NOT EXISTS area_responsible_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.rh_supervision_checklists
  ADD COLUMN IF NOT EXISTS supervisor_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_responsible_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_signed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS area_responsible_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.rh_supervision_checklists DROP CONSTRAINT IF EXISTS chk_rh_supervision_checklists_status;
ALTER TABLE public.rh_supervision_checklists
  ADD CONSTRAINT chk_rh_supervision_checklists_status CHECK (status IN ('DRAFT', 'SUPERVISOR_SIGNED', 'CLOSED'));

CREATE INDEX IF NOT EXISTS idx_rh_supervision_checklists_supervisor
  ON public.rh_supervision_checklists (supervisor_employee_id) WHERE status = 'DRAFT';
CREATE INDEX IF NOT EXISTS idx_rh_supervision_checklists_area_responsible
  ON public.rh_supervision_checklists (area_responsible_employee_id) WHERE status = 'SUPERVISOR_SIGNED';

-- Borradores existentes: toman el supervisor ya asignado en su inscripcion.
UPDATE public.rh_supervision_checklists c
   SET supervisor_employee_id = e.supervisor_employee_id,
       supervisor_name = emp.full_name,
       updated_at = NOW()
  FROM public.rh_induction_enrollments e
  JOIN public.employees emp ON emp.id = e.supervisor_employee_id
 WHERE c.enrollment_id = e.id AND c.status = 'DRAFT' AND c.supervisor_employee_id IS NULL;

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261030_03_rh_supervision_assigned_signers.sql', '54ed4cae4bcdf2069bb0444af9c36ad2cf63b1880f0c91405a9245525a0af413') ON CONFLICT (filename) DO NOTHING;

-- ============ 20261030_04_rh_assignment_letters.sql ============
-- =============================================================================
-- RH/Induccion - Carta de asignacion de puesto REH-REG-008 (rev. 1).
--
-- REH-MAN-002 (Fase 7): aprobadas todas las fases, el laboratorio emite la
-- Carta de asignacion de puesto REH-REG-008, autorizacion formal para el
-- desempeno independiente de las funciones asignadas. Una carta por puesto
-- (decision 2026-10-30): se abre al AUTORIZAR el REH-REG-003 inicial del puesto.
--
--   * rh_assignment_authorization_items  las 82 autorizaciones del formato
--                                         (1-8 aplican "a todos"; 82 = Otras).
--   * rh_position_assignment_authorizations  autorizaciones que aplican al
--                                         puesto (RH y el coordinador del area);
--                                         se prellenan en cada carta.
--   * rh_assignment_letters / _items      la carta por colaborador x puesto,
--                                         con su Si/No por autorizacion y las
--                                         firmas (colaborador, coordinacion del
--                                         area, director general).
-- Tipo documental POSITION_ASSIGNMENT (seccion Documentos UNILABOR) renombrado
-- a "Carta de asignacion de puesto (REH-REG-008)". Aditivo e idempotente.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_assignment_authorization_items (
  id BIGSERIAL PRIMARY KEY,
  form_code TEXT NOT NULL DEFAULT 'REH-REG-008',
  form_revision INTEGER NOT NULL DEFAULT 1,
  item_no INTEGER NOT NULL,
  item_text TEXT NOT NULL,
  applies_to_all BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_assignment_authorization_items_rev_no
  ON public.rh_assignment_authorization_items (form_code, form_revision, item_no);

INSERT INTO public.rh_assignment_authorization_items (item_no, item_text, applies_to_all) VALUES
  (1, 'Acceso a las instalaciones del laboratorio', TRUE),
  (2, 'Uso del Sistema de Gestión de Calidad', TRUE),
  (3, 'Acceso a documentos controlados', TRUE),
  (4, 'Acceso a información confidencial', TRUE),
  (5, 'Uso del Sistema de Información del Laboratorio (LIS)', TRUE),
  (6, 'Uso del correo institucional', TRUE),
  (7, 'Uso de equipos de cómputo', TRUE),
  (8, 'Uso de impresoras y escáner', TRUE),
  (9, 'Manejo de expedientes', FALSE),
  (10, 'Captura de datos de pacientes', FALSE),
  (11, 'Modificación de datos del paciente', FALSE),
  (12, 'Consulta de resultados', FALSE),
  (13, 'Impresión de resultados', FALSE),
  (14, 'Entrega de resultados', FALSE),
  (15, 'Recolección de muestras', FALSE),
  (16, 'Identificación del paciente', FALSE),
  (17, 'Aceptación o rechazo de muestras', FALSE),
  (18, 'Transporte interno de muestras', FALSE),
  (19, 'Recepción de muestras', FALSE),
  (20, 'Procesamiento preanalítico', FALSE),
  (21, 'Centrifugación de muestras', FALSE),
  (22, 'Almacenamiento de muestras', FALSE),
  (23, 'Eliminación de muestras', FALSE),
  (24, 'Operación de analizadores', FALSE),
  (25, 'Mantenimiento diario de equipos', FALSE),
  (26, 'Mantenimiento preventivo básico', FALSE),
  (27, 'Cambio de reactivos', FALSE),
  (28, 'Liberación de reactivos', FALSE),
  (29, 'Preparación de reactivos', FALSE),
  (30, 'Control de inventario de reactivos', FALSE),
  (31, 'Verificación de métodos', FALSE),
  (32, 'Desarrollo de métodos', FALSE),
  (33, 'Modificación de métodos', FALSE),
  (34, 'Selección de métodos', FALSE),
  (35, 'Evaluar periódicamente de los métodos analíticos de acuerdo a la operatividad o a las incidencias detectadas durante su implementación', FALSE),
  (36, 'Control interno de calidad', FALSE),
  (37, 'Evaluación del control de calidad', FALSE),
  (38, 'Participación en ensayos de aptitud', FALSE),
  (39, 'Validación técnica de resultados', FALSE),
  (40, 'Liberación de resultados', FALSE),
  (41, 'Informar resultados Críticos', FALSE),
  (42, 'Modificación de resultados', FALSE),
  (43, 'Cancelación de resultados', FALSE),
  (44, 'Emisión de comentarios clínicos', FALSE),
  (45, 'Asesoría técnica a médicos', FALSE),
  (46, 'Manejo de RPBI', FALSE),
  (47, 'Manejo de sustancias químicas', FALSE),
  (48, 'Manejo de sustancias peligrosas', FALSE),
  (49, 'Uso de autoclave', FALSE),
  (50, 'Uso de cabina de bioseguridad', FALSE),
  (51, 'Uso de centrífugas', FALSE),
  (52, 'Uso de refrigeradores y congeladores', FALSE),
  (53, 'Uso de micropipetas', FALSE),
  (54, 'Uso de equipos de medición', FALSE),
  (55, 'Recepción de proveedores', FALSE),
  (56, 'Recepción de insumos', FALSE),
  (57, 'Liberación de insumos', FALSE),
  (58, 'Solicitud de compras', FALSE),
  (59, 'Aprobación de compras', FALSE),
  (60, 'Acceso al almacén', FALSE),
  (61, 'Auditor interno', FALSE),
  (62, 'Elaboración de documentos', FALSE),
  (63, 'Revisión de documentos', FALSE),
  (64, 'Aprobación de documentos', FALSE),
  (65, 'Control documental', FALSE),
  (66, 'Gestión de acciones correctivas', FALSE),
  (67, 'Gestión de riesgos', FALSE),
  (68, 'Atención de auditorías', FALSE),
  (69, 'Capacitación de personal', FALSE),
  (70, 'Asesorar o emitir juicios profesionales según las necesidades de pacientes y usuarios', FALSE),
  (71, 'Evaluación de competencias', FALSE),
  (72, 'Supervisión de personal', FALSE),
  (73, 'Autorización de vacaciones', FALSE),
  (74, 'Acceso a expedientes del personal', FALSE),
  (75, 'Administración del sistema informático', FALSE),
  (76, 'Administración de usuarios del LIS', FALSE),
  (77, 'Respaldo de información', FALSE),
  (78, 'Restauración de respaldos', FALSE),
  (79, 'Administración de redes', FALSE),
  (80, 'Administración de servidores', FALSE),
  (81, 'Autorización para firmar documentos oficiales', FALSE),
  (82, 'Otras', FALSE)
ON CONFLICT (form_code, form_revision, item_no) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.rh_position_assignment_authorizations (
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES public.rh_assignment_authorization_items(id) ON DELETE CASCADE,
  updated_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (position_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.rh_assignment_letters (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT NULL,
  form_code TEXT NOT NULL DEFAULT 'REH-REG-008',
  form_revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE RESTRICT,
  competency_evaluation_id BIGINT NULL REFERENCES public.rh_competency_evaluations(id) ON DELETE SET NULL,
  letter_date DATE NOT NULL,
  area_name TEXT NULL,
  position_description_name TEXT NULL,
  other_authorizations TEXT NULL,
  area_signatory_employee_id BIGINT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  area_signatory_name TEXT NOT NULL DEFAULT '',
  director_signatory_name TEXT NOT NULL DEFAULT '',
  collaborator_signature_path TEXT NULL,
  area_signature_path TEXT NULL,
  director_signature_path TEXT NULL,
  document_id BIGINT NULL REFERENCES public.employee_documents(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NULL,
  closed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rh_assignment_letters_status CHECK (status IN ('DRAFT', 'CLOSED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_assignment_letters_folio ON public.rh_assignment_letters (folio) WHERE folio IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_assignment_letters_evaluation
  ON public.rh_assignment_letters (competency_evaluation_id) WHERE competency_evaluation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rh_assignment_letters_employee ON public.rh_assignment_letters (employee_id, position_id);
CREATE INDEX IF NOT EXISTS idx_rh_assignment_letters_status ON public.rh_assignment_letters (status, letter_date DESC);

CREATE TABLE IF NOT EXISTS public.rh_assignment_letter_items (
  letter_id BIGINT NOT NULL REFERENCES public.rh_assignment_letters(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES public.rh_assignment_authorization_items(id) ON DELETE RESTRICT,
  authorized BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (letter_id, item_id)
);

UPDATE public.document_types
   SET name = 'Carta de asignación de puesto (REH-REG-008)'
 WHERE code = 'POSITION_ASSIGNMENT';

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261030_04_rh_assignment_letters.sql', '7bd76fc27a3c788f32dd11020e663db035ef7495af9321460fd795620aabf107') ON CONFLICT (filename) DO NOTHING;
