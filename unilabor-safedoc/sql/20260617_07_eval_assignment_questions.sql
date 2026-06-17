-- Sprint 32 (EVAL-17) - Snapshot de preguntas por asignacion.
-- Fija que preguntas le tocaron a cada colaborador (clave para el modo aleatorio:
-- cada asignacion recibe su propio subconjunto). Se congela al instanciar.
BEGIN;

CREATE TABLE IF NOT EXISTS public.evaluation_assignment_questions (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES public.evaluation_assignments(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES public.evaluation_questions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_eval_assignment_questions UNIQUE (assignment_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_assignment_questions_assignment
  ON public.evaluation_assignment_questions (assignment_id);

COMMIT;
