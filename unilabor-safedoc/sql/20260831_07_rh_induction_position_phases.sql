-- =============================================================================
-- RH - Fases 5 y 6 de Induccion (POSITION: tecnica por puesto y practica
--      supervisada) — el "bloque futuro" previsto en 20260828_02.
--
-- Cada puesto habilita su propia training_course por fase POSITION (5-6), de
-- modo que TODO el motor existente (plantilla de evaluacion quiz/practica,
-- asignacion, calificacion, constancia oficial de Induccion, archivo en
-- PROG_IND) se reusa sin tocarlo:
--   Fase 5: lectura de los documentos del puesto (rh_position_documents) en
--           Sala de Lectura + cuestionario del curso del puesto.
--   Fase 6: practica supervisada -> evaluacion tipo 'practical' (RH captura
--           la calificacion 0-10 en la pantalla existente).
-- La Fase 7 NO usa esta tabla: su instrumento es el REH-REG-003.
--
-- 100% ADITIVA: 1 tabla puente + 1 columna NULL-able en enrollments (el curso
-- resuelto al inscribir, porque para fases POSITION depende del puesto del
-- colaborador y no de la fase).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_induction_phase_positions (
  id BIGSERIAL PRIMARY KEY,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  position_id BIGINT NOT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE,
  training_course_id BIGINT NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_phase_positions
  ON public.rh_induction_phase_positions (phase_id, position_id);

CREATE INDEX IF NOT EXISTS idx_rh_induction_phase_positions_course
  ON public.rh_induction_phase_positions (training_course_id);

ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS training_course_id BIGINT NULL REFERENCES public.training_courses(id) ON DELETE SET NULL;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT to_regclass('public.rh_induction_phase_positions');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'rh_induction_enrollments' AND column_name = 'training_course_id';
-- =============================================================================
