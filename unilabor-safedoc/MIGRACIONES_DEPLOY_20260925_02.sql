-- MIGRACIONES_DEPLOY_20260925_02.sql — aplicar por pgAdmin (o psql desde el VPS) en prod (sgc.unilabor-app.com)
-- Contiene 20260925_03 (Acuerdos: borrado logico de documentos con historico en provider_documents y
-- client_documents) y la registra en schema_migrations con el checksum del runner.
-- PRE-CHEQUEO: la ultima aplicada en prod debe ser 20260925_02 (deploy del 2026-09-25 12:31).
-- EFECTO EN PROD: 2 columnas NULL (deleted_at, deleted_by) + indice parcial en cada tabla. No modifica datos.
-- Aplicar ANTES del deploy del backend (los listados filtran por deleted_at).
BEGIN;

-- ============ 20260925_03_agreements_documents_soft_delete.sql ============
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

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260925_03_agreements_documents_soft_delete.sql', '75608d97b0e09123fbf92ebcce73f90d342ee2dc2fb5fa126b51878fa2d3c280')
ON CONFLICT DO NOTHING;

COMMIT;
