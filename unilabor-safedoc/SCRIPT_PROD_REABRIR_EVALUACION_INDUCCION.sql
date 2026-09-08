-- =============================================================================
-- PROD · Reabrir la evaluación de una fase de Inducción a UN colaborador
-- (caso: perdió la conexión durante el cuestionario y quedó NO ACREDITADA o
-- abierta con el cronómetro agotado). Reutilizable: solo cambia el correo.
--
-- Cubre los dos estados que deja una caída de internet:
--   * 'failed'      -> el cronómetro se agotó y la app envió sola lo capturado.
--   * 'in_progress' -> el envío automático nunca llegó; quedó abierta con el
--                      cronómetro ya agotado y no puede volver a presentar.
--
-- Qué hace (en UNA transacción; si algo no cuadra se aborta sola):
--   1. Localiza la asignación ligada a la inscripción de la fase indicada.
--   2. Respalda la asignación y sus respuestas en zz_bak_eval_reset_* (evidencia).
--   3. Borra las respuestas del intento fallido.
--   4. Regresa la MISMA asignación a 'pending', plazo nuevo, intento N+1,
--      cronómetro limpio. Sin correo ni SMS.
--
-- NO toca: acuses de lectura firmados, inscripción, snapshot de preguntas
-- (salvo activar el paso opcional), bitácora de notificaciones.
--
-- Nota: cuando el botón "Autorizar nuevo intento" esté en prod, usar el botón
-- (crea una asignación nueva y conserva la reprobada). Este script es el
-- respaldo manual y reabre la misma asignación.
--
-- USO EN PGADMIN:
--   a) Cambiar el correo en el PASO 0 (y, si aplica, fase y horas).
--   b) Ejecutar el PASO 0 completo y revisar las dos consultas.
--   c) Ejecutar el PASO 1 completo (de BEGIN a COMMIT).
--      Si el DO lanza excepción: ejecutar ROLLBACK; y revisar el PASO 0.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 0 · PARÁMETROS + DIAGNÓSTICO (solo lectura)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS zz_reset_target;
CREATE TEMP TABLE zz_reset_target AS
SELECT
  LOWER('e_correo_del_colaborador@unilabor.mx')::text AS email,   -- <== CAMBIAR AQUÍ
  1::int                                              AS phase_number,   -- fase de Inducción (1..7)
  72::int                                             AS reopen_hours;   -- plazo nuevo desde ahora

-- 0.1 Estado actual: se espera 1 fila con status 'failed' o 'in_progress'.
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
  FROM zz_reset_target tg
  JOIN public.users u                     ON LOWER(u.email) = tg.email
  JOIN public.employees e                 ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph      ON ph.id = en.phase_id AND ph.phase_number = tg.phase_number
  LEFT JOIN public.evaluation_assignments ea ON ea.id = en.evaluation_assignment_id
  LEFT JOIN public.evaluation_templates t    ON t.id = ea.template_id;

-- 0.2 Lecturas de la fase: deben verse 'signed' y así se quedan.
SELECT u.email, p.title_snapshot AS documento, a.status, a.signed_at
  FROM zz_reset_target tg
  JOIN public.users u                       ON LOWER(u.email) = tg.email
  JOIN public.employees e                   ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en   ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph        ON ph.id = en.phase_id AND ph.phase_number = tg.phase_number
  JOIN public.rh_induction_reading_items ri ON ri.enrollment_id = en.id
  JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
  JOIN public.quality_reading_publications p     ON p.id = a.publication_id
 ORDER BY p.title_snapshot;


-- -----------------------------------------------------------------------------
-- PASO 1 · REVERSIÓN (ejecutar completo, de BEGIN a COMMIT)
-- -----------------------------------------------------------------------------
BEGIN;

