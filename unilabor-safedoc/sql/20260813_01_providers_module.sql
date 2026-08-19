-- =============================================================================
-- Modulo Proveedores - Sprint 1: cimientos (modulo, tablas, RBAC, seed)
--
-- Gestion documental de proveedores: contratos, convenios, polizas, etc., con
-- vigencia y derogacion (motor de versiones tipo Calidad) y alertas de
-- vencimiento a una lista de destinatarios configurable.
--
-- 100% ADITIVA: crea 1 modulo, 3 tablas, 5 permisos y 3 roles. NO modifica
-- `helpdesk_suppliers` ni ninguna tabla existente: el catalogo de proveedores
-- de Activos sigue funcionando exactamente igual.
--
-- Ver ROADMAP_MODULO_PROVEEDORES.md para el diseno completo.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Modulo "Proveedores"
-- ---------------------------------------------------------------------------
INSERT INTO public.modules (code, name, description, icon, is_active, sort_order)
SELECT source.code, source.name, source.description, source.icon, source.is_active, source.sort_order
FROM (
  VALUES
    (
      'PROVIDERS',
      'Proveedores',
      'Gestion documental de proveedores: contratos, convenios y polizas, con vigencia y derogacion.',
      'truck',
      TRUE,
      40
    )
) AS source(code, name, description, icon, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.modules existing WHERE UPPER(existing.code) = source.code
);

-- ---------------------------------------------------------------------------
-- 2. Categorias de documento (clasificacion, catalogo administrable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_document_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_document_categories_code
  ON public.provider_document_categories (UPPER(code));

-- ---------------------------------------------------------------------------
-- 3. Documentos de proveedor: el corazon del modulo
--
-- Mismo motor de versiones que `documents` (Calidad): status
-- active/superseded/inactive + replaces/replaced_by encadenados. `provider_id`
-- apunta al catalogo YA existente `helpdesk_suppliers`, sin duplicarlo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_documents (
  id BIGSERIAL PRIMARY KEY,

  provider_id BIGINT NOT NULL REFERENCES public.helpdesk_suppliers(id) ON DELETE RESTRICT,
  category_id BIGINT NOT NULL REFERENCES public.provider_document_categories(id) ON DELETE RESTRICT,

  title TEXT NOT NULL,
  description TEXT NULL,

  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,

  document_date DATE NULL,
  effective_from DATE NULL,
  expiry_date DATE NULL,

  status TEXT NOT NULL DEFAULT 'active',
  replaces_document_id BIGINT NULL
    REFERENCES public.provider_documents(id) ON DELETE SET NULL,
  replaced_by_document_id BIGINT NULL
    REFERENCES public.provider_documents(id) ON DELETE SET NULL,

  reminder_sent_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_provider_documents_status
    CHECK (status IN ('active', 'inactive', 'superseded'))
);

CREATE INDEX IF NOT EXISTS idx_provider_documents_provider
  ON public.provider_documents (provider_id);

CREATE INDEX IF NOT EXISTS idx_provider_documents_category
  ON public.provider_documents (category_id);

CREATE INDEX IF NOT EXISTS idx_provider_documents_status
  ON public.provider_documents (status);

-- Ventana de vencimiento: solo interesa buscar por expiry_date entre los
-- documentos vigentes (el scheduler de alertas, Sprint 4, filtra por esto).
CREATE INDEX IF NOT EXISTS idx_provider_documents_active_expiry
  ON public.provider_documents (expiry_date)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 4. Destinatarios de alerta de vencimiento (configuracion)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_notification_recipients (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ---------------------------------------------------------------------------
-- 5. Permisos RBAC
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
    ('PROVIDERS.CATALOG.READ',   'PROVIDERS',
     'Ver proveedores y categorias de documento'),
    ('PROVIDERS.CATALOG.MANAGE', 'PROVIDERS',
     'Administrar categorias de documento (clasificacion)'),
    ('PROVIDERS.DOCUMENTS.READ', 'PROVIDERS',
     'Ver documentos de proveedores y su historico de vigencia'),
    ('PROVIDERS.DOCUMENTS.WRITE', 'PROVIDERS',
     'Subir y reemplazar documentos de proveedores (derogar version anterior)'),
    ('PROVIDERS.CONFIG.MANAGE', 'PROVIDERS',
     'Administrar los destinatarios de alerta de vencimiento de contratos')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

-- ---------------------------------------------------------------------------
-- 6. Roles del modulo Proveedores
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
SELECT src.code, src.name, src.description, m.id, TRUE, TRUE
FROM (
  VALUES
    ('PROVIDERS_ADMIN',  'Proveedores · Administrador',
     'Control total: catalogo, documentos y configuracion de alertas', 'PROVIDERS'),
    ('PROVIDERS_EDITOR', 'Proveedores · Editor',
     'Sube y reemplaza documentos de proveedores, sin administrar catalogo ni alertas', 'PROVIDERS'),
    ('PROVIDERS_VIEWER', 'Proveedores · Consulta',
     'Solo consulta proveedores y sus documentos', 'PROVIDERS')
) AS src(code, name, description, module_code)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r WHERE UPPER(r.code) = UPPER(src.code)
);

-- ---------------------------------------------------------------------------
-- 7. Asignacion de permisos a roles
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('PROVIDERS_ADMIN',  'PROVIDERS.CATALOG.READ'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.CATALOG.MANAGE'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.DOCUMENTS.READ'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.DOCUMENTS.WRITE'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.CONFIG.MANAGE'),
    ('PROVIDERS_EDITOR', 'PROVIDERS.CATALOG.READ'),
    ('PROVIDERS_EDITOR', 'PROVIDERS.DOCUMENTS.READ'),
    ('PROVIDERS_EDITOR', 'PROVIDERS.DOCUMENTS.WRITE'),
    ('PROVIDERS_VIEWER', 'PROVIDERS.CATALOG.READ'),
    ('PROVIDERS_VIEWER', 'PROVIDERS.DOCUMENTS.READ')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Seed de categorias de documento
-- ---------------------------------------------------------------------------
INSERT INTO public.provider_document_categories (code, name, description, sort_order)
SELECT src.code, src.name, src.description, src.sort_order
FROM (
  VALUES
    ('CONTRATO',        'Contrato',                    'Contrato de prestacion de servicio o suministro', 10),
    ('CONVENIO',        'Convenio',                     'Convenio o carta compromiso con el proveedor',    20),
    ('POLIZA',          'Poliza',                       'Poliza de seguro o garantia asociada al proveedor', 30),
    ('CERTIFICADO_ISO_PROVEEDOR', 'Certificado ISO del proveedor', 'Certificacion de calidad o acreditacion del propio proveedor', 40),
    ('CONFIDENCIALIDAD','Acuerdo de confidencialidad',  'Acuerdo de confidencialidad (NDA) con el proveedor', 50),
    ('OTRO',            'Otro',                         'Otro documento relacionado con el proveedor',      60)
) AS src(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.provider_document_categories existing
  WHERE UPPER(existing.code) = src.code
);

COMMIT;
