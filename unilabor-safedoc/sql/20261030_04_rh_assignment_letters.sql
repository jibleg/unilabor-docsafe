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

-- Etiqueta orientativa por autorizacion (solo en pantalla): 75-80 = CSI
-- (Coordinacion de Sistemas de la Informacion).
ALTER TABLE public.rh_assignment_authorization_items ADD COLUMN IF NOT EXISTS scope_label TEXT NULL;
UPDATE public.rh_assignment_authorization_items
   SET scope_label = 'CSI'
 WHERE form_code = 'REH-REG-008' AND form_revision = 1 AND item_no BETWEEN 75 AND 80 AND scope_label IS NULL;

-- Seccion tematica de cada autorizacion (solo para agrupar en pantalla; el PDF
-- conserva la tabla continua 1-82 del formato).
ALTER TABLE public.rh_assignment_authorization_items ADD COLUMN IF NOT EXISTS group_order INTEGER NULL;
ALTER TABLE public.rh_assignment_authorization_items ADD COLUMN IF NOT EXISTS group_label TEXT NULL;
UPDATE public.rh_assignment_authorization_items i
   SET group_order = g.ord, group_label = g.label
  FROM (VALUES
    (1, 1, 8, 'Generales'),
    (2, 9, 14, 'Pacientes y datos'),
    (3, 15, 23, 'Toma y manejo de muestras'),
    (4, 24, 30, 'Equipos y reactivos'),
    (5, 31, 35, 'Métodos analíticos'),
    (6, 36, 38, 'Control de calidad'),
    (7, 39, 45, 'Resultados y asesoría clínica'),
    (8, 46, 54, 'Bioseguridad y equipo de laboratorio'),
    (9, 55, 60, 'Compras, insumos y almacén'),
    (10, 61, 68, 'Sistema de Gestión de la Calidad'),
    (11, 69, 74, 'Personal'),
    (12, 75, 80, 'Sistemas de información'),
    (13, 81, 82, 'Firmas y otras')
  ) AS g(ord, first_no, last_no, label)
 WHERE i.form_code = 'REH-REG-008' AND i.form_revision = 1 AND i.item_no BETWEEN g.first_no AND g.last_no AND i.group_label IS NULL;

UPDATE public.document_types
   SET name = 'Carta de asignación de puesto (REH-REG-008)'
 WHERE code = 'POSITION_ASSIGNMENT';

COMMIT;
