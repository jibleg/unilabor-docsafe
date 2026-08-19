-- ============================================================================
-- MIGRACION MANUAL PARA pgAdmin — Deploy 2026-08-19 (Modulo Proveedores)
-- Modulo nuevo de gestion documental de proveedores: contratos, convenios y
-- polizas por proveedor, con vigencia/derogacion, alertas de vencimiento por
-- correo, catalogo propio (alta/edicion) y ficha completa (domicilio, sitio
-- web, notas, contactos multiples con uno principal).
--
-- 100% ADITIVA: crea 1 modulo, 5 tablas nuevas, 5 permisos y 3 roles; agrega
-- 8 columnas NULL-ables a `helpdesk_suppliers` (Activos las ignora, sigue
-- funcionando exactamente igual). NO borra ni renombra nada existente.
--
-- Replica lo que hace el runner (node dist/scripts/migrate.js migrate): aplica
--   20260813_01_providers_module.sql y 20260819_01_provider_catalog_details.sql,
--   y las registra en public.schema_migrations con SU checksum SHA-256:
--     20260813_01_providers_module.sql
--       27596e0249f934f45a806ca0eec9323e664fe0d7c17ede160d20c3d898cbc25a
--     20260819_01_provider_catalog_details.sql
--       d186da1595857e4a864f65df8130e4a29f54e4a08e74e0ae8acbaa979d6ca974
-- Idempotente: correr el script dos veces no rompe nada (CREATE ... IF NOT
--   EXISTS, ALTER ... ADD COLUMN IF NOT EXISTS, inserts con guardas / ON
--   CONFLICT DO NOTHING).
--
-- ⚠️ ORDEN DE DEPLOY: aplicar este SQL ANTES de subir el `dist` nuevo del
--   backend/frontend (el codigo nuevo depende de estas tablas/columnas; el
--   codigo viejo simplemente no conoce el modulo Proveedores todavia).
--
-- NOTA: este deploy NO requiere npm ci (sin dependencias nuevas en back ni
--   front — se verifico que package.json/package-lock.json no cambiaron).
-- ============================================================================

-- Tabla de control (en prod ya existe; se crea por seguridad).
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Migracion 1/2: 20260813_01_providers_module.sql
-- Modulo Proveedores - Sprint 1: cimientos (modulo, tablas, RBAC, seed)
--
-- Gestion documental de proveedores: contratos, convenios, polizas, etc., con
-- vigencia y derogacion (motor de versiones tipo Calidad) y alertas de
-- vencimiento a una lista de destinatarios configurable.
--
-- 100% ADITIVA: crea 1 modulo, 3 tablas, 5 permisos y 3 roles. NO modifica
-- `helpdesk_suppliers` ni ninguna tabla existente: el catalogo de proveedores
-- de Activos sigue funcionando exactamente igual.
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
-- documentos vigentes (el scheduler de alertas filtra por esto).
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

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260813_01_providers_module.sql', '27596e0249f934f45a806ca0eec9323e664fe0d7c17ede160d20c3d898cbc25a')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- Migracion 2/2: 20260819_01_provider_catalog_details.sql
-- Modulo Proveedores - Ficha completa del proveedor
--
-- El catalogo de proveedores (helpdesk_suppliers) solo tenia name/description/
-- rfc/contact (texto libre). Se agrega domicilio, sitio web y notas al
-- proveedor, y una tabla de contactos (0..N por proveedor, con uno marcado
-- como principal) para reemplazar el campo de texto libre `contact` por un
-- registro estructurado.
--
-- ADITIVA: agrega columnas NULL-ables a `helpdesk_suppliers` (Activos sigue
-- funcionando igual, solo ignora las columnas nuevas) y crea 1 tabla nueva.
-- No borra ni renombra `helpdesk_suppliers.contact` (queda en desuso, se
-- conserva por si algun reporte historico la lee).
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Domicilio, sitio web y notas del proveedor
-- ---------------------------------------------------------------------------
ALTER TABLE public.helpdesk_suppliers
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS address_street TEXT,
  ADD COLUMN IF NOT EXISTS address_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS address_zip TEXT,
  ADD COLUMN IF NOT EXISTS address_country TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---------------------------------------------------------------------------
-- 2. Contactos del proveedor (lista, uno puede marcarse como principal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_contacts (
  id BIGSERIAL PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES public.helpdesk_suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_contacts_provider_id
  ON public.provider_contacts (provider_id);

-- A lo mucho un contacto principal por proveedor.
CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_contacts_primary
  ON public.provider_contacts (provider_id)
  WHERE is_primary = TRUE;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260819_01_provider_catalog_details.sql', 'd186da1595857e4a864f65df8130e4a29f54e4a08e74e0ae8acbaa979d6ca974')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- Verificacion (ejecutar tras los COMMIT):
--   SELECT to_regclass('public.modules');  -- sanity
--   SELECT code FROM public.modules WHERE code = 'PROVIDERS';
--   SELECT to_regclass('public.provider_document_categories');   -- no NULL
--   SELECT to_regclass('public.provider_documents');             -- no NULL
--   SELECT to_regclass('public.provider_notification_recipients'); -- no NULL
--   SELECT to_regclass('public.provider_contacts');               -- no NULL
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'helpdesk_suppliers'
--       AND column_name IN ('website','address_street','address_neighborhood',
--                            'address_city','address_state','address_zip',
--                            'address_country','notes');  -- 8 filas
--   SELECT code FROM public.roles WHERE code LIKE 'PROVIDERS_%';  -- 3 filas
--   SELECT code FROM public.permissions WHERE code LIKE 'PROVIDERS.%';  -- 5 filas
--   SELECT code FROM public.provider_document_categories ORDER BY sort_order;  -- 6 filas
--   SELECT filename, checksum FROM public.schema_migrations
--     WHERE filename LIKE '202608%providers%' OR filename LIKE '202608%provider_catalog%';
--
-- Post-deploy pendiente (fuera de este SQL):
--   * Asignar en Administracion -> Roles el rol PROVIDERS_ADMIN a quien vaya a
--     administrar el modulo (catalogo, documentos, alertas), y PROVIDERS_EDITOR/
--     PROVIDERS_VIEWER segun corresponda.
--   * Sembrar `helpdesk_suppliers` si prod la tiene vacia (sin proveedores
--     capturados el modulo no tiene nada que mostrar) — ahora se puede hacer
--     desde la propia UI en Proveedores -> Configuracion -> Catalogo de
--     proveedores, ya no hace falta ir a Activos -> Catalogos.
--   * Agregar al menos un destinatario en Proveedores -> Configuracion ->
--     Alertas de vencimiento para que el scheduler diario (08:00, cron
--     "0 8 * * *") tenga a quien avisar.
-- =============================================================================
