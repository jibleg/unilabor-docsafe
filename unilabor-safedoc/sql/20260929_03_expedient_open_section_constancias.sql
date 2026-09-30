-- =============================================================================
-- RH/Expediente - Seccion abierta "Constancias".
-- Antes: 48 casillas genericas (Constancia 01..48) iguales para todos, con un
-- PDF vigente por casilla. Ahora: la seccion es ABIERTA: lista los documentos
-- reales del colaborador (cada constancia con su titulo/fechas/PDF, sin tope),
-- creados por RH o por el propio colaborador con un tipo generico CONSTANCIA y
-- reference_key propio por constancia (mismo mecanismo que las constancias de
-- curso). Las constancias ya cargadas en las casillas se migran al tipo generico
-- conservando archivo, titulo, fechas e historial; las 48 casillas se desactivan
-- (no se borran). No se borra ningun documento.
-- =============================================================================

ALTER TABLE public.document_sections
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS open_document_type_id BIGINT NULL
    REFERENCES public.document_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.document_sections.is_open IS
  'TRUE = seccion abierta: lista documentos reales (varios por tipo, sin casillas vacias).';
COMMENT ON COLUMN public.document_sections.open_document_type_id IS
  'Tipo documental generico con el que se crean los documentos nuevos de una seccion abierta.';

-- 1) Tipo generico "Constancia" en la seccion Constancias (CERTIFICATES).
INSERT INTO public.document_types
  (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_system_defined, is_active, sort_order)
SELECT s.id, 'CONSTANCIA', 'Constancia',
       'Constancia, diploma o reconocimiento del colaborador. Cada constancia es un documento propio con su titulo, fechas y PDF.',
       FALSE, FALSE, FALSE, TRUE, TRUE, 0
  FROM public.document_sections s
 WHERE UPPER(s.code) = 'CERTIFICATES'
   AND NOT EXISTS (SELECT 1 FROM public.document_types WHERE UPPER(code) = 'CONSTANCIA');

-- 2) Acceso al tipo nuevo para todos los colaboradores (el runtime lo completa para altas futuras).
INSERT INTO public.employee_document_type_access (employee_id, document_type_id, is_enabled)
SELECT e.id, dt.id, TRUE
  FROM public.employees e
 CROSS JOIN public.document_types dt
 WHERE UPPER(dt.code) = 'CONSTANCIA'
ON CONFLICT (employee_id, document_type_id) DO NOTHING;

-- 3) Migrar las constancias de las casillas al tipo generico. Cada casilla de
--    cada colaborador (todas sus versiones) se vuelve una linea propia via
--    reference_key, por lo que el historial y la unicidad de vigente se conservan.
WITH slots AS (
  SELECT t.id
    FROM public.document_types t
   INNER JOIN public.document_sections s ON s.id = t.section_id
   WHERE UPPER(s.code) = 'CERTIFICATES'
     AND t.is_system_defined = FALSE
     AND t.name ~ '^Constancia [0-9]{2}$'
),
target AS (
  SELECT id FROM public.document_types WHERE UPPER(code) = 'CONSTANCIA'
)
UPDATE public.employee_documents d
   SET reference_key = COALESCE(d.reference_key, 'constancia:slot:' || d.document_type_id || ':' || d.employee_id),
       document_type_id = (SELECT id FROM target),
       updated_at = NOW()
  FROM slots
 WHERE d.document_type_id = slots.id;

-- 4) La seccion pasa a abierta con el tipo generico.
UPDATE public.document_sections s
   SET is_open = TRUE,
       open_document_type_id = (SELECT id FROM public.document_types WHERE UPPER(code) = 'CONSTANCIA'),
       updated_at = NOW()
 WHERE UPPER(s.code) = 'CERTIFICATES';

-- 5) Desactivar (no borrar) las 48 casillas, ya sin documentos.
UPDATE public.document_types t
   SET is_active = FALSE,
       updated_at = NOW()
  FROM public.document_sections s
 WHERE s.id = t.section_id
   AND UPPER(s.code) = 'CERTIFICATES'
   AND t.is_system_defined = FALSE
   AND t.name ~ '^Constancia [0-9]{2}$'
   AND NOT EXISTS (SELECT 1 FROM public.employee_documents d WHERE d.document_type_id = t.id);
