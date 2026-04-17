BEGIN;

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
    RAISE EXCEPTION 'No se pudo detectar users.id para crear employees.user_id';
  END IF;

  IF to_regclass('public.employees') IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.employees (
         id BIGSERIAL PRIMARY KEY,
         employee_code TEXT NOT NULL,
         user_id %s NULL REFERENCES public.users(id) ON DELETE SET NULL,
         full_name TEXT NOT NULL,
         email TEXT NOT NULL,
         area TEXT NULL,
         position TEXT NULL,
         is_active BOOLEAN NOT NULL DEFAULT TRUE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );',
      user_id_type
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_employee_code
  ON public.employees (UPPER(employee_code));

CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_user_id
  ON public.employees (user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_email
  ON public.employees (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_employees_is_active
  ON public.employees (is_active);

CREATE INDEX IF NOT EXISTS idx_employees_full_name
  ON public.employees (LOWER(full_name));

CREATE INDEX IF NOT EXISTS idx_employees_area
  ON public.employees (LOWER(area))
  WHERE area IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_position
  ON public.employees (LOWER(position))
  WHERE position IS NOT NULL;

COMMIT;
