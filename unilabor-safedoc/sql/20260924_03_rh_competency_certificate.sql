BEGIN;

-- =====================================================================
-- Constancia de competencia (REH-REG-003): al cerrar la evaluacion con
-- dictamen distinto de NO COMPETENTE se emite una constancia en PDF y se
-- archiva en el expediente del colaborador (seccion Competencias laborales)
-- con expiry_date = vigencia de la autorizacion (12 meses).
-- =====================================================================

ALTER TABLE public.rh_competency_evaluations
  ADD COLUMN IF NOT EXISTS certificate_document_id BIGINT NULL
    REFERENCES public.employee_documents(id) ON DELETE SET NULL;

INSERT INTO public.document_types (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_active, sort_order)
SELECT s.id, 'COMPETENCY_CERTIFICATE', 'Constancia de competencia (REH-REG-003)',
       'Constancia emitida al cerrar la evaluacion de competencia con dictamen competente; vigencia de 12 meses.',
       FALSE, FALSE, TRUE, TRUE, 6
FROM (SELECT id FROM public.document_sections WHERE UPPER(code) = 'WORK_COMPETENCIES') s
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_types WHERE UPPER(code) = 'COMPETENCY_CERTIFICATE'
);

COMMIT;
