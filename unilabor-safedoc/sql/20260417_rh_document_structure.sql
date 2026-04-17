BEGIN;

CREATE TABLE IF NOT EXISTS public.document_sections (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system_defined BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_document_sections_code
  ON public.document_sections (UPPER(code));

CREATE INDEX IF NOT EXISTS idx_document_sections_is_active
  ON public.document_sections (is_active);

CREATE INDEX IF NOT EXISTS idx_document_sections_sort_order
  ON public.document_sections (sort_order);

CREATE TABLE IF NOT EXISTS public.document_types (
  id BIGSERIAL PRIMARY KEY,
  section_id BIGINT NOT NULL REFERENCES public.document_sections(id) ON DELETE CASCADE,
  code TEXT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  has_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  is_system_defined BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_document_types_section_name
  ON public.document_types (section_id, UPPER(name));

CREATE UNIQUE INDEX IF NOT EXISTS ux_document_types_code
  ON public.document_types (UPPER(code))
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_types_section_id
  ON public.document_types (section_id);

CREATE INDEX IF NOT EXISTS idx_document_types_is_active
  ON public.document_types (is_active);

CREATE INDEX IF NOT EXISTS idx_document_types_sort_order
  ON public.document_types (sort_order);

INSERT INTO public.document_sections (code, name, description, is_active, is_system_defined, sort_order)
SELECT source.code, source.name, source.description, source.is_active, source.is_system_defined, source.sort_order
FROM (
  VALUES
    ('PERSONAL', 'Documentos personales', 'Documentos base e identificacion del colaborador.', TRUE, TRUE, 10),
    ('UNILABOR_POLICY', 'Reglamento UNILABOR', 'Documentos institucionales y de cumplimiento interno.', TRUE, TRUE, 20),
    ('CONTRACTS', 'Contratos', 'Documentos contractuales, renovaciones y anexos.', TRUE, TRUE, 30),
    ('WORK_COMPETENCIES', 'Competencias laborales', 'Evaluaciones, capacitaciones y desarrollo del colaborador.', TRUE, TRUE, 40),
    ('CERTIFICATES', 'Constancias', 'Cursos, talleres, diplomados, reconocimientos y vigencias.', TRUE, TRUE, 50)
) AS source(code, name, description, is_active, is_system_defined, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.document_sections existing
  WHERE UPPER(existing.code) = source.code
);

UPDATE public.document_sections
SET
  name = source.name,
  description = source.description,
  is_active = source.is_active,
  is_system_defined = source.is_system_defined,
  sort_order = source.sort_order,
  updated_at = NOW()
FROM (
  VALUES
    ('PERSONAL', 'Documentos personales', 'Documentos base e identificacion del colaborador.', TRUE, TRUE, 10),
    ('UNILABOR_POLICY', 'Reglamento UNILABOR', 'Documentos institucionales y de cumplimiento interno.', TRUE, TRUE, 20),
    ('CONTRACTS', 'Contratos', 'Documentos contractuales, renovaciones y anexos.', TRUE, TRUE, 30),
    ('WORK_COMPETENCIES', 'Competencias laborales', 'Evaluaciones, capacitaciones y desarrollo del colaborador.', TRUE, TRUE, 40),
    ('CERTIFICATES', 'Constancias', 'Cursos, talleres, diplomados, reconocimientos y vigencias.', TRUE, TRUE, 50)
) AS source(code, name, description, is_active, is_system_defined, sort_order)
WHERE UPPER(public.document_sections.code) = source.code;

INSERT INTO public.document_types (
  section_id,
  code,
  name,
  description,
  is_required,
  is_sensitive,
  has_expiry,
  is_system_defined,
  is_active,
  sort_order
)
SELECT
  sections.id,
  source.code,
  source.name,
  source.description,
  source.is_required,
  source.is_sensitive,
  source.has_expiry,
  source.is_system_defined,
  source.is_active,
  source.sort_order
FROM (
  VALUES
    ('PERSONAL', 'INE', 'INE', 'Identificacion oficial del colaborador.', TRUE, TRUE, FALSE, TRUE, TRUE, 10),
    ('PERSONAL', 'CURP', 'CURP', 'Clave unica de registro de poblacion.', TRUE, TRUE, FALSE, TRUE, TRUE, 20),
    ('PERSONAL', 'RFC', 'RFC', 'Registro federal de contribuyentes.', TRUE, TRUE, FALSE, TRUE, TRUE, 30),
    ('PERSONAL', 'ADDRESS_PROOF', 'Comprobante de domicilio', 'Documento vigente de domicilio.', TRUE, TRUE, FALSE, TRUE, TRUE, 40),
    ('UNILABOR_POLICY', 'CONFIDENTIALITY_LETTER', 'Carta de confidencialidad', 'Aceptacion formal de confidencialidad.', TRUE, FALSE, FALSE, TRUE, TRUE, 10),
    ('UNILABOR_POLICY', 'POSITION_ASSIGNMENT', 'Asignacion de puesto', 'Documento de definicion de puesto.', TRUE, FALSE, FALSE, TRUE, TRUE, 20),
    ('CONTRACTS', 'LIMITED_CONTRACT_1', '1er contrato limitado', 'Primer contrato de tiempo determinado.', FALSE, TRUE, FALSE, TRUE, TRUE, 10),
    ('CONTRACTS', 'INDEFINITE_CONTRACT', 'Contrato indeterminado', 'Contrato por tiempo indeterminado.', FALSE, TRUE, FALSE, TRUE, TRUE, 20),
    ('WORK_COMPETENCIES', 'PERFORMANCE_EVALUATION', 'Evaluacion de desempeno', 'Evaluacion formal del colaborador.', FALSE, FALSE, FALSE, TRUE, TRUE, 10),
    ('WORK_COMPETENCIES', 'TRAINING', 'Capacitacion', 'Evidencia de capacitacion interna.', FALSE, FALSE, FALSE, TRUE, TRUE, 20),
    ('CERTIFICATES', 'COURSE_CERTIFICATE', 'Constancia de curso', 'Constancia o diploma con posible vencimiento.', FALSE, FALSE, TRUE, TRUE, TRUE, 10)
) AS source(section_code, code, name, description, is_required, is_sensitive, has_expiry, is_system_defined, is_active, sort_order)
INNER JOIN public.document_sections sections
  ON UPPER(sections.code) = source.section_code
WHERE NOT EXISTS (
  SELECT 1
  FROM public.document_types existing
  WHERE existing.section_id = sections.id
    AND UPPER(existing.name) = UPPER(source.name)
);

COMMIT;
