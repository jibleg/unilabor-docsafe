-- =============================================================================
-- Contacto del responsable de fase (nombre + telefono), para poder avisarle
-- por WhatsApp (Whapi Cloud) cuando un colaborador queda listo para su
-- evaluacion. RH lo captura manualmente por fase (arranca vacio/NULL, no
-- bloquea nada si no se configura: la notificacion simplemente se omite).
-- 100% ADITIVA.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_induction_phases
  ADD COLUMN IF NOT EXISTS responsible_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS responsible_phone TEXT NULL;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'rh_induction_phases' AND column_name IN ('responsible_name', 'responsible_phone');
-- =============================================================================
