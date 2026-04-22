BEGIN;

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_units (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_asset_units_code
  ON public.helpdesk_asset_units (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_areas (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_asset_areas_code
  ON public.helpdesk_asset_areas (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_brands (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_asset_brands_name
  ON public.helpdesk_asset_brands (UPPER(name));

CREATE TABLE IF NOT EXISTS public.helpdesk_purchase_modalities (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_purchase_modalities_code
  ON public.helpdesk_purchase_modalities (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_purchase_conditions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_purchase_conditions_code
  ON public.helpdesk_purchase_conditions (UPPER(code));

CREATE TABLE IF NOT EXISTS public.helpdesk_assets (
  id BIGSERIAL PRIMARY KEY,
  asset_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  category_id BIGINT NULL REFERENCES public.helpdesk_asset_categories(id),
  unit_id BIGINT NULL REFERENCES public.helpdesk_asset_units(id),
  area_id BIGINT NULL REFERENCES public.helpdesk_asset_areas(id),
  location_id BIGINT NULL REFERENCES public.helpdesk_locations(id),
  brand_id BIGINT NULL REFERENCES public.helpdesk_asset_brands(id),
  model TEXT NULL,
  serial_number TEXT NULL,
  complementary_info TEXT NULL,
  purchase_modality_id BIGINT NULL REFERENCES public.helpdesk_purchase_modalities(id),
  purchase_condition_id BIGINT NULL REFERENCES public.helpdesk_purchase_conditions(id),
  assigned_employee_id BIGINT NULL REFERENCES public.employees(id),
  responsible_employee_id BIGINT NULL REFERENCES public.employees(id),
  criticality_id BIGINT NULL REFERENCES public.helpdesk_criticalities(id),
  operational_status_id BIGINT NULL REFERENCES public.helpdesk_operational_statuses(id),
  acquired_on DATE NULL,
  warranty_expires_on DATE NULL,
  inventory_legacy_code TEXT NULL,
  legacy_consecutive TEXT NULL,
  legacy_component_consecutive TEXT NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  updated_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_helpdesk_assets_asset_code
  ON public.helpdesk_assets (UPPER(asset_code))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS ix_helpdesk_assets_category_id
  ON public.helpdesk_assets (category_id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_assets_assigned_employee_id
  ON public.helpdesk_assets (assigned_employee_id);

CREATE INDEX IF NOT EXISTS ix_helpdesk_assets_status_id
  ON public.helpdesk_assets (operational_status_id);

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_history (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  previous_values JSONB NULL,
  new_values JSONB NULL,
  created_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_asset_history_asset_id
  ON public.helpdesk_asset_history (asset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.helpdesk_asset_documents (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES public.helpdesk_assets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_kind TEXT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by_user_id UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_helpdesk_asset_documents_asset_id
  ON public.helpdesk_asset_documents (asset_id, created_at DESC);

INSERT INTO public.helpdesk_asset_units (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('UNILABOR', 'Unilabor', 'Unidad principal del laboratorio.', 10),
    ('UNASSIGNED', 'Sin unidad asignada', 'Unidad pendiente de clasificar.', 999)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_units existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_asset_areas (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('LABORATORY', 'Laboratorio', 'Area tecnica de laboratorio.', 10),
    ('ADMINISTRATION', 'Administracion', 'Area administrativa.', 20),
    ('QUALITY', 'Calidad', 'Gestion de calidad y documentacion.', 30),
    ('IT', 'Sistemas', 'Soporte tecnologico y computo.', 40),
    ('UNASSIGNED', 'Sin area asignada', 'Area pendiente de clasificar.', 999)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_asset_areas existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_purchase_modalities (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('OWNED', 'Propio', 'Activo adquirido por la organizacion.', 10),
    ('LEASED', 'Arrendado', 'Activo bajo arrendamiento o comodato.', 20),
    ('SERVICE', 'Servicio', 'Activo asociado a contrato de servicio.', 30),
    ('UNSPECIFIED', 'No especificado', 'Modalidad pendiente de clasificar.', 999)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_purchase_modalities existing WHERE UPPER(existing.code) = source.code
);

INSERT INTO public.helpdesk_purchase_conditions (code, name, description, sort_order)
SELECT source.code, source.name, source.description, source.sort_order
FROM (
  VALUES
    ('NEW', 'Nuevo', 'Activo adquirido como nuevo.', 10),
    ('USED', 'Usado', 'Activo adquirido como usado.', 20),
    ('DONATED', 'Donado', 'Activo recibido por donacion.', 30),
    ('UNSPECIFIED', 'No especificado', 'Condicion pendiente de clasificar.', 999)
) AS source(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.helpdesk_purchase_conditions existing WHERE UPPER(existing.code) = source.code
);

COMMIT;
