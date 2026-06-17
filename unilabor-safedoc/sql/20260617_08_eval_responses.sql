-- Sprint 33 (EVAL-28) - Respuestas del colaborador (evaluation_responses).
-- Una fila por (asignacion, pregunta). selected_option_ids para preguntas de
-- opcion (single/multiple/boolean); text_answer para abiertas. is_correct y
-- points_awarded los fija la auto-calificacion (objetivas) o RH (abiertas).
BEGIN;

CREATE TABLE IF NOT EXISTS public.evaluation_responses (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES public.evaluation_assignments(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES public.evaluation_questions(id) ON DELETE CASCADE,
  selected_option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  text_answer TEXT NULL,
  is_correct BOOLEAN NULL,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  graded_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_eval_responses UNIQUE (assignment_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_responses_assignment
  ON public.evaluation_responses (assignment_id);

COMMIT;
