-- Constancias por capacitacion: un colaborador puede tener varias constancias
-- vigentes (una POR CURSO), no una sola por tipo de documento.
-- Se agrega `reference_key` como discriminador y se reemplaza el indice unico de
-- "una vigente por tipo" por dos indices parciales:
--   - documentos normales (reference_key NULL): siguen siendo singleton por tipo
--     (un contrato vigente, un CV vigente, etc.).
--   - documentos con referencia (constancias = 'training_course:<id>'): unicos por
--     (empleado, tipo, referencia) => una constancia vigente por capacitacion.
BEGIN;

ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS reference_key TEXT NULL;

-- Backfill: las constancias de capacitacion ya emitidas se etiquetan con su curso.
UPDATE public.employee_documents ed
   SET reference_key = 'training_course:' || t.training_course_id
  FROM public.evaluation_assignments a
  JOIN public.evaluation_templates t ON t.id = a.template_id
 WHERE a.certificate_document_id = ed.id
   AND ed.reference_key IS NULL;

DROP INDEX IF EXISTS public.ux_employee_documents_current_type;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_documents_current_singleton
  ON public.employee_documents (employee_id, document_type_id)
  WHERE is_current = TRUE AND reference_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_documents_current_referenced
  ON public.employee_documents (employee_id, document_type_id, reference_key)
  WHERE is_current = TRUE AND reference_key IS NOT NULL;

COMMIT;
