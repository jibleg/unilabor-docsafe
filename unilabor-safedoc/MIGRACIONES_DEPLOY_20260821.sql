-- ============================================================================
-- MIGRACION MANUAL PARA pgAdmin — Deploy 2026-08-21 (Acuerdos: rename + Clasificacion + Clientes)
-- Renombra el modulo PROVIDERS a "Acuerdos con los Proveedores" (nombre visible
-- de modulo y roles, el codigo no cambia); agrega el catalogo compartido de
-- Clasificacion (tipo Proveedor/Cliente); agrega el modulo espejo "Acuerdos
-- con los Clientes" (catalogo de clientes, contactos, categorias de documento,
-- documentos con vigencia/derogacion y alertas de vencimiento).
--
-- 100% ADITIVA: 0 tablas nuevas en el rename; 1 tabla + 1 columna NULL-able +
-- 2 permisos en Clasificacion; 5 tablas + 5 permisos en Clientes. NO borra ni
-- renombra ninguna tabla existente. `helpdesk_suppliers` (compartida con
-- Activos) solo gana la columna NULL-able `classification_id`.
--
-- Replica lo que hace el runner (node dist/scripts/migrate.js migrate): aplica
--   20260821_01_providers_module_rename.sql
--   20260821_02_providers_classification_catalog.sql
--   20260821_03_clients_module.sql
--   y las registra en public.schema_migrations con SU checksum SHA-256:
--     20260821_01_providers_module_rename.sql
--       75a7e885fbe9e490993bdd1b40e8cb94500e076be4b35e284c35fe928c3b1c64
--     20260821_02_providers_classification_catalog.sql
--       798f218b6e994eb2083a8e06262039a3ace78f2a7871d51789efbc3b609c450e
--     20260821_03_clients_module.sql
--       40e77637aa11c664552c31f560e8a6e1040e6fa29ff06515b4318377556da565
-- Idempotente: correr el script dos veces no rompe nada (CREATE ... IF NOT
--   EXISTS, ADD COLUMN IF NOT EXISTS, inserts con guardas / ON CONFLICT).
-- ============================================================================


-- ============================================================================
-- 1) 20260821_01_providers_module_rename.sql
-- ============================================================================
-- Renombra el modulo PROVIDERS: "Proveedores" -> "Acuerdos con los Proveedores".
-- El codigo 'PROVIDERS' y los codigos de rol (PROVIDERS_ADMIN/EDITOR/VIEWER) no cambian,
-- solo los nombres visibles.
BEGIN;

UPDATE public.modules
   SET name = 'Acuerdos con los Proveedores'
 WHERE UPPER(code) = 'PROVIDERS';

UPDATE public.roles
   SET name = 'Acuerdos con los Proveedores · Administrador'
 WHERE code = 'PROVIDERS_ADMIN';

UPDATE public.roles
   SET name = 'Acuerdos con los Proveedores · Editor'
 WHERE code = 'PROVIDERS_EDITOR';

UPDATE public.roles
   SET name = 'Acuerdos con los Proveedores · Consulta'
 WHERE code = 'PROVIDERS_VIEWER';

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260821_01_providers_module_rename.sql', '75a7e885fbe9e490993bdd1b40e8cb94500e076be4b35e284c35fe928c3b1c64')
ON CONFLICT (filename) DO NOTHING;


-- ============================================================================
-- 2) 20260821_02_providers_classification_catalog.sql
-- ============================================================================
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
BEGIN;

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

ALTER TABLE public.helpdesk_suppliers
  ADD COLUMN IF NOT EXISTS classification_id BIGINT NULL
    REFERENCES public.provider_client_classifications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_helpdesk_suppliers_classification
  ON public.helpdesk_suppliers (classification_id);

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

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260821_02_providers_classification_catalog.sql', '798f218b6e994eb2083a8e06262039a3ace78f2a7871d51789efbc3b609c450e')
ON CONFLICT (filename) DO NOTHING;


-- ============================================================================
-- 3) 20260821_03_clients_module.sql
-- ============================================================================
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
BEGIN;

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

CREATE TABLE IF NOT EXISTS public.client_notification_recipients (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

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

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260821_03_clients_module.sql', '40e77637aa11c664552c31f560e8a6e1040e6fa29ff06515b4318377556da565')
ON CONFLICT (filename) DO NOTHING;


-- =============================================================================
-- Verificacion (ejecutar tras los COMMIT):
--   SELECT name FROM public.modules WHERE code = 'PROVIDERS';  -- 'Acuerdos con los Proveedores'
--   SELECT code, name FROM public.roles WHERE code LIKE 'PROVIDERS_%';  -- 3 filas, nombres con "Acuerdos con los Proveedores"
--   SELECT to_regclass('public.provider_client_classifications');  -- no NULL
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'helpdesk_suppliers' AND column_name = 'classification_id';  -- 1 fila
--   SELECT to_regclass('public.clients');                          -- no NULL
--   SELECT to_regclass('public.client_contacts');                  -- no NULL
--   SELECT to_regclass('public.client_document_categories');       -- no NULL
--   SELECT to_regclass('public.client_documents');                 -- no NULL
--   SELECT to_regclass('public.client_notification_recipients');   -- no NULL
--   SELECT code FROM public.permissions WHERE code LIKE 'PROVIDERS.CLASSIFICATIONS.%' OR code LIKE 'PROVIDERS.CLIENTS.%';  -- 7 filas
--   SELECT code FROM public.client_document_categories ORDER BY sort_order;  -- 6 filas
--   SELECT filename, checksum FROM public.schema_migrations WHERE filename LIKE '20260821%';  -- 3 filas
--
-- Post-deploy pendiente (fuera de este SQL):
--   * Los 3 roles PROVIDERS_ADMIN/EDITOR/VIEWER ya quedaron actualizados con
--     los permisos nuevos automaticamente (este script los otorga) — nadie
--     pierde ni gana acceso salvo por los permisos nuevos que antes no existian.
--   * Sembrar clasificaciones (Configuracion -> Clasificacion) y el catalogo
--     de clientes (Configuracion -> Clientes) desde la UI si se van a usar de
--     inmediato; ambos catalogos arrancan vacios.
--   * El scheduler de alertas de documentos de cliente corre diario a las
--     08:30 (cron "30 8 * * *", distinto al de proveedores a las 08:00 para
--     no chocar) — agregar destinatarios en Clientes -> Configuracion -> Alertas.
-- =============================================================================
