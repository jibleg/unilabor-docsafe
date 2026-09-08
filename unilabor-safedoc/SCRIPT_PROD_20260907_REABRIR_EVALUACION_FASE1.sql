-- =============================================================================
-- PROD · Reabrir la evaluación de Inducción Fase 1 a dos colaboradoras
-- Fecha: 2026-09-07
--
-- Caso: e_vianey_guadalupe@unilabor.mx y e_alejandra_chable@unilabor.mx
-- perdieron la conexión durante el cuestionario "Fase 1 Bienvenida".
--   * Vianey (asignación 124): al agotarse el cronómetro (20 min) la app envió
--     sola las respuestas capturadas y calificó NO ACREDITADA (status 'failed').
--   * Alejandra (asignación 127): el envío automático nunca llegó al servidor;
--     quedó en 'in_progress' con el cronómetro ya agotado (started_at fijo), por
--     lo que tampoco puede volver a presentar sin este reset.
--
-- Qué hace este script (en UNA transacción, se aborta sola si algo no cuadra):
--   1. Localiza la asignación de evaluación ligada a la inscripción de Fase 1
--      de cada colaboradora (rh_induction_enrollments.evaluation_assignment_id).
--   2. Respalda la asignación y sus respuestas en tablas zz_bak_* (evidencia).
--   3. Borra las respuestas del intento fallido.
--   4. Regresa la asignación a 'pending' con ventana nueva de 72 h e intento #2.
--   5. (Opcional) vuelve a sortear las 20 preguntas del cuestionario.
--
-- Qué NO toca: acuses de lectura (quality_reading_acknowledgements) — quedan
-- firmados; la inscripción de Inducción; el snapshot de preguntas (salvo que se
-- active el paso opcional); la bitácora de notificaciones.
--
-- Cómo correrlo en pgAdmin: ejecutar primero el PASO 0 y revisar. Luego
-- ejecutar el PASO 1 completo (desde BEGIN hasta COMMIT). Si el DO lanza
-- excepción, la transacción queda abortada: ejecutar ROLLBACK; y avisar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 0 · DIAGNÓSTICO (solo lectura). Se esperan 2 filas: una 'failed' (124) y
-- una 'in_progress' (127).
-- -----------------------------------------------------------------------------
SELECT u.email,
       e.id                        AS employee_id,
       e.full_name,
       en.id                       AS enrollment_id,
       en.reading_completed_at,
       ea.id                       AS assignment_id,
       ea.status,
       ea.attempt_no,
       ea.started_at,
       ea.submitted_at,
       ea.score, ea.max_score, ea.percentage,
       ea.deadline_at,
       ea.certificate_document_id,
       t.title                     AS template,
       t.attempt_time_limit_minutes,
       (SELECT COUNT(*) FROM public.evaluation_responses r WHERE r.assignment_id = ea.id)            AS respuestas,
       (SELECT COUNT(*) FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id)  AS preguntas
  FROM public.users u
  JOIN public.employees e                 ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph      ON ph.id = en.phase_id AND ph.phase_number = 1
  LEFT JOIN public.evaluation_assignments ea ON ea.id = en.evaluation_assignment_id
  LEFT JOIN public.evaluation_templates t    ON t.id = ea.template_id
 WHERE LOWER(u.email) IN ('e_vianey_guadalupe@unilabor.mx', 'e_alejandra_chable@unilabor.mx')
 ORDER BY u.email;

-- Lecturas de Fase 1 de ambas: deben verse 'signed' y así se quedan.
SELECT u.email, p.title_snapshot AS documento, a.status, a.signed_at
  FROM public.users u
  JOIN public.employees e                   ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en   ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph        ON ph.id = en.phase_id AND ph.phase_number = 1
  JOIN public.rh_induction_reading_items ri ON ri.enrollment_id = en.id
  JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
  JOIN public.quality_reading_publications p     ON p.id = a.publication_id
 WHERE LOWER(u.email) IN ('e_vianey_guadalupe@unilabor.mx', 'e_alejandra_chable@unilabor.mx')
 ORDER BY u.email, p.title_snapshot;


-- -----------------------------------------------------------------------------
-- PASO 1 · REVERSIÓN (ejecutar completo, de BEGIN a COMMIT)
-- -----------------------------------------------------------------------------
BEGIN;

