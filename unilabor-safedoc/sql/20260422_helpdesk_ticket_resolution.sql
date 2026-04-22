BEGIN;

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS solved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS solution_summary TEXT NULL,
  ADD COLUMN IF NOT EXISTS return_to_operation_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS validated_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS equipment_status_after_solution_id BIGINT NULL REFERENCES public.helpdesk_operational_statuses(id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_solved_at
  ON public.helpdesk_tickets (solved_at);

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_return_to_operation_at
  ON public.helpdesk_tickets (return_to_operation_at);

COMMIT;
