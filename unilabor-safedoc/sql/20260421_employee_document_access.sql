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
    RAISE EXCEPTION 'No se pudo detectar users.id para crear accesos documentales RH';
  END IF;

  IF to_regclass('public.employee_document_section_access') IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.employee_document_section_access (
         id BIGSERIAL PRIMARY KEY,
         employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
         section_id BIGINT NOT NULL REFERENCES public.document_sections(id) ON DELETE CASCADE,
         is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
         configured_by_user_id %s NULL REFERENCES public.users(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         CONSTRAINT ux_employee_document_section_access UNIQUE (employee_id, section_id)
       );',
      user_id_type
    );
  END IF;

  IF to_regclass('public.employee_document_type_access') IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.employee_document_type_access (
         id BIGSERIAL PRIMARY KEY,
         employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
         document_type_id BIGINT NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
         is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
         configured_by_user_id %s NULL REFERENCES public.users(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         CONSTRAINT ux_employee_document_type_access UNIQUE (employee_id, document_type_id)
       );',
      user_id_type
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_document_section_access_employee
  ON public.employee_document_section_access (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_document_section_access_section
  ON public.employee_document_section_access (section_id);

CREATE INDEX IF NOT EXISTS idx_employee_document_section_access_enabled
  ON public.employee_document_section_access (is_enabled);

CREATE INDEX IF NOT EXISTS idx_employee_document_type_access_employee
  ON public.employee_document_type_access (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_document_type_access_type
  ON public.employee_document_type_access (document_type_id);

CREATE INDEX IF NOT EXISTS idx_employee_document_type_access_enabled
  ON public.employee_document_type_access (is_enabled);

INSERT INTO public.employee_document_section_access (
  employee_id,
  section_id,
  is_enabled
)
SELECT e.id, s.id, TRUE
FROM public.employees e
CROSS JOIN public.document_sections s
WHERE e.is_active = TRUE
  AND s.is_active = TRUE
ON CONFLICT (employee_id, section_id) DO NOTHING;

INSERT INTO public.employee_document_type_access (
  employee_id,
  document_type_id,
  is_enabled
)
SELECT e.id, dt.id, TRUE
FROM public.employees e
CROSS JOIN public.document_types dt
INNER JOIN public.document_sections s ON s.id = dt.section_id
WHERE e.is_active = TRUE
  AND s.is_active = TRUE
  AND dt.is_active = TRUE
ON CONFLICT (employee_id, document_type_id) DO NOTHING;

COMMIT;
