-- Limite de duracion del intento en evaluaciones tipo quiz: minutos que tiene
-- el colaborador para terminar desde que pulsa "Iniciar" (NULL = sin limite).
-- Complementa a window_hours (plazo para PRESENTAR desde la asignacion).
ALTER TABLE public.evaluation_templates
  ADD COLUMN IF NOT EXISTS attempt_time_limit_minutes integer
  CHECK (attempt_time_limit_minutes IS NULL OR attempt_time_limit_minutes > 0);
