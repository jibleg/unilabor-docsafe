-- Sprint 31 (EVAL-03) - Banco de preguntas (evaluation_questions).
-- Tipos: single/multiple/boolean = auto-calificables; open = calificacion manual por RH.
BEGIN;

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

COMMIT;
