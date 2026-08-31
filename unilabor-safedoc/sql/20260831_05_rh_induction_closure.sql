-- =============================================================================
-- RH - Cierre formal del Formato de Induccion (REH-REG-005)
--
-- Convierte el master record (reporte de avance del Bloque 1.5) en la
-- EVIDENCIA DOCUMENTAL final del proceso de induccion: RH cierra el registro
-- con 3 firmas digitales (Colaborador / Coordinacion de RH / Coordinador del
-- area), se genera el PDF definitivo y se archiva en el expediente bajo el
-- tipo FORMA_INDUCC de la seccion PROG_IND.
--
-- Cierre por etapas (decision del usuario): hoy el dictamen positivo es
-- APROBADA_INSTITUCIONAL (Fases 1-4, unicas construidas); cuando exista el
-- Bloque REH-REG-003 (Fases 5-7) el dictamen definitivo sera
-- APROBADA_COMPLETA. NO_APROBADA procede en cualquier momento con motivo.
--
-- Un cierre nunca se borra: una correccion genera un cierre nuevo y el
-- anterior queda is_current = FALSE (el documento archivado se versiona por
-- el mecanismo normal del expediente).
-- =============================================================================
BEGIN;

-- 1. Tipo documental FORMA_INDUCC en PROG_IND. En prod ya existe (creado por
--    RH desde la UI); esta siembra lo garantiza en cualquier BD.
INSERT INTO public.document_types (section_id, code, name, description, is_required, is_sensitive, has_expiry, is_active, sort_order)
SELECT s.id, 'FORMA_INDUCC', 'Formato de inducción',
       'Registro transversal de las 7 fases del programa de induccion (REH-REG-005), archivado al cerrar el proceso.',
       FALSE, FALSE, FALSE, TRUE, 1
FROM (SELECT id FROM public.document_sections WHERE UPPER(code) = 'PROG_IND') s
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_types WHERE UPPER(code) = 'FORMA_INDUCC'
);

-- 2. Cierres del registro de induccion.
CREATE TABLE IF NOT EXISTS public.rh_induction_record_closures (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  closing_notes TEXT NULL,
  collaborator_signature_path TEXT NOT NULL,
  rh_signature_path TEXT NOT NULL,
  area_signature_path TEXT NOT NULL,
  rh_signatory_name TEXT NOT NULL,
  area_signatory_name TEXT NOT NULL,
  closed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  document_id BIGINT NULL REFERENCES public.employee_documents(id) ON DELETE SET NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_induction_closures_verdict
    CHECK (verdict IN ('APROBADA_INSTITUCIONAL', 'APROBADA_COMPLETA', 'NO_APROBADA'))
);

-- Un solo cierre vigente por colaborador.
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_induction_closures_current
  ON public.rh_induction_record_closures (employee_id)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_rh_induction_closures_employee
  ON public.rh_induction_record_closures (employee_id);

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT to_regclass('public.rh_induction_record_closures');
--   SELECT dt.code, s.code FROM public.document_types dt
--     JOIN public.document_sections s ON s.id = dt.section_id
--    WHERE UPPER(dt.code) = 'FORMA_INDUCC';
-- =============================================================================
