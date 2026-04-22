BEGIN;

ALTER TABLE public.helpdesk_maintenance_orders
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completed_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS performed_activities TEXT NULL,
  ADD COLUMN IF NOT EXISTS findings TEXT NULL,
  ADD COLUMN IF NOT EXISTS provider_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS result TEXT NULL,
  ADD COLUMN IF NOT EXISTS evidence_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_from DATE NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reschedule_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID NULL REFERENCES public.users(id);

CREATE TABLE IF NOT EXISTS public.helpdesk_maintenance_order_checklist (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.helpdesk_maintenance_orders(id) ON DELETE CASCADE,
  plan_task_id BIGINT NULL REFERENCES public.helpdesk_maintenance_plan_tasks(id) ON DELETE SET NULL,
  task_text TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'PENDING',
  notes TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_maintenance_order_checklist_task
  ON public.helpdesk_maintenance_order_checklist (order_id, plan_task_id)
  WHERE plan_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_helpdesk_maintenance_order_checklist_order_id
  ON public.helpdesk_maintenance_order_checklist (order_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS ix_helpdesk_maintenance_orders_status
  ON public.helpdesk_maintenance_orders (status, scheduled_for);

COMMIT;
