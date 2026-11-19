-- =============================================================================
-- Administracion - Permiso propio para asignar categorias de Calidad a usuarios.
--
-- Hasta ahora PUT /api/users/:id/categories exigia ADMIN.USERS.MANAGE, que solo
-- otorga ADMIN_SUPERUSER. El rol QUALITY_ADMIN ve /admin/users (ADMIN.USERS.READ)
-- pero no podia guardar las categorias. Este permiso separa esa capacidad sin
-- abrir alta/edicion/baja de usuarios ni el reseteo de contrasenas.
--
-- La accion es ASSIGN (no MANAGE/WRITE) a proposito: asi el rol efectivo
-- derivado del modulo ADMIN no cambia para quien solo recibe este permiso.
--
-- 100 % aditivo e idempotente: 1 permiso, concedido a ADMIN_SUPERUSER y
-- QUALITY_ADMIN.
-- =============================================================================
BEGIN;

INSERT INTO public.permissions (code, module_id, resource, action, description)
SELECT src.code, m.id, split_part(src.code, '.', 2), split_part(src.code, '.', 3), src.description
FROM (
  VALUES
    ('ADMIN.USER_CATEGORIES.ASSIGN', 'Asignar categorias de Calidad a los usuarios, sin editar sus datos ni su rol')
) AS src(code, description)
INNER JOIN public.modules m ON UPPER(m.code) = 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE UPPER(p.code) = UPPER(src.code));

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (
  VALUES
    ('ADMIN_SUPERUSER', 'ADMIN.USER_CATEGORIES.ASSIGN'),
    ('QUALITY_ADMIN',   'ADMIN.USER_CATEGORIES.ASSIGN')
) AS src(role_code, permission_code)
INNER JOIN public.roles r ON UPPER(r.code) = src.role_code
INNER JOIN public.permissions p ON UPPER(p.code) = src.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
