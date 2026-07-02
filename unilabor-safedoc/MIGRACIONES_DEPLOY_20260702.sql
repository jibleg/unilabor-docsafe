-- =====================================================================
-- SafeDoc — migracion pendiente para aplicar MANUALMENTE en pgAdmin4
-- Deploy 2026-07-02 · Sprint 40: Evaluacion practica (captura directa RH)
-- Generado desde sql/20260702_01_eval_practical_type.sql
--
-- Seguro de correr completo: va en su propia transaccion (BEGIN/COMMIT) y es
-- idempotente (ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS + ADD).
-- Re-aplicar algo ya aplicado NO hace nada.
-- Tambien registra la migracion en schema_migrations con el MISMO checksum que
-- el runner (65d629...), para que luego `migrate:status` la vea como aplicada
-- y NO la marque como "modificada".
--
-- Requisito previo: la BD de prod debe estar en el estado del deploy 2026-06-23
-- (todas las migraciones <= 20260623_01 aplicadas). Verificalo con:
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- Debe listar 20260623_01_helpdesk_hardening.sql. Si no, aplica primero el
-- bloque previo (MIGRACIONES_PENDIENTES_MANUAL.sql).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 20260702_01_eval_practical_type.sql
-- ---------------------------------------------------------------------
BEGIN;
-- Sprint 40 (EVAL-93) - Tipo de evaluacion en evaluation_templates.
-- Distingue las evaluaciones tipo 'quiz' (cuestionario que contesta el colaborador,
-- Sprints 31-39) de las 'practical' (capacitacion presencial: RH captura la
-- calificacion directamente, sin cuestionario). Aditivo y no destructivo:
-- default 'quiz' -> las plantillas y evaluaciones existentes no cambian.

ALTER TABLE public.evaluation_templates
  ADD COLUMN IF NOT EXISTS evaluation_type TEXT NOT NULL DEFAULT 'quiz';

ALTER TABLE public.evaluation_templates
  DROP CONSTRAINT IF EXISTS chk_eval_templates_type;

ALTER TABLE public.evaluation_templates
  ADD CONSTRAINT chk_eval_templates_type
  CHECK (evaluation_type IN ('quiz', 'practical'));

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260702_01_eval_practical_type.sql', '65d629eaad5f4cd27e89ae1c14168de73dd62860d126e95acc205a1195d7f154')
ON CONFLICT (filename) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------
-- Verificacion (opcional): debe devolver la columna, el constraint y la
-- migracion registrada.
-- ---------------------------------------------------------------------
-- SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'evaluation_templates' AND column_name = 'evaluation_type';
-- SELECT conname FROM pg_constraint WHERE conname = 'chk_eval_templates_type';
-- SELECT filename, checksum FROM public.schema_migrations
--   WHERE filename = '20260702_01_eval_practical_type.sql';
