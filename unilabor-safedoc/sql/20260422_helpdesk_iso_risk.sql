BEGIN;

ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'NOT_EVALUATED',
  ADD COLUMN IF NOT EXISTS impact_evaluation TEXT NULL,
  ADD COLUMN IF NOT EXISTS recent_analysis_usage TEXT NULL,
  ADD COLUMN IF NOT EXISTS alternate_equipment_used BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alternate_equipment_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS corrective_action_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS corrective_action_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS impact_evaluated_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS impact_evaluated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS technical_release_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS technical_release_summary TEXT NULL,
  ADD COLUMN IF NOT EXISTS technical_released_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS technical_released_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS quality_document_id UUID NULL REFERENCES public.documents(id),
  ADD COLUMN IF NOT EXISTS operational_lock BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_risk_level
  ON public.helpdesk_tickets (risk_level);

CREATE INDEX IF NOT EXISTS ix_helpdesk_tickets_operational_lock
  ON public.helpdesk_tickets (operational_lock)
  WHERE operational_lock = TRUE;

COMMIT;
