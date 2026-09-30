-- MIGRACIONES_DEPLOY_20260929.sql — aplicar por psql desde el VPS (o pgAdmin) en prod (sgc.unilabor-app.com)
-- Contiene 20260929_01 (capacitaciones por puesto como fuente de la seccion 3 "Conocimiento" del
-- REH-REG-003) y 20260929_02 (mapeo documento de fase -> tipo del expediente para archivar la
-- copia firmada; semilla Fase 1: RIT/CDC/PCE) y 20260929_03 (seccion abierta Constancias: tipo generico
-- CONSTANCIA, migra ~666 constancias de las 48 casillas y las desactiva), registradas en schema_migrations.
-- PRE-CHEQUEO: la ultima aplicada en prod debe ser 20260925_03.
-- EFECTO EN PROD: 1 tabla nueva (rh_position_training_courses), el CHECK de
-- rh_competency_evaluations.knowledge_selection_mode admite 'course', y 1 columna nueva en
-- rh_induction_phase_documents (expedient_document_type_id) con semilla en 3 filas de la Fase 1;
-- 2 columnas nuevas en document_sections, 1 tipo nuevo, UPDATE masivo de employee_documents
-- (document_type_id/reference_key de las constancias) y 48 tipos desactivados. No borra filas.
-- Aplicar ANTES del deploy del backend.
BEGIN;

-- ============ 20260929_01_rh_position_training_courses.sql ============
-- =============================================================================
-- RH/Evaluacion de competencia (REH-REG-003) - Seccion 3 "Conocimiento" desde la
-- capacitacion del puesto (Fase 7).
--
-- 1) Catalogo puesto <-> capacitacion: cada puesto tiene 0..N capacitaciones
--    (training_courses) cuyas evaluaciones sirven como fuente de la seccion 3.
-- 2) La seccion 3 admite un nuevo origen 'course' (ademas de 'random'/'fixed'
--    del banco IA del puesto): el cuestionario publicado de la capacitacion se
--    asigna al colaborador (o se toma su ultimo intento) y sus preguntas y
--    respuestas se vuelcan a la seccion 3.
--
-- 100% ADITIVA: 1 tabla nueva + ampliacion del CHECK de knowledge_selection_mode.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.rh_position_training_courses (
  id BIGSERIAL PRIMARY KEY,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  training_course_id BIGINT NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_position_training_courses
  ON public.rh_position_training_courses (position_id, training_course_id);
CREATE INDEX IF NOT EXISTS idx_rh_position_training_courses_course
  ON public.rh_position_training_courses (training_course_id);

ALTER TABLE public.rh_competency_evaluations
  DROP CONSTRAINT IF EXISTS chk_rh_comp_eval_knowledge_mode;
ALTER TABLE public.rh_competency_evaluations
  ADD CONSTRAINT chk_rh_comp_eval_knowledge_mode
  CHECK (knowledge_selection_mode IS NULL OR knowledge_selection_mode IN ('random', 'fixed', 'course'));

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260929_01_rh_position_training_courses.sql', 'e296d05624d9964f90e0e956f7f363c1cabc8f6e0d7f5da67132eaf1145cc0d3')
ON CONFLICT DO NOTHING;

-- ============ 20260929_02_rh_induction_phase_documents_expedient_type.sql ============
-- =============================================================================
-- RH/Induccion - Copia firmada de los documentos de la fase al expediente.
-- Cada documento de una fase puede mapearse (configurable por RH, sin nada fijo
-- en codigo) a un tipo documental del expediente: al firmar la lectura, la copia
-- firmada se archiva como nueva version de ese tipo en el expediente del
-- colaborador (la version previa queda 'superseded', nunca se borra).
-- Semilla inicial (decision RH 2026-09-29): Fase 1 -> RIT, CDC y PCE.
-- =============================================================================

ALTER TABLE public.rh_induction_phase_documents
  ADD COLUMN IF NOT EXISTS expedient_document_type_id BIGINT NULL
    REFERENCES public.document_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rh_induction_phase_documents.expedient_document_type_id IS
  'Tipo documental del expediente donde se archiva la copia firmada de la lectura (NULL = no se archiva).';

CREATE INDEX IF NOT EXISTS idx_rh_induction_phase_documents_expedient_type
  ON public.rh_induction_phase_documents (expedient_document_type_id)
  WHERE expedient_document_type_id IS NOT NULL;

-- Semilla: los 3 documentos de la Fase 1 acordados con RH (por codigo, solo si existen).
UPDATE public.rh_induction_phase_documents pd
   SET expedient_document_type_id = dt.id
  FROM public.rh_induction_phases ph,
       public.documents d,
       public.document_types dt
 WHERE ph.id = pd.phase_id
   AND ph.phase_number = 1
   AND d.id = pd.document_id
   AND pd.expedient_document_type_id IS NULL
   AND dt.is_active = TRUE
   AND (
        (d.code = 'REH-INS-001' AND dt.code = 'RIT')
     OR (d.code = 'REH-REG-009' AND dt.code = 'CDC')
     OR (d.code = 'REH-REG-010' AND dt.code = 'PCE')
   );

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260929_02_rh_induction_phase_documents_expedient_type.sql', 'c5bb6747b823ecad96114a4ee4ba0bb427f5ed6a1ab9aea16cd7058bd2817de3')
ON CONFLICT DO NOTHING;

-- ============ 20260929_03_expedient_open_section_constancias.sql ============
-- =============================================================================
-- RH/Expediente - Seccion abierta "Constancias".
-- Antes: 48 casillas genericas (Constancia 01..48) iguales para todos, con un
-- PDF vigente por casilla. Ahora: la seccion es ABIERTA: lista los documentos
-- reales del colaborador (cada constancia con su titulo/fechas/PDF, sin tope),
-- creados por RH o por el propio colaborador con un tipo generico CONSTANCIA y
-- reference_key propio por constancia (mismo mecanismo que las constancias de
-- curso). Las constancias ya cargadas en las casillas se migran al tipo generico
-- conservando archivo, titulo, fechas e historial; las 48 casillas se desactivan
-- (no se borran). No se borra ningun documento.
-- =============================================================================

ALTER TABLE public.document_sections
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS open_document_type_id BIGINT NULL
    REFERENCES public.document_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.document_sections.is_open IS
  'TRUE = seccion abierta: lista documentos reales (varios por tipo, sin casillas vacias).';
COMMENT ON COLUMN public.document_sections.open_document_type_id IS
  'Tipo documental generico con el que se crean los documentos nuevos de una seccion abierta.';

-- 1) Tipo generico "Constancia" en la seccion Constancias (CERTIFICATES).
INSERT INTO public.document_types
  (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_system_defined, is_active, sort_order)
