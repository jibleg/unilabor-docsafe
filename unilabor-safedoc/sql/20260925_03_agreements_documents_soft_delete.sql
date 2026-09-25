-- =============================================================================
-- Acuerdos (Proveedores y Clientes) - Borrado logico de documentos con historico
--
-- "Eliminar" un documento que forma parte de una cadena de versiones ya no se
-- rechaza: se OCULTA de la ficha (deleted_at/deleted_by) conservando el PDF y
-- la cadena replaces/replaced_by intactos; sigue visible en la trazabilidad con
-- la etiqueta "Eliminado" y se puede restaurar. Los documentos sin historico
-- conservan el borrado fisico de siempre.
--
-- 100% ADITIVA: 2 columnas + indice parcial en provider_documents y client_documents.
-- =============================================================================
ALTER TABLE public.provider_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_provider_documents_deleted
  ON public.provider_documents (provider_id) WHERE deleted_at IS NOT NULL;

ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_client_documents_deleted
  ON public.client_documents (client_id) WHERE deleted_at IS NOT NULL;
