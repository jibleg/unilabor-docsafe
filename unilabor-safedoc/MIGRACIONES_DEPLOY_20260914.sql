-- MIGRACIONES_DEPLOY_20260914.sql — aplicar por pgAdmin (o psql desde el VPS) en prod (sgc.unilabor-app.com)
-- Contiene 20260914_01 (documento de origen por pregunta: evaluacion guiada Induccion Fases 2-4)
-- y la registra en schema_migrations con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260908_01:
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- EFECTO EN PROD: agrega una columna NULL + indice + backfill SOLO en plantillas de Fases 2-4
-- (texto identico al banco IA aprobado). La Fase 1 no se toca. Sin restart (toma efecto en vivo).
-- Se puede aplicar antes del deploy del backend sin riesgo (el codigo viejo ignora la columna).
BEGIN;

-- ============ 20260914_01_evaluation_questions_source_document.sql ============
-- =============================================================================
-- RH/Evaluaciones - Evaluacion guiada: documento de origen por pregunta
--
-- Para las fases 2-4 de Induccion, la evaluacion debe ser guiada y no rigida:
-- al mostrar cada pregunta, el colaborador ve de que documento del SGC fue
-- tomada y puede abrirlo en el visor protegido como apoyo. Para eso cada
-- pregunta guarda (opcionalmente) el documento fuente. RH lo fija en el editor
-- de la evaluacion; las preguntas que vienen del banco generado con IA lo
-- traen ya resuelto (rh_question_bank_items.document_id).
--
-- 100% ADITIVA: 1 columna nueva + backfill best-effort. ON DELETE SET NULL:
-- borrar/derogar un documento nunca afecta la evidencia de la evaluacion.
-- =============================================================================

ALTER TABLE public.evaluation_questions
  ADD COLUMN IF NOT EXISTS source_document_id UUID NULL
    REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_evaluation_questions_source_document
  ON public.evaluation_questions (source_document_id)
  WHERE source_document_id IS NOT NULL;

-- Backfill (solo Fases 2-4): preguntas copiadas desde el banco IA (mismo
-- texto exacto, en la plantilla del training_course de la fase del banco)
-- heredan su documento. Solo toca preguntas que aun no tienen documento; si
-- el texto se edito en el editor no habra coincidencia y RH lo fijara a mano.
-- La Fase 1 se excluye a proposito: ya se presento/esta en curso con reglas
-- estrictas y no debe cambiar a mitad del camino (RH puede activar la pista
-- pregunta por pregunta desde el editor si lo decide).
UPDATE public.evaluation_questions q
   SET source_document_id = b.document_id,
       updated_at = NOW()
  FROM public.rh_question_bank_items b
  JOIN public.rh_induction_phases ph ON ph.id = b.phase_id
  JOIN public.evaluation_templates t ON t.training_course_id = ph.training_course_id
 WHERE q.template_id = t.id
   AND ph.phase_number BETWEEN 2 AND 4
   AND q.source_document_id IS NULL
   AND b.document_id IS NOT NULL
   AND b.status = 'APPROVED'
   AND btrim(q.text) = btrim(b.text);

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260914_01_evaluation_questions_source_document.sql', 'e6ff3bb087806326d97d45895352a20e46ad97734821232f11d9cb2c49cd05ba');

COMMIT;

-- POST-CHEQUEO:
--   SELECT column_name FROM information_schema.columns WHERE table_name='evaluation_questions' AND column_name='source_document_id';
--   SELECT COUNT(*) FILTER (WHERE source_document_id IS NOT NULL) AS con_documento, COUNT(*) AS total
--     FROM public.evaluation_questions WHERE is_active;
