-- ============================================================================
-- MIGRACION MANUAL PARA pgAdmin — Deploy 2026-07-11
-- Modulo "Gestion de Activos": activos compuestos (padre<->componentes) +
-- revision de la carga masiva (review_status PENDING/REVIEWED).
-- ============================================================================
-- Replica lo que hace el runner (node dist/scripts/migrate.js migrate):
--   cada migracion versionada se aplica y se registra en public.schema_migrations
--   con SU checksum SHA-256 (el mismo que calcula el runner), de modo que un
--   migrate/migrate:status posterior las vea YA aplicadas.
-- Ambas son ADITIVAS e IDEMPOTENTES (IF NOT EXISTS / ON CONFLICT DO NOTHING):
--   correr el script dos veces no rompe nada. Si 20260710_01 ya estuviera en prod,
--   su bloque es no-op.
-- Orden de aplicacion (respetar): el mismo de abajo.
-- ============================================================================

-- Tabla de control (en prod ya existe; se crea por seguridad).
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- [1/2] 20260710_01_helpdesk_asset_components.sql
-- SHA-256: 1871bfcfada0c911e21e76697b3b8d60bf6d8c4977d865c3d466221aa05a5dc8
-- ----------------------------------------------------------------------------
-- Activos compuestos: un activo "todo" (whole) integrado por componentes
-- (instrumento, computadora, UPS, monitor, lector, etc.). Auto-referencia:
-- un componente es un activo que apunta a su whole via parent_asset_id.
-- Whole = parent_asset_id IS NULL. Los activos planos siguen igual (whole sin hijos).
-- Solo 2 niveles: un componente no puede tener sub-componentes (se valida en el servicio).
BEGIN;

ALTER TABLE public.helpdesk_assets
  ADD COLUMN IF NOT EXISTS parent_asset_id BIGINT NULL
    REFERENCES public.helpdesk_assets(id) ON DELETE SET NULL;

-- No auto-referencia directa (un activo no puede ser su propio padre).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'helpdesk_assets_parent_not_self'
  ) THEN
    ALTER TABLE public.helpdesk_assets
      ADD CONSTRAINT helpdesk_assets_parent_not_self
      CHECK (parent_asset_id IS NULL OR parent_asset_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_helpdesk_assets_parent_asset_id
  ON public.helpdesk_assets (parent_asset_id)
  WHERE parent_asset_id IS NOT NULL;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260710_01_helpdesk_asset_components.sql', '1871bfcfada0c911e21e76697b3b8d60bf6d8c4977d865c3d466221aa05a5dc8')
ON CONFLICT (filename) DO NOTHING;

-- ----------------------------------------------------------------------------
-- [2/2] 20260711_01_helpdesk_asset_review.sql
-- SHA-256: 5173b7bde88f03df46bac572e1cf81f04915f146a1d29959e330572af4aa5e31
-- ----------------------------------------------------------------------------
-- Revision de carga: marca de calidad de dato para depurar la importacion masiva.
-- Es un eje INDEPENDIENTE del estado operativo (operational_status): indica si un
-- humano ya valido que los datos del activo (cargados en bloque) son correctos.
-- PENDING (default) = sin revisar; REVIEWED = revisado y confirmado.
-- Todo activo (importado o creado a mano) nace PENDING. Reversible.
BEGIN;

ALTER TABLE public.helpdesk_assets
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'helpdesk_assets_review_status_chk'
  ) THEN
    ALTER TABLE public.helpdesk_assets
      ADD CONSTRAINT helpdesk_assets_review_status_chk
      CHECK (review_status IN ('PENDING', 'REVIEWED'));
  END IF;
END $$;

-- Indice para el filtro/conteo Pendientes vs Revisados (solo activos vigentes).
CREATE INDEX IF NOT EXISTS ix_helpdesk_assets_review_status
  ON public.helpdesk_assets (review_status)
  WHERE is_active = TRUE;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260711_01_helpdesk_asset_review.sql', '5173b7bde88f03df46bac572e1cf81f04915f146a1d29959e330572af4aa5e31')
ON CONFLICT (filename) DO NOTHING;