-- Respaldo acumulativo (una fila por intento reabierto; se crean una sola vez).
CREATE TABLE IF NOT EXISTS public.zz_bak_eval_reset_assignments
  (LIKE public.evaluation_assignments INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS public.zz_bak_eval_reset_responses
  (LIKE public.evaluation_responses INCLUDING DEFAULTS);

DO $$
DECLARE
  v_email  TEXT;
  v_phase  INT;
  v_hours  INT;
  v_id     BIGINT;
  v_status TEXT;
  v_found  INT;
  v_reset  INT;
BEGIN
  SELECT email, phase_number, reopen_hours INTO v_email, v_phase, v_hours FROM zz_reset_target;
  IF v_email IS NULL OR v_email LIKE 'e_correo_del_colaborador%' THEN
    RAISE EXCEPTION 'Falta capturar el correo del colaborador en el PASO 0.';
  END IF;

  -- 1. Localizar la asignación a reabrir (solo failed / in_progress, sin constancia).
  SELECT ea.id, ea.status, COUNT(*) OVER ()
    INTO v_id, v_status, v_found
    FROM public.users u
    JOIN public.employees e                 ON e.user_id = u.id
    JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
    JOIN public.rh_induction_phases ph      ON ph.id = en.phase_id AND ph.phase_number = v_phase
    JOIN public.evaluation_assignments ea   ON ea.id = en.evaluation_assignment_id
   WHERE LOWER(u.email) = v_email
     AND ea.status IN ('failed', 'in_progress')
     AND ea.certificate_document_id IS NULL;

  IF v_found IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'Para % en la fase % se esperaba 1 evaluación en estado failed/in_progress y se encontraron %. No se modificó nada; revisar el PASO 0.',
      v_email, v_phase, COALESCE(v_found, 0);
  END IF;

  -- 2. Respaldo del intento fallido.
  INSERT INTO public.zz_bak_eval_reset_assignments
    SELECT * FROM public.evaluation_assignments WHERE id = v_id;
  INSERT INTO public.zz_bak_eval_reset_responses
    SELECT * FROM public.evaluation_responses WHERE assignment_id = v_id;

  -- 3. Borrar las respuestas del intento fallido.
  DELETE FROM public.evaluation_responses WHERE assignment_id = v_id;

  -- 4. Regresar la asignación a 'pending' con ventana nueva y cronómetro limpio.
  UPDATE public.evaluation_assignments
     SET status            = 'pending',
         available_at      = NOW(),
         deadline_at       = NOW() + (v_hours || ' hours')::interval,
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
   WHERE id = v_id
     AND status IN ('failed', 'in_progress');

  GET DIAGNOSTICS v_reset = ROW_COUNT;
  IF v_reset <> 1 THEN
    RAISE EXCEPTION 'Se actualizaron % asignaciones en vez de 1. Transacción abortada.', v_reset;
  END IF;

  -- 5. OPCIONAL · Volver a sortear las preguntas (mismo criterio que la app).
  --    Descomentar solo si RH quiere que vea un cuestionario distinto.
  /*
  DELETE FROM public.evaluation_assignment_questions WHERE assignment_id = v_id;
  INSERT INTO public.evaluation_assignment_questions (assignment_id, question_id, sort_order)
  SELECT v_id, sub.id, ROW_NUMBER() OVER () - 1
    FROM (
      SELECT q.id
        FROM public.evaluation_questions q
        JOIN public.evaluation_assignments ea ON ea.template_id = q.template_id
        JOIN public.evaluation_templates t ON t.id = ea.template_id
       WHERE ea.id = v_id
       ORDER BY RANDOM()
       LIMIT (SELECT COALESCE(t2.random_count, 1000000)
                FROM public.evaluation_assignments ea2
                JOIN public.evaluation_templates t2 ON t2.id = ea2.template_id
               WHERE ea2.id = v_id)
    ) sub;
  */

  RAISE NOTICE 'Evaluación % de % reabierta: estaba %, ahora pending, intento #%, % h de plazo.',
    v_id, v_email, v_status, (SELECT attempt_no FROM public.evaluation_assignments WHERE id = v_id), v_hours;
END
$$;

-- Verificación dentro de la transacción: 1 fila 'pending', 0 respuestas,
-- preguntas completas, deadline en el futuro.
SELECT u.email, ea.id AS assignment_id, ea.status, ea.attempt_no,
       ea.available_at, ea.deadline_at, ea.started_at, ea.score, ea.percentage,
       (SELECT COUNT(*) FROM public.evaluation_responses r WHERE r.assignment_id = ea.id)           AS respuestas,
       (SELECT COUNT(*) FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id) AS preguntas
  FROM zz_reset_target tg
  JOIN public.users u                     ON LOWER(u.email) = tg.email
  JOIN public.employees e                 ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph      ON ph.id = en.phase_id AND ph.phase_number = tg.phase_number
  JOIN public.evaluation_assignments ea   ON ea.id = en.evaluation_assignment_id;

-- Si la verificación se ve bien:
COMMIT;
-- Si NO se ve bien, en lugar de COMMIT ejecutar:
-- ROLLBACK;


-- -----------------------------------------------------------------------------
-- PASO 2 · SOLO SI HAY QUE DESHACER DESPUÉS DEL COMMIT (un colaborador)
-- Restaura la asignación y las respuestas del ÚLTIMO respaldo de ese colaborador
-- (toma el correo de zz_reset_target del PASO 0).
-- -----------------------------------------------------------------------------
/*
BEGIN;
DROP TABLE IF EXISTS zz_undo_target;
CREATE TEMP TABLE zz_undo_target AS
SELECT b.*
  FROM public.zz_bak_eval_reset_assignments b
  JOIN public.employees e ON e.id = b.employee_id
  JOIN public.users u     ON u.id = e.user_id
  JOIN zz_reset_target tg ON LOWER(u.email) = tg.email
 ORDER BY b.updated_at DESC
 LIMIT 1;

UPDATE public.evaluation_assignments ea
   SET status = b.status, available_at = b.available_at, deadline_at = b.deadline_at,
       started_at = b.started_at, submitted_at = b.submitted_at, graded_at = b.graded_at,
       score = b.score, max_score = b.max_score, percentage = b.percentage,
       attempt_no = b.attempt_no, reminder_sent_at = b.reminder_sent_at,
       late_requested_at = b.late_requested_at, updated_at = NOW()
  FROM zz_undo_target b
 WHERE ea.id = b.id;

DELETE FROM public.evaluation_responses r
 USING zz_undo_target b
 WHERE r.assignment_id = b.id;
INSERT INTO public.evaluation_responses
  SELECT DISTINCT ON (r.assignment_id, r.question_id) r.*
    FROM public.zz_bak_eval_reset_responses r
    JOIN zz_undo_target b ON b.id = r.assignment_id
   ORDER BY r.assignment_id, r.question_id, r.updated_at DESC;
COMMIT;
*/
