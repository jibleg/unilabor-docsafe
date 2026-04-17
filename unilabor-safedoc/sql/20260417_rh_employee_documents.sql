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
    RAISE EXCEPTION 'No se pudo detectar users.id para crear employee_documents';
  END IF;

  IF to_regclass('public.employee_documents') IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.employee_documents (
         id BIGSERIAL PRIMARY KEY,
         employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
         document_type_id BIGINT NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
         title TEXT NOT NULL,
         description TEXT NULL,
         file_path TEXT NOT NULL,
         file_size BIGINT NOT NULL DEFAULT 0,
         mime_type TEXT NOT NULL DEFAULT ''application/pdf'',
         uploaded_by_user_id %s NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
         issue_date DATE NULL,
         expiry_date DATE NULL,
         status TEXT NOT NULL DEFAULT ''active'',
         version INTEGER NOT NULL DEFAULT 1,
         is_current BOOLEAN NOT NULL DEFAULT TRUE,
         replaces_document_id BIGINT NULL REFERENCES public.employee_documents(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         CONSTRAINT chk_employee_documents_status
           CHECK (LOWER(status) IN (''active'', ''inactive'', ''superseded'')),
         CONSTRAINT chk_employee_documents_version
           CHECK (version >= 1)
       );',
      user_id_type
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_documents_current_type
  ON public.employee_documents (employee_id, document_type_id)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id
  ON public.employee_documents (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_documents_document_type_id
  ON public.employee_documents (document_type_id);

CREATE INDEX IF NOT EXISTS idx_employee_documents_uploaded_by_user_id
  ON public.employee_documents (uploaded_by_user_id);

CREATE INDEX IF NOT EXISTS idx_employee_documents_status
  ON public.employee_documents (status);

CREATE INDEX IF NOT EXISTS idx_employee_documents_is_current
  ON public.employee_documents (is_current);

COMMIT;
