-- ============================================================================
-- MIGRACION MANUAL PARA pgAdmin — Deploy 2026-07-18 (RBAC Fase 5)
-- Deprecacion del modelo legacy `user_module_roles`: reconciliacion final a
-- `user_roles`, fix de acceso total para mantenimiento@unilabor.mx y DROP de la
-- tabla legacy.
-- ============================================================================
-- Replica lo que hace el runner (node dist/scripts/migrate.js migrate): la
--   migracion se aplica y se registra en public.schema_migrations con SU
--   checksum SHA-256.
-- Idempotente: correr el script dos veces no rompe nada.
--
-- ⚠️ ORDEN DE DEPLOY (INVERSO a la Fase 0): aplicar este SQL DESPUES de subir el
--   backend+frontend de la Fase 5. Con el codigo nuevo nada consulta
--   `user_module_roles`; dropearla con el codigo viejo aun corriendo romperia
--   createUser/updateUser y el listado de usuarios.
-- ============================================================================

-- Tabla de control (en prod ya existe; se crea por seguridad).
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 20260718_01_rbac_drop_user_module_roles.sql
-- =============================================================================
BEGIN;

-- 1. Reconciliacion final legacy -> RBAC (usuarios creados/editados por la UI
--    legacy despues de 20260714_01). Mismo mapeo `{MODULO}_{ROL}` de la Fase 0.
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

-- 2. mantenimiento@unilabor.mx: responsable de activos -> control total
--    (Activos · Administrador). Idempotente; no-op si no existe.
INSERT INTO public.user_roles (user_id, role_id, is_active)
SELECT u.id, r.id, TRUE
FROM public.users u
CROSS JOIN public.roles r
WHERE LOWER(u.email) = 'mantenimiento@unilabor.mx'
  AND r.code = 'HELPDESK_ADMIN'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = TRUE;

-- 3. Drop del modelo legacy.
DROP TABLE IF EXISTS public.user_module_roles;

COMMIT;

-- Registro de la migracion (idempotente).
INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260718_01_rbac_drop_user_module_roles.sql', '67f757fc6d71a764db55f08bf02c3dbdcb25fdd52e622a8681e7049b7c639b0e')
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- Verificacion (ejecutar tras el COMMIT):
--   SELECT to_regclass('public.user_module_roles');            -- esperado: NULL
--   SELECT u.email, r.code
--   FROM public.user_roles ur
--   JOIN public.users u ON u.id = ur.user_id
--   JOIN public.roles r ON r.id = ur.role_id
--   WHERE LOWER(u.email) = 'mantenimiento@unilabor.mx' AND ur.is_active;
-- =============================================================================