-- Tablas de respaldo (evidencia del intento fallido). Se crean una sola vez.
CREATE TABLE IF NOT EXISTS public.zz_bak_20260907_eval_assignments
  (LIKE public.evaluation_assignments INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS public.zz_bak_20260907_eval_responses
  (LIKE public.evaluation_responses INCLUDING DEFAULTS);

DO $$
DECLARE
  v_ids   BIGINT[];
  v_found INT;
  v_reset INT;
BEGIN
  -- 1. Localizar las asignaciones a reabrir. Califican la reprobada ('failed')
  --    y la que quedó abierta sin envío ('in_progress'), sin constancia emitida.
  SELECT ARRAY_AGG(ea.id ORDER BY ea.id)
    INTO v_ids
    FROM public.users u
    JOIN public.employees e                 ON e.user_id = u.id
    JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
    JOIN public.rh_induction_phases ph      ON ph.id = en.phase_id AND ph.phase_number = 1
    JOIN public.evaluation_assignments ea   ON ea.id = en.evaluation_assignment_id
   WHERE LOWER(u.email) IN ('e_vianey_guadalupe@unilabor.mx', 'e_alejandra_chable@unilabor.mx')
     AND ea.status IN ('failed', 'in_progress')
     AND ea.certificate_document_id IS NULL;

  v_found := COALESCE(ARRAY_LENGTH(v_ids, 1), 0);
  IF v_found <> 2 THEN
    RAISE EXCEPTION
      'Se esperaban 2 evaluaciones de Fase 1 en estado failed/in_progress y se encontraron %. No se modificó nada; revisar el PASO 0.',
      v_found;
  END IF;

  -- 2. Respaldo del intento fallido (asignación + respuestas).
  INSERT INTO public.zz_bak_20260907_eval_assignments
    SELECT * FROM public.evaluation_assignments WHERE id = ANY (v_ids);
  INSERT INTO public.zz_bak_20260907_eval_responses
    SELECT * FROM public.evaluation_responses WHERE assignment_id = ANY (v_ids);

  -- 3. Borrar las respuestas del intento fallido (la app hace reemplazo total
  --    al enviar, pero con status 'pending' no deben quedar respuestas previas).
  DELETE FROM public.evaluation_responses WHERE assignment_id = ANY (v_ids);

  -- 4. Regresar la asignación a 'pending' con ventana nueva.
  --    * deadline_at: 72 h a partir de ahora (ajustar el intervalo si RH quiere otro plazo).
  --    * started_at NULL: el cronómetro de 20 min vuelve a arrancar cuando pulsen "Iniciar".
  --    * attempt_no + 1: queda trazado como intento #2.
  --    * reminder_sent_at / late_requested_at NULL: estado limpio para el scheduler.
  UPDATE public.evaluation_assignments
     SET status            = 'pending',
         available_at      = NOW(),
         deadline_at       = NOW() + INTERVAL '72 hours',
         started_at        = NULL,
         submitted_at      = NULL,
         graded_at         = NULL,
         score             = NULL,
         max_score         = NULL,
         percentage        = NULL,
         attempt_no        = attempt_no + 1,
         reminder_sent_at  = NULL,
         late_requested_at = NULL,
         updated_at        = NOW()
   WHERE id = ANY (v_ids)
     AND status IN ('failed', 'in_progress');

  GET DIAGNOSTICS v_reset = ROW_COUNT;
  IF v_reset <> 2 THEN
    RAISE EXCEPTION 'Se actualizaron % asignaciones en vez de 2. Transacción abortada.', v_reset;
  END IF;

  -- 5. OPCIONAL · Volver a sortear las preguntas (mismo criterio que la app:
  --    random_count preguntas al azar del banco de la plantilla). Descomentar
  --    solo si RH quiere que vean un cuestionario distinto al que ya vieron.
  /*
  DELETE FROM public.evaluation_assignment_questions WHERE assignment_id = ANY (v_ids);
  INSERT INTO public.evaluation_assignment_questions (assignment_id, question_id, sort_order)
  SELECT ea.id, sub.question_id, sub.rn - 1
    FROM public.evaluation_assignments ea
    JOIN public.evaluation_templates t ON t.id = ea.template_id
    JOIN LATERAL (
      SELECT q.id AS question_id, ROW_NUMBER() OVER () AS rn
        FROM (
          SELECT id FROM public.evaluation_questions
           WHERE template_id = t.id
           ORDER BY RANDOM()
           LIMIT COALESCE(t.random_count, 1000000)
        ) q
    ) sub ON TRUE
   WHERE ea.id = ANY (v_ids);
  */

  RAISE NOTICE 'Evaluaciones reabiertas (intento #2, 72 h): %', v_ids;
END
$$;

-- Verificación dentro de la misma transacción: 2 filas 'pending', 0 respuestas,
-- 20 preguntas, deadline en el futuro.
SELECT u.email, ea.id AS assignment_id, ea.status, ea.attempt_no,
       ea.available_at, ea.deadline_at, ea.started_at, ea.score, ea.percentage,
       (SELECT COUNT(*) FROM public.evaluation_responses r WHERE r.assignment_id = ea.id)           AS respuestas,
       (SELECT COUNT(*) FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id) AS preguntas
  FROM public.users u
  JOIN public.employees e                 ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph      ON ph.id = en.phase_id AND ph.phase_number = 1
  JOIN public.evaluation_assignments ea   ON ea.id = en.evaluation_assignment_id
 WHERE LOWER(u.email) IN ('e_vianey_guadalupe@unilabor.mx', 'e_alejandra_chable@unilabor.mx')
 ORDER BY u.email;

-- Si la verificación se ve bien:
COMMIT;
-- Si NO se ve bien, en lugar de COMMIT ejecutar:
-- ROLLBACK;


-- -----------------------------------------------------------------------------
-- PASO 2 · SOLO SI HAY QUE DESHACER DESPUÉS DEL COMMIT
-- Restaura la asignación y las respuestas desde el respaldo (deja el intento
-- fallido exactamente como estaba).
-- -----------------------------------------------------------------------------
/*
BEGIN;
DELETE FROM public.evaluation_responses
 WHERE assignment_id IN (SELECT id FROM public.zz_bak_20260907_eval_assignments);
INSERT INTO public.evaluation_responses
  SELECT * FROM public.zz_bak_20260907_eval_responses;
UPDATE public.evaluation_assignments ea
   SET status = b.status, available_at = b.available_at, deadline_at = b.deadline_at,
       started_at = b.started_at, submitted_at = b.submitted_at, graded_at = b.graded_at,
       score = b.score, max_score = b.max_score, percentage = b.percentage,
       attempt_no = b.attempt_no, reminder_sent_at = b.reminder_sent_at,
       late_requested_at = b.late_requested_at, updated_at = NOW()
  FROM public.zz_bak_20260907_eval_assignments b
 WHERE ea.id = b.id;
COMMIT;
*/
