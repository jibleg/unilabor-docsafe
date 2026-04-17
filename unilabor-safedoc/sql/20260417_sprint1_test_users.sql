-- Sprint 1 - Usuarios de prueba para validacion manual multi-modulo
--
-- Antes de ejecutar:
-- 1. Genera los hashes bcrypt con:
--      node scripts/hash-password.js Calidad123!
--      node scripts/hash-password.js Rh123456!
--      node scripts/hash-password.js Multi12345!
--      node scripts/hash-password.js SinMod123!
-- 2. Reemplaza los 4 placeholders HASH_* por los valores reales.
-- 3. Ejecuta este archivo completo.

BEGIN;

-- Usuario solo QUALITY
INSERT INTO public.users (
  email,
  password_hash,
  full_name,
  role,
  must_change_password,
  is_active
)
VALUES (
  'qa.quality.only@unilabor.local',
  'HASH_CALIDAD123',
  'QA Solo Quality',
  'ADMIN',
  FALSE,
  TRUE
)
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  must_change_password = EXCLUDED.must_change_password,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Usuario solo RH
INSERT INTO public.users (
  email,
  password_hash,
  full_name,
  role,
  must_change_password,
  is_active
)
VALUES (
  'qa.rh.only@unilabor.local',
  'HASH_RH123456',
  'QA Solo RH',
  'EDITOR',
  FALSE,
  TRUE
)
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  must_change_password = EXCLUDED.must_change_password,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Usuario con QUALITY + RH
INSERT INTO public.users (
  email,
  password_hash,
  full_name,
  role,
  must_change_password,
  is_active
)
VALUES (
  'qa.multi.module@unilabor.local',
  'HASH_MULTI12345',
  'QA Multi Modulo',
  'ADMIN',
  FALSE,
  TRUE
)
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  must_change_password = EXCLUDED.must_change_password,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Usuario sin modulos activos
INSERT INTO public.users (
  email,
  password_hash,
  full_name,
  role,
  must_change_password,
  is_active
)
VALUES (
  'qa.no.modules@unilabor.local',
  'HASH_SINMOD123',
  'QA Sin Modulos',
  'VIEWER',
  FALSE,
  TRUE
)
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  must_change_password = EXCLUDED.must_change_password,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

WITH quality_module AS (
  SELECT id FROM public.modules WHERE UPPER(code) = 'QUALITY'
),
rh_module AS (
  SELECT id FROM public.modules WHERE UPPER(code) = 'RH'
),
quality_user AS (
  SELECT id FROM public.users WHERE email = 'qa.quality.only@unilabor.local'
),
rh_user AS (
  SELECT id FROM public.users WHERE email = 'qa.rh.only@unilabor.local'
),
multi_user AS (
  SELECT id FROM public.users WHERE email = 'qa.multi.module@unilabor.local'
),
no_modules_user AS (
  SELECT id FROM public.users WHERE email = 'qa.no.modules@unilabor.local'
)
INSERT INTO public.user_module_roles (user_id, module_id, role, is_active)
SELECT quality_user.id, quality_module.id, 'ADMIN', TRUE
FROM quality_user, quality_module
ON CONFLICT (user_id, module_id) DO UPDATE
SET
  role = EXCLUDED.role,
  is_active = TRUE,
  updated_at = NOW();

WITH rh_module AS (
  SELECT id FROM public.modules WHERE UPPER(code) = 'RH'
),
rh_user AS (
  SELECT id FROM public.users WHERE email = 'qa.rh.only@unilabor.local'
)
INSERT INTO public.user_module_roles (user_id, module_id, role, is_active)
SELECT rh_user.id, rh_module.id, 'EDITOR', TRUE
FROM rh_user, rh_module
ON CONFLICT (user_id, module_id) DO UPDATE
SET
  role = EXCLUDED.role,
  is_active = TRUE,
  updated_at = NOW();

WITH quality_module AS (
  SELECT id FROM public.modules WHERE UPPER(code) = 'QUALITY'
),
multi_user AS (
  SELECT id FROM public.users WHERE email = 'qa.multi.module@unilabor.local'
)
INSERT INTO public.user_module_roles (user_id, module_id, role, is_active)
SELECT multi_user.id, quality_module.id, 'ADMIN', TRUE
FROM multi_user, quality_module
ON CONFLICT (user_id, module_id) DO UPDATE
SET
  role = EXCLUDED.role,
  is_active = TRUE,
  updated_at = NOW();

WITH rh_module AS (
  SELECT id FROM public.modules WHERE UPPER(code) = 'RH'
),
multi_user AS (
  SELECT id FROM public.users WHERE email = 'qa.multi.module@unilabor.local'
)
INSERT INTO public.user_module_roles (user_id, module_id, role, is_active)
SELECT multi_user.id, rh_module.id, 'EDITOR', TRUE
FROM multi_user, rh_module
ON CONFLICT (user_id, module_id) DO UPDATE
SET
  role = EXCLUDED.role,
  is_active = TRUE,
  updated_at = NOW();

UPDATE public.user_module_roles umr
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE umr.user_id = (
  SELECT id
  FROM public.users
  WHERE email = 'qa.no.modules@unilabor.local'
);

COMMIT;

-- Verificacion rapida
SELECT
  u.email,
  u.role::text AS user_role,
  umr.role AS module_role,
  m.code AS module_code,
  COALESCE(umr.is_active, FALSE) AS module_active
FROM public.users u
LEFT JOIN public.user_module_roles umr ON umr.user_id = u.id
LEFT JOIN public.modules m ON m.id = umr.module_id
WHERE u.email IN (
  'qa.quality.only@unilabor.local',
  'qa.rh.only@unilabor.local',
  'qa.multi.module@unilabor.local',
  'qa.no.modules@unilabor.local'
)
ORDER BY u.email, m.code;
