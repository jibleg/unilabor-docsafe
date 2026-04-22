BEGIN;

CREATE TABLE IF NOT EXISTS public.helpdesk_maintenance_frequencies (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  interval_months INTEGER NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_maintenance_frequencies_code
  ON public.helpdesk_maintenance_frequencies (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_maintenance_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_code TEXT NOT NULL,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id),
  frequency_id BIGINT NULL REFERENCES public.helpdesk_maintenance_frequencies(id),
  responsible_employee_id BIGINT NULL REFERENCES public.employees(id),
  provider_name TEXT NULL,
  quality_document_id UUID NULL REFERENCES public.documents(id),
  title TEXT NOT NULL,
  description TEXT NULL,
  starts_on DATE NOT NULL,
  next_due_on DATE NOT NULL,
  tolerance_before_days INTEGER NOT NULL DEFAULT 0,
  tolerance_after_days INTEGER NOT NULL DEFAULT 0,
  checklist_required BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_maintenance_plans_plan_code
  ON public.helpdesk_maintenance_plans (UPPER(plan_code))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS ix_helpdesk_maintenance_plans_asset_id
  ON public.helpdesk_maintenance_plans (asset_id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_maintenance_plans_next_due_on
  ON public.helpdesk_maintenance_plans (next_due_on);

CREATE TABLE IF NOT EXISTS public.helpdesk_maintenance_plan_tasks (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES public.helpdesk_maintenance_plans(id) ON DELETE CASCADE,
  task_text TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_maintenance_plan_tasks_plan_id
  ON public.helpdesk_maintenance_plan_tasks (plan_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS public.helpdesk_maintenance_orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT NOT NULL,
  plan_id BIGINT NOT NULL REFERENCES public.helpdesk_maintenance_plans(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id),
  scheduled_for DATE NOT NULL,
  window_starts_on DATE NULL,
  window_ends_on DATE NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_maintenance_orders_order_code
  ON public.helpdesk_maintenance_orders (UPPER(order_code));

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_maintenance_orders_plan_date
  ON public.helpdesk_maintenance_orders (plan_id, scheduled_for);

CREATE INDEX IF NOT EXISTS ix_helpdesk_maintenance_orders_scheduled_for
  ON public.helpdesk_maintenance_orders (scheduled_for, status);

INSERT INTO public.helpdesk_maintenance_frequencies (code, name, interval_months, description, sort_order)
SELECT source.code, source.name, source.interval_months, source.description, source.sort_order
FROM (
  VALUES
    ('MONTHLY', 'Mensual', 1, 'Ejecucion cada mes.', 10),
    ('QUARTERLY', 'Trimestral', 3, 'Ejecucion cada tres meses.', 20),
    ('SEMIANNUAL', 'Semestral', 6, 'Ejecucion cada seis meses.', 30),
    ('ANNUAL', 'Anual', 12, 'Ejecucion cada doce meses.', 40),
    ('CUSTOM', 'Personalizada', 1, 'Frecuencia definida operativamente.', 999)
) AS source(code, name, interval_months, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_maintenance_frequencies existing WHERE UPPER(existing.code) = source.code
);

COMMIT;
