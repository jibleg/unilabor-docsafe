-- =============================================================================
-- RH - Induccion por puesto: banco de preguntas generado por IA
--
-- RH hoy escribe a mano cada pregunta de las evaluaciones de Fases 1-4 en
-- EvaluationTemplateEditorModal. Este banco es una capa de staging/curacion:
-- el backend genera preguntas candidatas con la API de Claude a partir del
-- texto de los documentos obligatorios de la fase, y quedan PENDING_REVIEW
-- hasta que RH las aprueba/edita/descarta. Solo entonces se copian (desde el
-- frontend) al arreglo de preguntas real de la plantilla, que se persiste con
-- el endpoint YA EXISTENTE PUT /templates/:templateId/questions — este banco
-- nunca escribe directo en evaluation_questions.
--
-- Reusa el permiso RH.INDUCTION.MANAGE (ya otorgado a RH_ADMIN/RH_EDITOR en
-- 20260828_01) en vez de crear uno nuevo: son los mismos actores que ya
-- administran fases, documentos y evaluaciones de induccion.
--
-- 100% ADITIVA: 2 tablas nuevas. No modifica ninguna tabla existente.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Una fila por corrida de generacion (trazabilidad ISO: quien, cuando, de
--    que documentos, con que modelo).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_question_bank_batches (
  id BIGSERIAL PRIMARY KEY,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  document_ids UUID[] NOT NULL,
  requested_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT NULL,
  question_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_question_bank_batches_status CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_rh_question_bank_batches_phase
  ON public.rh_question_bank_batches (phase_id);

-- ---------------------------------------------------------------------------
-- 2. Una fila por pregunta candidata. `options` es JSONB (no tabla
--    relacional): esta tabla es solo staging, nunca la consulta el motor de
--    examen (evaluation_assignment_questions), asi que no necesita el mismo
--    modelo relacional que evaluation_question_options.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_question_bank_items (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES public.rh_question_bank_batches(id) ON DELETE CASCADE,
  phase_id BIGINT NOT NULL REFERENCES public.rh_induction_phases(id) ON DELETE CASCADE,
  document_id UUID NULL REFERENCES public.documents(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Mismos tipos que evaluation_questions.type (training.schema.ts / types/index.ts).
  CONSTRAINT chk_rh_question_bank_items_type CHECK (type IN ('single', 'multiple', 'boolean', 'open')),
  CONSTRAINT chk_rh_question_bank_items_status CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_rh_question_bank_items_phase
  ON public.rh_question_bank_items (phase_id, status);

CREATE INDEX IF NOT EXISTS idx_rh_question_bank_items_batch
  ON public.rh_question_bank_items (batch_id);

COMMIT;

-- =============================================================================
-- Verificacion (ejecutar aparte tras el COMMIT):
--   SELECT to_regclass('public.rh_question_bank_batches'), to_regclass('public.rh_question_bank_items');
-- =============================================================================
