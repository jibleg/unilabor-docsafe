-- Bandeja de salida: guarda el contenido del envio (asunto y cuerpo) ademas del
-- estado, para trazabilidad completa de correos y SMS. Extiende notification_log.
BEGIN;

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS subject TEXT NULL,
  ADD COLUMN IF NOT EXISTS body TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON public.notification_log (channel);

COMMIT;
