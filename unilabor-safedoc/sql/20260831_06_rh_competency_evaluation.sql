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
BEGIN;

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

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT criterion_text, criticality FROM public.rh_performance_criteria ORDER BY sort_order;
--   SELECT to_regclass('public.rh_competency_evaluations'),
--          to_regclass('public.rh_competency_evaluation_items'),
--          to_regclass('public.rh_competency_evaluation_actions');
--   SELECT code FROM public.permissions WHERE code = 'RH.COMPETENCY.MANAGE';
-- =============================================================================
