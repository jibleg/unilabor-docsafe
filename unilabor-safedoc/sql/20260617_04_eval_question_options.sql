-- Sprint 31 (EVAL-04) - Opciones de pregunta (evaluation_question_options).
-- Solo para tipos auto-calificables (single/multiple/boolean). is_correct marca la
-- respuesta correcta usada por la auto-calificacion de sprints posteriores.
BEGIN;

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

COMMIT;
