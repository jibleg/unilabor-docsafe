-- Sprint 38 (EVAL-78) - Solicitud de autorizacion extemporanea.
-- Marca cuando el colaborador (o RH a su nombre) solicita reabrir una evaluacion
-- vencida. RH la autoriza reabriendo la ventana.
BEGIN;

ALTER TABLE public.evaluation_assignments
  ADD COLUMN IF NOT EXISTS late_requested_at TIMESTAMPTZ NULL;

COMMIT;
