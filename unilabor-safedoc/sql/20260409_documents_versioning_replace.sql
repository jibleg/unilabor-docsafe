BEGIN;

DO $$
DECLARE
  document_id_type TEXT;
  status_type_schema TEXT;
  status_type_name TEXT;
  status_is_enum BOOLEAN := FALSE;
  has_replaces_document_id BOOLEAN := FALSE;
  has_replaced_by_document_id BOOLEAN := FALSE;
  constraint_record RECORD;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO document_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'documents'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF document_id_type IS NULL THEN
    RAISE EXCEPTION 'No se pudo detectar documents.id para ajustar versionado de documentos';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'replaces_document_id'
  ) INTO has_replaces_document_id;

  IF NOT has_replaces_document_id THEN
    EXECUTE format(
      'ALTER TABLE public.documents ADD COLUMN replaces_document_id %s;',
      document_id_type
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'replaced_by_document_id'
  ) INTO has_replaced_by_document_id;

  IF NOT has_replaced_by_document_id THEN
    EXECUTE format(
      'ALTER TABLE public.documents ADD COLUMN replaced_by_document_id %s;',
      document_id_type
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_documents_replaces_document_id'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT fk_documents_replaces_document_id
      FOREIGN KEY (replaces_document_id)
      REFERENCES public.documents(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_documents_replaced_by_document_id'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT fk_documents_replaced_by_document_id
      FOREIGN KEY (replaced_by_document_id)
      REFERENCES public.documents(id)
      ON DELETE SET NULL;
  END IF;

  SELECT
    tn.nspname,
    t.typname,
    (t.typtype = 'e')
  INTO
    status_type_schema,
    status_type_name,
    status_is_enum
  FROM pg_attribute a
  JOIN pg_type t ON t.oid = a.atttypid
  JOIN pg_namespace tn ON tn.oid = t.typnamespace
  WHERE a.attrelid = 'public.documents'::regclass
    AND a.attname = 'status'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF status_is_enum AND status_type_schema IS NOT NULL AND status_type_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L;',
      status_type_schema,
      status_type_name,
      'superseded'
    );
  END IF;

  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.documents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.documents DROP CONSTRAINT %I;', constraint_record.conname);
  END LOOP;

  ALTER TABLE public.documents
    ADD CONSTRAINT chk_documents_status_allowed
    CHECK (status IN ('active', 'inactive', 'superseded'));
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_replaces_document_id
  ON public.documents (replaces_document_id);

CREATE INDEX IF NOT EXISTS idx_documents_replaced_by_document_id
  ON public.documents (replaced_by_document_id);

COMMIT;