SELECT s.id, 'CONSTANCIA', 'Constancia',
       'Constancia, diploma o reconocimiento del colaborador. Cada constancia es un documento propio con su titulo, fechas y PDF.',
       FALSE, FALSE, FALSE, TRUE, TRUE, 0
  FROM public.document_sections s
 WHERE UPPER(s.code) = 'CERTIFICATES'
   AND NOT EXISTS (SELECT 1 FROM public.document_types WHERE UPPER(code) = 'CONSTANCIA');

-- 2) Acceso al tipo nuevo para todos los colaboradores (el runtime lo completa para altas futuras).
INSERT INTO public.employee_document_type_access (employee_id, document_type_id, is_enabled)
SELECT e.id, dt.id, TRUE
  FROM public.employees e
 CROSS JOIN public.document_types dt
 WHERE UPPER(dt.code) = 'CONSTANCIA'
ON CONFLICT (employee_id, document_type_id) DO NOTHING;

-- 3) Migrar las constancias de las casillas al tipo generico. Cada casilla de
--    cada colaborador (todas sus versiones) se vuelve una linea propia via
--    reference_key, por lo que el historial y la unicidad de vigente se conservan.
WITH slots AS (
  SELECT t.id
    FROM public.document_types t
   INNER JOIN public.document_sections s ON s.id = t.section_id
   WHERE UPPER(s.code) = 'CERTIFICATES'
     AND t.is_system_defined = FALSE
     AND t.name ~ '^Constancia [0-9]{2}$'
),
target AS (
  SELECT id FROM public.document_types WHERE UPPER(code) = 'CONSTANCIA'
)
UPDATE public.employee_documents d
   SET reference_key = COALESCE(d.reference_key, 'constancia:slot:' || d.document_type_id || ':' || d.employee_id),
       document_type_id = (SELECT id FROM target),
       updated_at = NOW()
  FROM slots
 WHERE d.document_type_id = slots.id;

-- 4) La seccion pasa a abierta con el tipo generico.
UPDATE public.document_sections s
   SET is_open = TRUE,
       open_document_type_id = (SELECT id FROM public.document_types WHERE UPPER(code) = 'CONSTANCIA'),
       updated_at = NOW()
 WHERE UPPER(s.code) = 'CERTIFICATES';

-- 5) Desactivar (no borrar) las 48 casillas, ya sin documentos.
UPDATE public.document_types t
   SET is_active = FALSE,
       updated_at = NOW()
  FROM public.document_sections s
 WHERE s.id = t.section_id
   AND UPPER(s.code) = 'CERTIFICATES'
   AND t.is_system_defined = FALSE
   AND t.name ~ '^Constancia [0-9]{2}$'
   AND NOT EXISTS (SELECT 1 FROM public.employee_documents d WHERE d.document_type_id = t.id);

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260929_03_expedient_open_section_constancias.sql', '685bc342f804ff3f9f67fefecb7861abb2d340d6ba61a7d0259bb0a5d3d4c353')
ON CONFLICT DO NOTHING;

COMMIT;
