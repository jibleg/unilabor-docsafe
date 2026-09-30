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
