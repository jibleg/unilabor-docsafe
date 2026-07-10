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
