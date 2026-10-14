-- MIGRACIONES_DEPLOY_20261014_C.sql - rol PROVIDERS_CATALOG_MANAGER (aplicar por pgAdmin; compatible PG < 12)
-- ============ 20261014_02_providers_catalog_manager_role.sql ============
-- =============================================================================
-- Proveedores - Rol "Proveedores · Gestor de catalogo".
--
-- Permite dar de alta y administrar proveedores (catalogo, contactos y categorias de
-- documento) y gestionar sus documentos, SIN la configuracion de alertas de vencimiento
-- ni la administracion de clasificaciones (que siguen siendo de PROVIDERS_ADMIN).
-- Permisos: CATALOG.READ/MANAGE, DOCUMENTS.READ/WRITE, CLASSIFICATIONS.READ.
-- Aditivo e idempotente; compatible con PostgreSQL < 12.
-- =============================================================================
BEGIN;

INSERT INTO public.roles (code, name, description, module_id, is_system, is_active)
SELECT 'PROVIDERS_CATALOG_MANAGER', 'Proveedores · Gestor de catalogo',
       'Da de alta y administra proveedores, contactos y documentos, sin configurar alertas ni clasificaciones',
       m.id, TRUE, TRUE
FROM public.modules m
WHERE UPPER(m.code) = 'PROVIDERS'
  AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE UPPER(r.code) = 'PROVIDERS_CATALOG_MANAGER');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('PROVIDERS_CATALOG_MANAGER', 'PROVIDERS.CATALOG.READ'),
    ('PROVIDERS_CATALOG_MANAGER', 'PROVIDERS.CATALOG.MANAGE'),
    ('PROVIDERS_CATALOG_MANAGER', 'PROVIDERS.DOCUMENTS.READ'),
    ('PROVIDERS_CATALOG_MANAGER', 'PROVIDERS.DOCUMENTS.WRITE'),
    ('PROVIDERS_CATALOG_MANAGER', 'PROVIDERS.CLASSIFICATIONS.READ')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20261014_02_providers_catalog_manager_role.sql', 'c7396189dd438df67240176519b31ca9820acee01639f41dfec87b061e180cd2')
ON CONFLICT DO NOTHING;
