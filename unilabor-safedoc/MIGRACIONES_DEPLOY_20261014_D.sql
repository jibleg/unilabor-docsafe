-- MIGRACIONES_DEPLOY_20261014_D.sql - descripciones claras de permisos de Proveedores/Clientes (solo texto; pgAdmin)
-- ============ 20261014_03_providers_permission_descriptions.sql ============
-- =============================================================================
-- Proveedores - Descripciones claras de los permisos del catalogo en la UI de Roles.
-- PROVIDERS.CATALOG.MANAGE decia "Administrar categorias de documento", pero tambien
-- cubre el alta, edicion y baja de proveedores y sus contactos. Solo cambia texto.
-- Idempotente.
-- =============================================================================
BEGIN;

UPDATE public.permissions SET description = 'Proveedores: ver el catalogo, sus contactos y categorias de documento'
 WHERE UPPER(code) = 'PROVIDERS.CATALOG.READ';
UPDATE public.permissions SET description = 'Proveedores: alta, edicion y baja de proveedores (CRUD), sus contactos y categorias de documento'
 WHERE UPPER(code) = 'PROVIDERS.CATALOG.MANAGE';
UPDATE public.permissions SET description = 'Proveedores: ver documentos y su historico de vigencia'
 WHERE UPPER(code) = 'PROVIDERS.DOCUMENTS.READ';
UPDATE public.permissions SET description = 'Proveedores: subir y reemplazar documentos (derogar version anterior)'
 WHERE UPPER(code) = 'PROVIDERS.DOCUMENTS.WRITE';
UPDATE public.permissions SET description = 'Proveedores: administrar destinatarios de alerta de vencimiento de contratos'
 WHERE UPPER(code) = 'PROVIDERS.CONFIG.MANAGE';
UPDATE public.permissions SET description = 'Clientes: ver clientes y categorias de documento de cliente'
 WHERE UPPER(code) = 'PROVIDERS.CLIENTS.CATALOG.READ';
UPDATE public.permissions SET description = 'Clientes: alta, edicion y baja de clientes (CRUD) y sus categorias de documento'
 WHERE UPPER(code) = 'PROVIDERS.CLIENTS.CATALOG.MANAGE';
UPDATE public.permissions SET description = 'Clientes: ver documentos y su historico de vigencia'
 WHERE UPPER(code) = 'PROVIDERS.CLIENTS.DOCUMENTS.READ';
UPDATE public.permissions SET description = 'Clientes: subir y reemplazar documentos (derogar version anterior)'
 WHERE UPPER(code) = 'PROVIDERS.CLIENTS.DOCUMENTS.WRITE';
UPDATE public.permissions SET description = 'Clientes: administrar destinatarios de alerta de vencimiento de documentos'
 WHERE UPPER(code) = 'PROVIDERS.CLIENTS.CONFIG.MANAGE';

COMMIT;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20261014_03_providers_permission_descriptions.sql', 'df6341c0509de12220dbc4eff5bb8f92057577087b283ab36ac3395f948bd0a4')
ON CONFLICT DO NOTHING;
