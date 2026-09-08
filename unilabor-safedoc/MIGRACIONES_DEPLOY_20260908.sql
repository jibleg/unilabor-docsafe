-- MIGRACIONES_DEPLOY_20260908.sql — aplicar por pgAdmin en prod (sgc.unilabor-app.com)
-- Contiene 20260908_01 (baja logica is_active en preguntas y opciones de evaluacion) y la
-- registra en schema_migrations con el checksum del runner (sha256 del contenido crudo).
-- PRE-CHEQUEO (ejecutar aparte ANTES): la ultima aplicada en prod debe ser 20260903_02:
--   SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 3;
-- EFECTO EN PROD: solo agrega columnas con DEFAULT TRUE; nada cambia de comportamiento hasta
-- desplegar el backend que las usa. Sin restart (toma efecto en vivo). Se puede aplicar antes
-- del deploy del backend sin riesgo (el codigo viejo ignora la columna).
BEGIN;

-- ============ 20260908_01_evaluation_questions_soft_delete.sql ============
-- Preguntas y opciones de evaluacion con baja logica (is_active).
--
-- Antes, guardar el banco de preguntas de una evaluacion borraba TODAS sus
-- preguntas y las volvia a insertar. Como evaluation_assignment_questions
-- (snapshot de cada intento) y evaluation_responses (respuestas del
-- colaborador) tienen ON DELETE CASCADE hacia evaluation_questions, cualquier
-- guardado del cuestionario -incluso solo para cambiar el plazo o corregir una
-- pregunta- destruia la evidencia de todas las evaluaciones ya presentadas
-- (RH veia "no tiene respuestas registradas") y dejaba sin preguntas los
-- examenes abiertos ("Esta evaluacion no tiene preguntas").
ALTER TABLE public.evaluation_questions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.evaluation_question_options
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS ix_evaluation_questions_template_active
  ON public.evaluation_questions (template_id)
  WHERE is_active;

INSERT INTO public.schema_migrations (filename, checksum)
VALUES ('20260908_01_evaluation_questions_soft_delete.sql', '68ea0cba0e2ad19d3ce391b02728d594277dec068680a6ee69c07058196bb461');

COMMIT;

-- POST-CHEQUEO:
--   SELECT column_name FROM information_schema.columns WHERE table_name='evaluation_questions' AND column_name='is_active';
