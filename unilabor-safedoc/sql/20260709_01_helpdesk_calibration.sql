-- Modulo de Calibracion (ISO 15189:2022, control metrologico 6.5).
-- Motor espejo del de mantenimiento (planes -> ordenes programadas con
-- recurrencia al cerrar), pero orientado a certificados en vez de checklist:
-- la orden captura numero de certificado y proxima fecha de calibracion.
-- Reusa el catalogo generico public.helpdesk_maintenance_frequencies
-- (interval_months) para no duplicar frecuencias.
-- schedule_mode admite FREQUENCY (deriva la proxima fecha del intervalo) o
-- CALENDAR (fechas explicitas provistas por el proveedor/responsable).
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.helpdesk_calibration_plan_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.helpdesk_calibration_order_code_seq;

CREATE TABLE IF NOT EXISTS public.helpdesk_calibration_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_code TEXT NOT NULL,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id),
  frequency_id BIGINT NULL REFERENCES public.helpdesk_maintenance_frequencies(id),
  schedule_mode TEXT NOT NULL DEFAULT 'FREQUENCY',
  responsible_employee_id BIGINT NULL REFERENCES public.employees(id),
  provider_name TEXT NULL,
  standard_ref TEXT NULL,
  quality_document_id UUID NULL REFERENCES public.documents(id),
  title TEXT NOT NULL,
  description TEXT NULL,
  starts_on DATE NOT NULL,
  next_due_on DATE NOT NULL,
  tolerance_before_days INTEGER NOT NULL DEFAULT 0,
  tolerance_after_days INTEGER NOT NULL DEFAULT 0,
  certificate_required BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_calibration_plans_plan_code
  ON public.helpdesk_calibration_plans (UPPER(plan_code))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS ix_helpdesk_calibration_plans_asset_id
  ON public.helpdesk_calibration_plans (asset_id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_calibration_plans_next_due_on
  ON public.helpdesk_calibration_plans (next_due_on);

CREATE TABLE IF NOT EXISTS public.helpdesk_calibration_orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT NOT NULL,
  plan_id BIGINT NOT NULL REFERENCES public.helpdesk_calibration_plans(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id),
  scheduled_for DATE NOT NULL,
  window_starts_on DATE NULL,
  window_ends_on DATE NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  completed_by_user_id UUID NULL REFERENCES public.users(id),
  provider_name TEXT NULL,
  result TEXT NULL,
  certificate_no TEXT NULL,
  calibration_due_on DATE NULL,
  findings TEXT NULL,
  evidence_notes TEXT NULL,
  lifecycle_event_id BIGINT NULL REFERENCES public.helpdesk_asset_lifecycle_events(id),
  rescheduled_from DATE NULL,
  rescheduled_at TIMESTAMPTZ NULL,
  reschedule_reason TEXT NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_calibration_orders_order_code
  ON public.helpdesk_calibration_orders (UPPER(order_code));

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_calibration_orders_plan_date
  ON public.helpdesk_calibration_orders (plan_id, scheduled_for);

CREATE INDEX IF NOT EXISTS ix_helpdesk_calibration_orders_scheduled_for
  ON public.helpdesk_calibration_orders (scheduled_for, status);

CREATE INDEX IF NOT EXISTS ix_helpdesk_calibration_orders_status
  ON public.helpdesk_calibration_orders (status, scheduled_for);

-- Alinear las secuencias con el maximo id existente (idempotencia en re-corridas).
SELECT setval(
  'public.helpdesk_calibration_plan_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_calibration_plans), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_calibration_plans), 0) > 0
);

SELECT setval(
  'public.helpdesk_calibration_order_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_calibration_orders), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_calibration_orders), 0) > 0
);

COMMIT;
