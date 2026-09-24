BEGIN;

-- =====================================================================
-- Baja logica de eventos del ciclo de vida y de evidencias documentales
-- del expediente del equipo (ISO 15189). Nunca se borra fisicamente: la
-- fila queda con is_active = FALSE + quien/cuando/por que, y deja de
-- listarse en el expediente. Los PDF permanecen en disco.
-- =====================================================================

ALTER TABLE public.helpdesk_asset_lifecycle_events
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS ix_hd_lifecycle_events_asset_active
  ON public.helpdesk_asset_lifecycle_events (asset_id, is_active);

ALTER TABLE public.helpdesk_asset_documents
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID NULL REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS ix_hd_asset_docs_asset_active
  ON public.helpdesk_asset_documents (asset_id, is_active);

COMMIT;
