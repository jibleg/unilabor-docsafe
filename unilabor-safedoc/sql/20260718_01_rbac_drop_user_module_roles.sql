-- ============================================================================
-- Fase 5 RBAC — Deprecacion del modelo legacy `user_module_roles`
-- ============================================================================
-- Contexto:
--   Tras la Fase 5, el acceso a modulos y la autorizacion se resuelven UNICA-
--   mente por RBAC (roles/permissions/role_permissions/user_roles). El backend
--   ya no lee ni escribe `user_module_roles`: `availableModules` (login y
--   /auth/me/access), los guards y el listado de usuarios/empleados derivan de
--   `getUserAccessibleModules` (RBAC). La asignacion de acceso vive solo en la
--   UI de Roles y permisos.
--
-- ⚠️ ORDEN DE DEPLOY (INVERSO a la Fase 0):
--   Aplicar este SQL DESPUES de subir el backend+frontend de la Fase 5. Con el
--   codigo nuevo nada consulta `user_module_roles`, asi que dropearla es seguro.
--   Si se dropea con el codigo viejo aun corriendo, createUser/updateUser y el
--   listado de usuarios fallarian.
--
-- `users.role` NO se elimina: sigue gobernando el alcance de categorias de
--   Calidad (listCategoriesForUser), el scoping de empleados y el payload JWT.
--   Su retiro es un trabajo independiente, fuera del alcance de esta migracion.
--
-- Idempotente y reversible-safe: si `user_module_roles` ya no existe, la
--   reconciliacion se omite y el DROP es no-op.
-- ============================================================================

BEGIN;

-- 1. Reconciliacion final legacy -> RBAC. Cubre a los usuarios creados o
--    editados por la UI de Usuarios legacy DESPUES de la migracion 20260714_01
--    (que escribian `user_module_roles` pero no `user_roles`), que es la causa
--    de la divergencia de acceso. Mismo mapeo `{MODULO}_{ROL}` de la Fase 0.
DO $$
BEGIN
  IF to_regclass('public.user_module_roles') IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, is_active)
    SELECT umr.user_id, r.id, TRUE
    FROM public.user_module_roles umr
    INNER JOIN public.modules m ON m.id = umr.module_id
    INNER JOIN public.roles r
      ON UPPER(r.code) = UPPER(m.code) || '_' || UPPER(umr.role)
    WHERE COALESCE(umr.is_active, TRUE) = TRUE
      AND UPPER(umr.role) IN ('ADMIN', 'EDITOR', 'VIEWER')
    ON CONFLICT (user_id, role_id) DO NOTHING;

    -- Los ex-ADMIN de Calidad administraban usuarios: conservan Administracion
    -- del Sistema (mismo criterio que la Fase 0).
    INSERT INTO public.user_roles (user_id, role_id, is_active)
    SELECT umr.user_id, r.id, TRUE
    FROM public.user_module_roles umr
    INNER JOIN public.modules m ON m.id = umr.module_id AND UPPER(m.code) = 'QUALITY'
    INNER JOIN public.roles r ON UPPER(r.code) = 'ADMIN_SUPERUSER'
    WHERE COALESCE(umr.is_active, TRUE) = TRUE
      AND UPPER(umr.role) = 'ADMIN'
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;
END $$;

-- 2. Fix puntual: mantenimiento@unilabor.mx es el responsable de los activos y
--    debe tener control total del modulo (Activos · Administrador). Idempotente;
--    no-op si el usuario o el rol no existen (p. ej. en entornos demo).
INSERT INTO public.user_roles (user_id, role_id, is_active)
SELECT u.id, r.id, TRUE
FROM public.users u
CROSS JOIN public.roles r
WHERE LOWER(u.email) = 'mantenimiento@unilabor.mx'
  AND r.code = 'HELPDESK_ADMIN'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = TRUE;

-- 3. Drop del modelo legacy. Falla (correctamente) si quedara alguna FK
--    dependiente sin resolver, en vez de cascadear en silencio.
DROP TABLE IF EXISTS public.user_module_roles;

COMMIT;

-- ============================================================================
-- Verificacion (ejecutar tras el COMMIT):
--   -- La tabla ya no existe:
--   SELECT to_regclass('public.user_module_roles');            -- esperado: NULL
--   -- mantenimiento tiene acceso total a Activos:
--   SELECT u.email, r.code
--   FROM public.user_roles ur
--   JOIN public.users u ON u.id = ur.user_id
--   JOIN public.roles r ON r.id = ur.role_id
--   WHERE LOWER(u.email) = 'mantenimiento@unilabor.mx' AND ur.is_active;
-- ============================================================================
