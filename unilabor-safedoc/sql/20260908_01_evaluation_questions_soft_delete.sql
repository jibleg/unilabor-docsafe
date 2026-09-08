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
--
-- Con is_active, el guardado ya no borra preguntas referenciadas por algun
-- intento: las desactiva (y crea una version nueva si cambiaron). Solo las
-- preguntas nunca usadas se eliminan fisicamente. Las consultas del editor,
-- del conteo y del snapshot de nuevos intentos filtran is_active = TRUE; las
-- de calificacion, revision de respuestas y toma del examen siguen usando el
-- snapshot del intento, por lo que las preguntas desactivadas se conservan.
--
-- Sin backfill: todo lo existente queda activo.

ALTER TABLE public.evaluation_questions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.evaluation_question_options
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS ix_evaluation_questions_template_active
  ON public.evaluation_questions (template_id)
  WHERE is_active;
