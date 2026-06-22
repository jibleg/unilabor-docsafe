BEGIN;

-- =====================================================================
-- HD-ISO-04: Construye la tabla helpdesk_asset_documents (existente pero sin uso)
-- como sistema de evidencias: enlace a evento de ciclo de vida, categoria
-- (document_kind), y versionado portado de employee_documents.
-- =====================================================================

ALTER TABLE public.helpdesk_asset_documents
  ADD COLUMN IF NOT EXISTS lifecycle_event_id BIGINT NULL
    REFERENCES public.helpdesk_asset_lifecycle_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_kind_id BIGINT NULL
    REFERENCES public.helpdesk_document_kinds(id),
  ADD COLUMN IF NOT EXISTS reference_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS replaces_document_id BIGINT NULL
    REFERENCES public.helpdesk_asset_documents(id),
  ADD COLUMN IF NOT EXISTS issued_on DATE NULL,
  ADD COLUMN IF NOT EXISTS expires_on DATE NULL;

CREATE INDEX IF NOT EXISTS ix_hd_asset_docs_event
  ON public.helpdesk_asset_documents (lifecycle_event_id);

CREATE INDEX IF NOT EXISTS ix_hd_asset_docs_current
  ON public.helpdesk_asset_documents (asset_id, is_current);

COMMIT;
