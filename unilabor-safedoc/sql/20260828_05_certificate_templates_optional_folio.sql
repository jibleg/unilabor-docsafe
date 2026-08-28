-- =============================================================================
-- Constancias: el folio se vuelve opcional por plantilla (decision del usuario
-- para el modulo de Induccion, donde la constancia se identifica solo por el
-- nombre del colaborador, sin codigo). Default TRUE: ninguna capacitacion
-- existente cambia de comportamiento salvo que alguien lo desactive a proposito.
-- 100% ADITIVA.
-- =============================================================================
BEGIN;

ALTER TABLE public.certificate_templates
  ADD COLUMN IF NOT EXISTS show_folio BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT column_name, column_default FROM information_schema.columns
--     WHERE table_name = 'certificate_templates' AND column_name = 'show_folio';
-- =============================================================================
