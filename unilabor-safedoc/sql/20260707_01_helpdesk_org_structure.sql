-- Estructura organizacional del inventario Help Desk (integridad referencial).
--
-- Modela dos relaciones muchos-a-muchos sobre los catalogos planos existentes
-- (helpdesk_asset_units, helpdesk_asset_areas) sin alterarlos:
--   * Unidad <-> Area: una unidad agrupa varias areas y un area puede pertenecer
--     a varias unidades (helpdesk_unit_areas).
--   * Area <-> Responsable: un area tiene uno o mas usuarios responsables y un
--     usuario puede ser responsable de varias areas (helpdesk_area_responsibles).
-- El responsable es un usuario del sistema (public.users, id UUID), no un empleado.
--
-- Aditivo y no destructivo: no toca datos ni columnas existentes. La jerarquia se
-- alimenta desde la nueva UI de estructura; las areas/activos actuales siguen
-- funcionando aunque aun no tengan relaciones cargadas.
BEGIN;

-- Unidad <-> Area (M:N)
CREATE TABLE IF NOT EXISTS public.helpdesk_unit_areas (
  unit_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_units(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_areas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (unit_id, area_id)
);
CREATE INDEX IF NOT EXISTS ix_helpdesk_unit_areas_area ON public.helpdesk_unit_areas (area_id);

-- Area <-> Responsable (users) (M:N)
CREATE TABLE IF NOT EXISTS public.helpdesk_area_responsibles (
  area_id BIGINT NOT NULL REFERENCES public.helpdesk_asset_areas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (area_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_helpdesk_area_responsibles_user ON public.helpdesk_area_responsibles (user_id);

COMMIT;
