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
