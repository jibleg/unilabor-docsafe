-- MIGRACIONES_DEPLOY_20260924_02.sql — aplicar por pgAdmin (o psql desde el VPS) en prod (sgc.unilabor-app.com)
-- Contiene 20260924_02 (banco de preguntas IA por PUESTO + cuestionario de Conocimiento del REH-REG-003)
-- y la registra en schema_migrations con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260924_01:
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- EFECTO EN PROD: rh_question_bank_batches / rh_question_bank_items: phase_id pasa a NULL-able y se agrega
-- position_id (exactamente uno de los dos, CHECK); rh_competency_evaluations: knowledge_assignment_id,
-- knowledge_selection_mode, knowledge_synced_at; rh_competency_evaluation_items: question_id.
-- No modifica ni borra filas existentes (los lotes/preguntas de Induccion conservan su phase_id).
-- Aplicar ANTES del deploy del backend: el codigo nuevo lee position_id y knowledge_* al abrir una evaluacion.
BEGIN;

-- ============ 20260924_02_rh_competency_knowledge_bank.sql ============

-- =====================================================================
-- REH-REG-003, seccion 3 "Conocimiento" con banco de preguntas por PUESTO
-- y cuestionario contestado por el colaborador en el sistema.
--
-- 1) El banco de preguntas IA deja de ser exclusivo de las fases de
--    Induccion: cada lote/pregunta pertenece a UNA fase O a UN puesto.
-- 2) La evaluacion de competencia guarda el cuestionario asignado y cada
--    item de Conocimiento conserva la pregunta real del examen para
--    sincronizar la respuesta dada y el acierto.
-- =====================================================================

ALTER TABLE public.rh_question_bank_batches
  ALTER COLUMN phase_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS position_id BIGINT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE;

ALTER TABLE public.rh_question_bank_batches
  DROP CONSTRAINT IF EXISTS chk_rh_question_bank_batches_scope;
ALTER TABLE public.rh_question_bank_batches
  ADD CONSTRAINT chk_rh_question_bank_batches_scope
  CHECK ((phase_id IS NOT NULL) <> (position_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_rh_question_bank_batches_position
  ON public.rh_question_bank_batches (position_id);

ALTER TABLE public.rh_question_bank_items
  ALTER COLUMN phase_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS position_id BIGINT NULL REFERENCES public.rh_positions(id) ON DELETE CASCADE;

ALTER TABLE public.rh_question_bank_items
  DROP CONSTRAINT IF EXISTS chk_rh_question_bank_items_scope;
ALTER TABLE public.rh_question_bank_items
  ADD CONSTRAINT chk_rh_question_bank_items_scope
  CHECK ((phase_id IS NOT NULL) <> (position_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_rh_question_bank_items_position
  ON public.rh_question_bank_items (position_id, status);

ALTER TABLE public.rh_competency_evaluations
  ADD COLUMN IF NOT EXISTS knowledge_assignment_id BIGINT NULL REFERENCES public.evaluation_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS knowledge_selection_mode TEXT NULL,
  ADD COLUMN IF NOT EXISTS knowledge_synced_at TIMESTAMPTZ NULL;

ALTER TABLE public.rh_competency_evaluations
  DROP CONSTRAINT IF EXISTS chk_rh_comp_eval_knowledge_mode;
ALTER TABLE public.rh_competency_evaluations
  ADD CONSTRAINT chk_rh_comp_eval_knowledge_mode
  CHECK (knowledge_selection_mode IS NULL OR knowledge_selection_mode IN ('random', 'fixed'));

ALTER TABLE public.rh_competency_evaluation_items
  ADD COLUMN IF NOT EXISTS question_id BIGINT NULL REFERENCES public.evaluation_questions(id) ON DELETE SET NULL;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260924_02_rh_competency_knowledge_bank.sql', '4db84ba40cdea3363cce1580778882330732a21741d68b18a38ab1ed095bb207');

COMMIT;

-- POST-CHEQUEO:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'rh_question_bank_items' AND column_name = 'position_id';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'rh_competency_evaluations' AND column_name LIKE 'knowledge_%';
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 1;  -- 20260924_02_...
