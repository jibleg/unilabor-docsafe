BEGIN;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
DECLARE
  user_id_type TEXT;
  category_id_type TEXT;
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

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO category_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'categories'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF user_id_type IS NULL THEN
    RAISE EXCEPTION 'No se pudo detectar users.id para crear user_categories';
  END IF;

  IF category_id_type IS NULL THEN
    RAISE EXCEPTION 'No se pudo detectar categories.id para crear user_categories';
  END IF;

  IF to_regclass('public.user_categories') IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.user_categories (
         user_id %s NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
         category_id %s NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (user_id, category_id)
       );',
      user_id_type,
      category_id_type
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_categories_user_id
  ON public.user_categories (user_id);

CREATE INDEX IF NOT EXISTS idx_user_categories_category_id
  ON public.user_categories (category_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_name_lower
  ON public.categories (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_documents_category_id
  ON public.documents (category_id);

CREATE INDEX IF NOT EXISTS idx_documents_status
  ON public.documents (status);

COMMIT;
