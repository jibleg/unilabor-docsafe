-- MIGRACIONES_DEPLOY_20261123_02.sql
-- Aplicar en xlab-extended (BD de DocSafe) antes de subir el build. Incluye:
--   20261123_02_rh_position_competency_method_evidence.sql
-- Aditiva e idempotente; registra la migracion en schema_migrations. PostgreSQL 10.

-- =============================================================================
-- RH - Competencias del puesto: metodo y "que se observa" (REH-REG-003 Rev. 2)
--
-- La seccion 3 (Evaluacion practica) del REH-REG-003 fija, por cada competencia
-- del puesto, el metodo de evaluacion y que se observa. Se guardan en el
-- catalogo del puesto y, al crear una evaluacion, se precargan en la seccion
-- 1. Competencia: `method` -> Metodo, `evidence_guide` -> Observaciones /
-- evidencia. La criticidad ya existia (20260831_06).
-- Aditiva e idempotente. Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

ALTER TABLE public.rh_position_competencies
  ADD COLUMN IF NOT EXISTS method TEXT NULL,
  ADD COLUMN IF NOT EXISTS evidence_guide TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_rh_position_competencies_method'
  ) THEN
    ALTER TABLE public.rh_position_competencies
      ADD CONSTRAINT chk_rh_position_competencies_method
      CHECK (method IS NULL OR method IN ('OD', 'RR', 'ES', 'EP', 'SI'));
  END IF;
END $$;

COMMENT ON COLUMN public.rh_position_competencies.method IS
  'Metodo de evaluacion que el REH-REG-003 fija para la competencia (OD, RR, ES, EP, SI).';
COMMENT ON COLUMN public.rh_position_competencies.evidence_guide IS
  'Que se observa al evaluar la competencia (REH-REG-003, seccion 3); se precarga en Observaciones / evidencia.';

COMMIT;
INSERT INTO public.schema_migrations (filename, checksum) VALUES ('20261123_02_rh_position_competency_method_evidence.sql', '39a2713639571949119d74067a8388571c61c760b29f21ca2add41a59ff2ee7a') ON CONFLICT (filename) DO NOTHING;
