-- Limite de tiempo de lectura por fase de induccion (horas). Al inscribir se
-- congela la fecha limite en el enrollment (reading_deadline_at); al vencer,
-- la evaluacion de la fase se abre aunque la lectura no este completa.
ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS reading_time_limit_hours integer
  CHECK (reading_time_limit_hours IS NULL OR reading_time_limit_hours > 0);

ALTER TABLE public.rh_induction_enrollments
  ADD COLUMN IF NOT EXISTS reading_deadline_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rh_induction_enrollments_reading_deadline
  ON public.rh_induction_enrollments (reading_deadline_at)
  WHERE reading_deadline_at IS NOT NULL AND evaluation_assignment_id IS NULL;
