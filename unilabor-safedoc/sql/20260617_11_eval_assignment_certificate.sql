-- Sprint 36 (EVAL-58) - Enlace de la asignacion con su constancia generada.
-- Permite idempotencia (no regenerar) y exponer la constancia al colaborador.
BEGIN;

ALTER TABLE public.evaluation_assignments
  ADD COLUMN IF NOT EXISTS certificate_document_id BIGINT NULL
    REFERENCES public.employee_documents(id) ON DELETE SET NULL;

COMMIT;
