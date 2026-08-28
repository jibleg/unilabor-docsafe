-- =============================================================================
-- Agrega 'whatsapp' como canal valido de notification_log (integracion Whapi
-- Cloud, usada primero por el modulo de induccion para avisar al responsable
-- de fase). 100% ADITIVA: solo amplia el CHECK existente, no borra datos.
-- =============================================================================
BEGIN;

ALTER TABLE public.notification_log
  DROP CONSTRAINT IF EXISTS chk_notification_channel;

ALTER TABLE public.notification_log
  ADD CONSTRAINT chk_notification_channel CHECK (channel IN ('email', 'sms', 'whatsapp'));

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname = 'chk_notification_channel';
-- =============================================================================
