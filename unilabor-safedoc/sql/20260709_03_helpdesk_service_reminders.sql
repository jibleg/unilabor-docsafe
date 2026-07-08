-- Recordatorios de servicio (mantenimiento y calibracion): marca de idempotencia
-- para que el cron avise una sola vez por orden. Se reinicia (NULL) al reprogramar
-- una orden para que el aviso vuelva a dispararse con la nueva fecha.
BEGIN;

ALTER TABLE public.helpdesk_maintenance_orders
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ NULL;

ALTER TABLE public.helpdesk_calibration_orders
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ NULL;

COMMIT;
