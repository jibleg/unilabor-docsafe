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
