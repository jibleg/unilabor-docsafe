-- =============================================================================
-- Otorga QUALITY_VIEWER a todo colaborador con usuario vinculado que hoy no
-- tenga ningun rol del modulo QUALITY. Es el minimo necesario para poder leer
-- y firmar en Sala de Lectura (permiso QUALITY.SELF.READING), requisito real
-- para el modulo de Induccion (Bloque 1). NO toca a quien ya tiene
-- QUALITY_ADMIN/EDITOR/VIEWER/READER/READING_MANAGER (no se degrada ni
-- duplica acceso). 100% ADITIVA, idempotente (ON CONFLICT DO NOTHING).
-- =============================================================================
BEGIN;

INSERT INTO public.user_roles (user_id, role_id, is_active)
SELECT DISTINCT e.user_id, r.id, TRUE
FROM public.employees e
INNER JOIN public.roles r ON UPPER(r.code) = 'QUALITY_VIEWER'
WHERE e.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.roles existing_role ON existing_role.id = ur.role_id
    WHERE ur.user_id = e.user_id
      AND ur.is_active = TRUE
      AND existing_role.module_id = r.module_id
  )
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT COUNT(DISTINCT e.id) FROM employees e WHERE e.user_id IS NOT NULL; -- total vinculados
--   SELECT COUNT(DISTINCT e.id) FROM employees e
--     INNER JOIN user_roles ur ON ur.user_id = e.user_id AND ur.is_active = TRUE
--     INNER JOIN roles r ON r.id = ur.role_id
--     WHERE e.user_id IS NOT NULL AND r.module_id = (SELECT id FROM modules WHERE code = 'QUALITY');
--     -- debe ser igual al total vinculados
-- =============================================================================
