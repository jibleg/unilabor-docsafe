-- MIGRACIONES_DEPLOY_20260924_03.sql — aplicar por pgAdmin (o psql desde el VPS) en prod (sgc.unilabor-app.com)
-- Contiene 20260924_03 (constancia de competencia REH-REG-003) y la registra en schema_migrations
-- con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO: la ultima aplicada en prod debe ser 20260924_02 (aplicar MIGRACIONES_DEPLOY_20260924_02.sql antes).
-- EFECTO EN PROD: columna certificate_document_id en rh_competency_evaluations + tipo documental
-- COMPETENCY_CERTIFICATE en la seccion Competencias laborales (has_expiry). No modifica filas existentes.
BEGIN;

-- ============ 20260924_03_rh_competency_certificate.sql ============

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

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260924_03_rh_competency_certificate.sql', '8f9d1b6f72ed0992f0f1dfded6b7f479a7336cf52679521751eb68f086e33064');

COMMIT;

-- POST-CHEQUEO:
--   SELECT code FROM public.document_types WHERE code = 'COMPETENCY_CERTIFICATE';
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 1;  -- 20260924_03_...
