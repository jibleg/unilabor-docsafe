BEGIN;

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

COMMIT;
