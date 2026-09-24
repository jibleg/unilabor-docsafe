-- MIGRACIONES_DEPLOY_20260924.sql — aplicar por pgAdmin (o psql desde el VPS) en prod (sgc.unilabor-app.com)
-- Contiene 20260924_01 (baja logica de eventos del ciclo de vida y evidencias del expediente
-- del activo) y la registra en schema_migrations con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260922_02:
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- EFECTO EN PROD: agrega columnas is_active (default TRUE), deleted_at, deleted_by_user_id y
-- deleted_reason a helpdesk_asset_lifecycle_events y helpdesk_asset_documents (+ updated_at y
-- updated_by_user_id en documentos) y 2 indices. No modifica ni borra filas existentes.
-- Aplicar ANTES del deploy del backend: el codigo nuevo filtra por is_active al listar el expediente.
BEGIN;

-- ============ 20260924_01_helpdesk_lifecycle_evidence_soft_delete.sql ============

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

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260924_01_helpdesk_lifecycle_evidence_soft_delete.sql', 'a98aa5e2135761a429b2edb985a7555d6a519632f1e0f8578600c9b2c874438e');

COMMIT;

-- POST-CHEQUEO:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'helpdesk_asset_lifecycle_events' AND column_name IN ('is_active','deleted_at','deleted_by_user_id','deleted_reason');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'helpdesk_asset_documents' AND column_name IN ('is_active','deleted_at','updated_at','updated_by_user_id');
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 1;  -- 20260924_01_...
