-- =============================================================================
-- Modulo Acuerdos (PROVIDERS) - Catalogo de Clasificacion
--
-- Catalogo compartido de clasificacion con un campo `type` (PROVIDER/CLIENT)
-- para poder agrupar tanto proveedores como clientes con el mismo catalogo,
-- cada clasificacion pertenece a un solo tipo. `helpdesk_suppliers` (el
-- catalogo YA existente de proveedores, compartido con Activos) recibe una
-- columna NULL-able `classification_id` para poder asignarle una clasificacion
-- tipo PROVIDER a cada proveedor.
--
-- 100% ADITIVA: crea 1 tabla y 2 permisos nuevos, y una columna NULL-able en
-- `helpdesk_suppliers`. Activos sigue funcionando igual (la columna nueva
-- queda NULL si no se usa desde ahi).
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catalogo de clasificacion (Proveedor / Cliente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_client_classifications (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_classification_type
    CHECK (type IN ('PROVIDER', 'CLIENT'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_classification_type_name
  ON public.provider_client_classifications (type, UPPER(name));

CREATE INDEX IF NOT EXISTS idx_classification_type
  ON public.provider_client_classifications (type);

-- ---------------------------------------------------------------------------
-- 2. Clasificacion del proveedor (catalogo YA existente, sin duplicarlo)
-- ---------------------------------------------------------------------------
ALTER TABLE public.helpdesk_suppliers
  ADD COLUMN IF NOT EXISTS classification_id BIGINT NULL
    REFERENCES public.provider_client_classifications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_helpdesk_suppliers_classification
  ON public.helpdesk_suppliers (classification_id);

-- ---------------------------------------------------------------------------
-- 3. Permisos RBAC (siguen dentro del modulo PROVIDERS)
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT
  src.code,
  m.id,
  split_part(src.code, '.', 2),
  split_part(src.code, '.', 3),
  src.description
FROM (
  VALUES
    ('PROVIDERS.CLASSIFICATIONS.READ',   'PROVIDERS',
     'Ver el catalogo de clasificacion de proveedores y clientes'),
    ('PROVIDERS.CLASSIFICATIONS.MANAGE', 'PROVIDERS',
     'Administrar el catalogo de clasificacion de proveedores y clientes')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

-- ---------------------------------------------------------------------------
-- 4. Asignacion a los roles existentes del modulo
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('PROVIDERS_ADMIN',  'PROVIDERS.CLASSIFICATIONS.READ'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.CLASSIFICATIONS.MANAGE'),
    ('PROVIDERS_EDITOR', 'PROVIDERS.CLASSIFICATIONS.READ'),
    ('PROVIDERS_VIEWER', 'PROVIDERS.CLASSIFICATIONS.READ')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
