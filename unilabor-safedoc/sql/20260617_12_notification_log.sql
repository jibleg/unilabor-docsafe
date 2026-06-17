-- Sprint 37 (EVAL-66) - Bitacora de notificaciones (notification_log).
-- Trazabilidad ISO de los avisos por correo y SMS (disponibilidad de evaluacion,
-- no-acreditado). Registra exito/fallo sin bloquear el flujo de negocio.
BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_log (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  assignment_id BIGINT NULL REFERENCES public.evaluation_assignments(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  error TEXT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_notification_channel CHECK (channel IN ('email', 'sms')),
  CONSTRAINT chk_notification_status CHECK (status IN ('sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_notification_log_assignment
  ON public.notification_log (assignment_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at
  ON public.notification_log (sent_at DESC);

COMMIT;
