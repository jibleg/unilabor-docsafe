-- Sprint 31 (EVAL-02) - Plantillas de evaluacion (evaluation_templates).
-- Una plantilla pertenece a una capacitacion y define la regla de calificacion,
-- la ventana de tiempo y el modo de entrega del banco de preguntas.
-- requires_manual_grading NO se almacena: se deriva en consulta de la existencia
-- de preguntas tipo 'open' (evita desincronizacion).
BEGIN;

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

COMMIT;
