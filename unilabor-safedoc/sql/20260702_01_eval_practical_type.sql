-- Sprint 40 (EVAL-93) - Tipo de evaluacion en evaluation_templates.
-- Distingue las evaluaciones tipo 'quiz' (cuestionario que contesta el colaborador,
-- Sprints 31-39) de las 'practical' (capacitacion presencial: RH captura la
-- calificacion directamente, sin cuestionario). Aditivo y no destructivo:
-- default 'quiz' -> las plantillas y evaluaciones existentes no cambian.
BEGIN;

ALTER TABLE public.evaluation_templates
  ADD COLUMN IF NOT EXISTS evaluation_type TEXT NOT NULL DEFAULT 'quiz';

ALTER TABLE public.evaluation_templates
  DROP CONSTRAINT IF EXISTS chk_eval_templates_type;

ALTER TABLE public.evaluation_templates
  ADD CONSTRAINT chk_eval_templates_type
  CHECK (evaluation_type IN ('quiz', 'practical'));

COMMIT;
