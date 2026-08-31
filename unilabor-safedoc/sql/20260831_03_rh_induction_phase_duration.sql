-- =============================================================================
-- RH - Duracion (horas) por fase de Induccion
--
-- Campo "DURACION" de la constancia de Induccion: es propio de la FASE (no
-- del colaborador ni de la evaluacion) — todos los aprobados de la Fase 1
-- comparten la misma duracion. RH lo edita desde la pagina de fases.
--
-- 100% ADITIVA: 1 columna NULL-able en `rh_induction_phases`. Mismo patron
-- que 20260828_04 (contacto del responsable).
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(5,1) NULL;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT phase_number, name, duration_hours FROM public.rh_induction_phases ORDER BY phase_number;
-- =============================================================================
