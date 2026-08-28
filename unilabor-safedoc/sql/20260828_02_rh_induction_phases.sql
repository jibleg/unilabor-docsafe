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
BEGIN;

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

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT phase_number, name, scope, training_course_id FROM public.rh_induction_phases ORDER BY phase_number;
--   SELECT code, title FROM public.training_courses WHERE code LIKE 'INDUCCION-FASE-%' ORDER BY code;
--   SELECT to_regclass('public.rh_induction_phase_documents'), to_regclass('public.rh_induction_enrollments'),
--          to_regclass('public.rh_induction_reading_items');
-- =============================================================================
