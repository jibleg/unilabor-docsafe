-- =============================================================================
-- Modulo Acuerdos (PROVIDERS) - Gestor "Acuerdos con los Clientes"
--
-- Espejo del gestor de documentos de proveedores, pero para clientes: catalogo
-- propio de clientes (analogo a helpdesk_suppliers, pero SIN compartirse con
-- Activos), contactos, categorias de documento, documentos con motor de
-- version (status active/superseded/inactive + replaces/replaced_by) y
-- destinatarios de alerta de vencimiento. Vive dentro del MISMO modulo
-- PROVIDERS (no crea un modulo nuevo), con permisos propios
-- PROVIDERS.CLIENTS.* para poder otorgar Proveedores/Clientes por separado.
--
-- 100% ADITIVA: crea 5 tablas y 5 permisos nuevos, no modifica ninguna tabla
-- existente.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catalogo de clientes (propio, no compartido con Activos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  rfc TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  website TEXT,
  address_street TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  address_country TEXT,
  notes TEXT,

  classification_id BIGINT NULL
    REFERENCES public.provider_client_classifications(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_clients_name
  ON public.clients (UPPER(name));

CREATE INDEX IF NOT EXISTS idx_clients_classification
  ON public.clients (classification_id);

-- ---------------------------------------------------------------------------
-- 2. Contactos del cliente (lista, uno puede marcarse como principal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_contacts (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id
  ON public.client_contacts (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_client_contacts_primary
  ON public.client_contacts (client_id)
  WHERE is_primary = TRUE;

-- ---------------------------------------------------------------------------
-- 3. Categorias de documento de cliente (clasificacion documental)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_document_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_client_document_categories_code
  ON public.client_document_categories (UPPER(code));

-- ---------------------------------------------------------------------------
-- 4. Documentos de cliente: mismo motor de versiones que provider_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_documents (
  id BIGSERIAL PRIMARY KEY,

  client_id BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  category_id BIGINT NOT NULL REFERENCES public.client_document_categories(id) ON DELETE RESTRICT,

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
    REFERENCES public.client_documents(id) ON DELETE SET NULL,
  replaced_by_document_id BIGINT NULL
    REFERENCES public.client_documents(id) ON DELETE SET NULL,

  reminder_sent_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_client_documents_status
    CHECK (status IN ('active', 'inactive', 'superseded'))
);

CREATE INDEX IF NOT EXISTS idx_client_documents_client
  ON public.client_documents (client_id);

CREATE INDEX IF NOT EXISTS idx_client_documents_category
  ON public.client_documents (category_id);

CREATE INDEX IF NOT EXISTS idx_client_documents_status
  ON public.client_documents (status);

CREATE INDEX IF NOT EXISTS idx_client_documents_active_expiry
  ON public.client_documents (expiry_date)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 5. Destinatarios de alerta de vencimiento (configuracion, propia de clientes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_notification_recipients (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ---------------------------------------------------------------------------
-- 6. Permisos RBAC (dentro del modulo PROVIDERS, namespace CLIENTS propio)
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
    ('PROVIDERS.CLIENTS.CATALOG.READ',   'PROVIDERS',
     'Ver clientes y categorias de documento de cliente'),
    ('PROVIDERS.CLIENTS.CATALOG.MANAGE', 'PROVIDERS',
     'Administrar el catalogo de clientes y sus categorias de documento'),
    ('PROVIDERS.CLIENTS.DOCUMENTS.READ', 'PROVIDERS',
     'Ver documentos de clientes y su historico de vigencia'),
    ('PROVIDERS.CLIENTS.DOCUMENTS.WRITE', 'PROVIDERS',
     'Subir y reemplazar documentos de clientes (derogar version anterior)'),
    ('PROVIDERS.CLIENTS.CONFIG.MANAGE', 'PROVIDERS',
     'Administrar los destinatarios de alerta de vencimiento de documentos de cliente')
) AS src(code, module_code, description)
INNER JOIN public.modules m ON UPPER(m.code) = src.module_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code)
);

-- ---------------------------------------------------------------------------
-- 7. Asignacion a los roles existentes del modulo (mismo patron que Proveedores)
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('PROVIDERS_ADMIN',  'PROVIDERS.CLIENTS.CATALOG.READ'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.CLIENTS.CATALOG.MANAGE'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.CLIENTS.DOCUMENTS.READ'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.CLIENTS.DOCUMENTS.WRITE'),
    ('PROVIDERS_ADMIN',  'PROVIDERS.CLIENTS.CONFIG.MANAGE'),
    ('PROVIDERS_EDITOR', 'PROVIDERS.CLIENTS.CATALOG.READ'),
    ('PROVIDERS_EDITOR', 'PROVIDERS.CLIENTS.DOCUMENTS.READ'),
    ('PROVIDERS_EDITOR', 'PROVIDERS.CLIENTS.DOCUMENTS.WRITE'),
    ('PROVIDERS_VIEWER', 'PROVIDERS.CLIENTS.CATALOG.READ'),
    ('PROVIDERS_VIEWER', 'PROVIDERS.CLIENTS.DOCUMENTS.READ')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Seed de categorias de documento de cliente (mismo set que Proveedores)
-- ---------------------------------------------------------------------------
INSERT INTO public.client_document_categories (code, name, description, sort_order)
SELECT src.code, src.name, src.description, src.sort_order
FROM (
  VALUES
    ('CONTRATO',        'Contrato',                    'Contrato de prestacion de servicio o suministro', 10),
    ('CONVENIO',        'Convenio',                     'Convenio o carta compromiso con el cliente',      20),
    ('POLIZA',          'Poliza',                       'Poliza de seguro o garantia asociada al cliente', 30),
    ('CERTIFICADO',     'Certificado',                  'Certificacion de calidad o acreditacion del cliente', 40),
    ('CONFIDENCIALIDAD','Acuerdo de confidencialidad',  'Acuerdo de confidencialidad (NDA) con el cliente', 50),
    ('OTRO',            'Otro',                         'Otro documento relacionado con el cliente',        60)
) AS src(code, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_document_categories existing
  WHERE UPPER(existing.code) = src.code
);

COMMIT;
