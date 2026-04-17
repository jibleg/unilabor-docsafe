BEGIN;

CREATE TABLE IF NOT EXISTS public.modules (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  icon TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_modules_code
  ON public.modules (UPPER(code));

CREATE INDEX IF NOT EXISTS idx_modules_is_active
  ON public.modules (is_active);

DO $$
DECLARE
  user_id_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO user_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF user_id_type IS NULL THEN
    RAISE EXCEPTION 'No se pudo detectar users.id para crear user_module_roles';
  END IF;

  IF to_regclass('public.user_module_roles') IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.user_module_roles (
         id BIGSERIAL PRIMARY KEY,
         user_id %s NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
         module_id BIGINT NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
         role TEXT NOT NULL,
         is_active BOOLEAN NOT NULL DEFAULT TRUE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         CONSTRAINT chk_user_module_roles_role
           CHECK (UPPER(role) IN (''ADMIN'', ''EDITOR'', ''VIEWER''))
       );',
      user_id_type
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_module_roles_user_module
  ON public.user_module_roles (user_id, module_id);

CREATE INDEX IF NOT EXISTS idx_user_module_roles_user_id
  ON public.user_module_roles (user_id);

CREATE INDEX IF NOT EXISTS idx_user_module_roles_module_id
  ON public.user_module_roles (module_id);

CREATE INDEX IF NOT EXISTS idx_user_module_roles_is_active
  ON public.user_module_roles (is_active);

INSERT INTO public.modules (code, name, description, icon, is_active, sort_order)
SELECT source.code, source.name, source.description, source.icon, source.is_active, source.sort_order
FROM (
  VALUES
    (
      'QUALITY',
      'Documentos de Calidad',
      'Modulo institucional para gestion documental y control de calidad.',
      'shield-check',
      TRUE,
      10
    ),
    (
      'RH',
      'Recursos Humanos',
      'Modulo para expediente digital del colaborador y gestion documental de RH.',
      'users',
      TRUE,
      20
    )
) AS source(code, name, description, icon, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.modules existing
  WHERE UPPER(existing.code) = source.code
);

UPDATE public.modules
SET
  name = source.name,
  description = source.description,
  icon = source.icon,
  is_active = source.is_active,
  sort_order = source.sort_order,
  updated_at = NOW()
FROM (
  VALUES
    (
      'QUALITY',
      'Documentos de Calidad',
      'Modulo institucional para gestion documental y control de calidad.',
      'shield-check',
      TRUE,
      10
    ),
    (
      'RH',
      'Recursos Humanos',
      'Modulo para expediente digital del colaborador y gestion documental de RH.',
      'users',
      TRUE,
      20
    )
) AS source(code, name, description, icon, is_active, sort_order)
WHERE UPPER(public.modules.code) = source.code;

INSERT INTO public.user_module_roles (user_id, module_id, role, is_active)
SELECT
  u.id,
  m.id,
  UPPER(u.role::text),
  TRUE
FROM public.users u
INNER JOIN public.modules m
  ON UPPER(m.code) = 'QUALITY'
WHERE COALESCE(u.is_active, TRUE) = TRUE
  AND UPPER(u.role::text) IN ('ADMIN', 'EDITOR', 'VIEWER')
ON CONFLICT (user_id, module_id) DO UPDATE
SET
  role = EXCLUDED.role,
  is_active = TRUE,
  updated_at = NOW();

COMMIT;
