-- Movimientos del activo (ISO 15189:2022, trazabilidad de cambios).
--
-- Registra los cambios de unidad / area / categoria / responsable de un activo.
-- Cuando cambia unidad, area o categoria, el codigo de inventario se regenera
-- (UNIDAD-AREA-CATEGORIA-NNN, consecutivo por area) y se puede reimprimir la
-- etiqueta. Cada movimiento deja evidencia con firma electronica de los
-- involucrados (quien ejecuta + responsable destino) y un evento MOVEMENT en el
-- expediente del activo. Sin PDF (la evidencia son las firmas + el evento).
--
-- Aditivo y no destructivo.
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.helpdesk_movement_code_seq;

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_movements (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT NOT NULL,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id) ON DELETE CASCADE,
  movement_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NULL,
  -- Estado antes/después (NULL en el lado que no cambia).
  from_unit_id BIGINT NULL REFERENCES public.helpdesk_asset_units(id),
  to_unit_id BIGINT NULL REFERENCES public.helpdesk_asset_units(id),
  from_area_id BIGINT NULL REFERENCES public.helpdesk_asset_areas(id),
  to_area_id BIGINT NULL REFERENCES public.helpdesk_asset_areas(id),
  from_category_id BIGINT NULL REFERENCES public.helpdesk_asset_categories(id),
  to_category_id BIGINT NULL REFERENCES public.helpdesk_asset_categories(id),
  from_asset_code TEXT NULL,
  to_asset_code TEXT NULL,
  code_changed BOOLEAN NOT NULL DEFAULT FALSE,
  -- Involucrados + firma electronica trazada (PNG en disco).
  performed_by_user_id UUID NULL REFERENCES public.users(id),
  performed_by_name TEXT NOT NULL,
  performed_by_signature_path TEXT NULL,
  responsible_user_id UUID NULL REFERENCES public.users(id),
  responsible_name TEXT NOT NULL,
  responsible_signature_path TEXT NULL,
  -- Evento de ciclo de vida generado (trazabilidad en el expediente).
  lifecycle_event_id BIGINT NULL REFERENCES public.helpdesk_asset_lifecycle_events(id) ON DELETE SET NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_asset_movements_folio
  ON public.helpdesk_asset_movements (folio);
CREATE INDEX IF NOT EXISTS ix_helpdesk_asset_movements_asset
  ON public.helpdesk_asset_movements (asset_id, movement_at DESC);

-- Tipo de evento de ciclo de vida para el movimiento/reasignacion.
INSERT INTO public.helpdesk_lifecycle_event_types (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('MOVEMENT', 'Movimiento / Reasignacion', 'Cambio de unidad, area, categoria o responsable del activo.', 65)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_lifecycle_event_types existing WHERE UPPER(existing.code) = source.code
);

SELECT setval(
  'public.helpdesk_movement_code_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.helpdesk_asset_movements), 0), 1),
  COALESCE((SELECT MAX(id) FROM public.helpdesk_asset_movements), 0) > 0
);

COMMIT;
