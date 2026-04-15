BEGIN;

DO $$
DECLARE
  category_id_type TEXT;
  has_category_id BOOLEAN;
BEGIN
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

  IF category_id_type IS NULL THEN
    RAISE EXCEPTION 'No se pudo detectar categories.id para ajustar documents.category_id';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'category_id'
  ) INTO has_category_id;

  IF NOT has_category_id THEN
    EXECUTE format('ALTER TABLE public.documents ADD COLUMN category_id %s;', category_id_type);
  END IF;
END $$;

INSERT INTO public.categories (name)
SELECT 'Sin categoria'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories c
  WHERE LOWER(c.name) = LOWER('Sin categoria')
);

UPDATE public.documents d
SET category_id = c.id
FROM public.categories c
WHERE d.category_id IS NULL
  AND LOWER(c.name) = LOWER('Sin categoria');

ALTER TABLE public.documents
  ALTER COLUMN category_id SET NOT NULL;

DO $$
DECLARE
  has_fk BOOLEAN;
  category_attnum SMALLINT;
BEGIN
  SELECT a.attnum::smallint
    INTO category_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'public.documents'::regclass
    AND a.attname = 'category_id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.conrelid = 'public.documents'::regclass
      AND con.confrelid = 'public.categories'::regclass
      AND con.conkey = ARRAY[category_attnum]::smallint[]
  ) INTO has_fk;

  IF NOT has_fk THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT fk_documents_category_id
      FOREIGN KEY (category_id)
      REFERENCES public.categories(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_category_id
  ON public.documents (category_id);

COMMIT;
