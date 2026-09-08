-- =============================================================================
-- REPARAR "Esta evaluacion no tiene preguntas" (Induccion, pgAdmin prod)
-- =============================================================================
-- Sintoma: al abrir su evaluacion en Mis evaluaciones, el colaborador ve
-- "Esta evaluacion no tiene preguntas". Causa: una asignacion de
-- evaluation_assignments sin filas en evaluation_assignment_questions (snapshot
-- vacio). Suele quedar asi cuando un script borra el snapshot de un examen
-- "pending" que el colaborador abrio justo en ese momento (started_at quedo
-- puesto y la fila del examen sobrevivio).
--
-- El script decide por colaborador y fase:
--   A) La inscripcion YA NO apunta a ese examen y la lectura esta incompleta
--      (el colaborador fue reabierto a lectura): el examen huerfano sin
--      respuestas se ELIMINA. El cuestionario se abrira solo al terminar de leer.
--   B) La inscripcion SI apunta al examen (o la lectura ya esta completa):
--      se RE-GENERA el snapshot con las preguntas de la plantilla (todas o el
--      subconjunto aleatorio configurado), se regresa a "pending" sin iniciar
--      y se le da la ventana completa de la plantilla desde ahora.
-- No toca examenes con respuestas capturadas ni aprobados/reprobados.
--
-- USO: 1) PASO 0: captura el correo y la fase. 2) Ejecuta TODO el script.
--      El bloque DIAGNOSTICO GLOBAL (al final) lista a cualquier otro
--      colaborador con el mismo problema.
-- =============================================================================

-- ---------------------------- PASO 0 ----------------------------------------
DROP TABLE IF EXISTS zz_fix_target;
CREATE TEMP TABLE zz_fix_target AS
SELECT LOWER('f_eloisa_gabriela@unilabor.mx')::text AS email,   -- <== correo del colaborador
       1::int                                       AS phase_number;

-- ---------------------------- DIAGNOSTICO -----------------------------------
SELECT u.email, e.id AS employee_id, e.full_name,
       en.id AS enrollment_id, en.reading_completed_at, en.reading_deadline_at,
       en.evaluation_assignment_id AS examen_ligado,
       ea.id AS assignment_id, ea.status, ea.attempt_no, ea.started_at, ea.deadline_at,
       (SELECT COUNT(*) FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id) AS preguntas,
       (SELECT COUNT(*) FROM public.evaluation_responses r WHERE r.assignment_id = ea.id)           AS respuestas,
       CASE WHEN ea.id = en.evaluation_assignment_id THEN 'ligado a la inscripcion' ELSE 'HUERFANO (no ligado)' END AS relacion
  FROM zz_fix_target tg
  JOIN public.users u                     ON LOWER(u.email) = tg.email
  JOIN public.employees e                 ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph      ON ph.id = en.phase_id AND ph.phase_number = tg.phase_number
  LEFT JOIN public.evaluation_assignments ea ON ea.employee_id = e.id
   AND ea.template_id IN (SELECT id FROM public.evaluation_templates
                           WHERE training_course_id = COALESCE(en.training_course_id, ph.training_course_id))
 ORDER BY ea.id;

-- ---------------------------- REPARACION ------------------------------------
BEGIN;

DO $$
DECLARE
  v_email TEXT; v_phase INT;
  v_employee BIGINT; v_enrollment BIGINT; v_linked BIGINT; v_reading_done TIMESTAMPTZ;
  v_course BIGINT; v_template BIGINT; v_random INT; v_window INT; v_mode TEXT;
  r RECORD; v_fixed INT := 0; v_deleted INT := 0;
BEGIN
  SELECT email, phase_number INTO v_email, v_phase FROM zz_fix_target;

  SELECT e.id, en.id, en.evaluation_assignment_id, en.reading_completed_at,
         COALESCE(en.training_course_id, ph.training_course_id)
    INTO v_employee, v_enrollment, v_linked, v_reading_done, v_course
    FROM public.users u
    JOIN public.employees e                 ON e.user_id = u.id
    JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
    JOIN public.rh_induction_phases ph      ON ph.id = en.phase_id AND ph.phase_number = v_phase
   WHERE LOWER(u.email) = v_email;
  IF v_enrollment IS NULL THEN
    RAISE EXCEPTION 'No se encontro inscripcion de % en la fase %.', v_email, v_phase;
  END IF;

  SELECT t.id, t.random_count, t.window_hours, t.selection_mode
    INTO v_template, v_random, v_window, v_mode
    FROM public.evaluation_templates t
   WHERE t.training_course_id = v_course AND t.status = 'published' AND t.is_active AND t.evaluation_type = 'quiz'
   ORDER BY t.created_at DESC LIMIT 1;
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'La fase % no tiene cuestionario publicado.', v_phase;
  END IF;

  FOR r IN
    SELECT ea.id, ea.status
      FROM public.evaluation_assignments ea
     WHERE ea.employee_id = v_employee
       AND ea.template_id IN (SELECT id FROM public.evaluation_templates WHERE training_course_id = v_course)
       AND ea.status IN ('pending', 'in_progress', 'authorized_late')
       AND NOT EXISTS (SELECT 1 FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id)
       AND NOT EXISTS (SELECT 1 FROM public.evaluation_responses rs WHERE rs.assignment_id = ea.id)
     FOR UPDATE
  LOOP
    IF (v_linked IS NULL OR v_linked <> r.id) AND v_reading_done IS NULL THEN
      -- Caso A: huerfano y el colaborador sigue leyendo -> se elimina.
      UPDATE public.notification_log SET assignment_id = NULL WHERE assignment_id = r.id;
      DELETE FROM public.evaluation_assignments WHERE id = r.id;
      v_deleted := v_deleted + 1;
      RAISE NOTICE 'Examen % (%) eliminado: huerfano y lectura incompleta.', r.id, r.status;
    ELSE
      -- Caso B: se regenera el snapshot y se reabre la ventana completa.
      IF v_mode = 'random' AND COALESCE(v_random, 0) > 0 THEN
        INSERT INTO public.evaluation_assignment_questions (assignment_id, question_id, sort_order)
        SELECT r.id, sub.id, ROW_NUMBER() OVER () - 1
          FROM (SELECT id FROM public.evaluation_questions WHERE template_id = v_template ORDER BY RANDOM() LIMIT v_random) sub;
      ELSE
        INSERT INTO public.evaluation_assignment_questions (assignment_id, question_id, sort_order)
        SELECT r.id, id, sort_order FROM public.evaluation_questions WHERE template_id = v_template ORDER BY sort_order, id;
      END IF;
      UPDATE public.evaluation_assignments
         SET status = 'pending', started_at = NULL, template_id = v_template,
             available_at = NOW(), deadline_at = NOW() + make_interval(hours => v_window),
             reminder_sent_at = NULL, late_requested_at = NULL, updated_at = NOW()
       WHERE id = r.id;
      IF v_linked IS NULL THEN
        UPDATE public.rh_induction_enrollments SET evaluation_assignment_id = r.id, updated_at = NOW() WHERE id = v_enrollment;
      END IF;
      v_fixed := v_fixed + 1;
      RAISE NOTICE 'Examen % regenerado con preguntas; ventana de % h desde ahora.', r.id, v_window;
    END IF;
  END LOOP;

  RAISE NOTICE 'Resultado: % examen(es) regenerado(s), % eliminado(s).', v_fixed, v_deleted;
END $$;

-- Verificacion (misma consulta del diagnostico).
SELECT ea.id AS assignment_id, ea.status, ea.started_at, ea.deadline_at,
       (SELECT COUNT(*) FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id) AS preguntas,
       en.evaluation_assignment_id AS examen_ligado, en.reading_completed_at
  FROM zz_fix_target tg
  JOIN public.users u ON LOWER(u.email) = tg.email
  JOIN public.employees e ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph ON ph.id = en.phase_id AND ph.phase_number = tg.phase_number
  LEFT JOIN public.evaluation_assignments ea ON ea.employee_id = e.id
   AND ea.template_id IN (SELECT id FROM public.evaluation_templates WHERE training_course_id = COALESCE(en.training_course_id, ph.training_course_id));

COMMIT;
-- Si la verificacion no es la esperada, sustituye COMMIT por ROLLBACK.

-- ---------------------------- DIAGNOSTICO GLOBAL ----------------------------
-- Cualquier examen abierto sin preguntas en toda la plataforma (para detectar
-- otros afectados). Si aparecen, repite el script con su correo.
SELECT ea.id AS assignment_id, u.email, e.full_name, t.title, ea.status, ea.started_at, ea.deadline_at,
       (SELECT COUNT(*) FROM public.evaluation_responses r WHERE r.assignment_id = ea.id) AS respuestas
  FROM public.evaluation_assignments ea
  JOIN public.employees e ON e.id = ea.employee_id
  LEFT JOIN public.users u ON u.id = e.user_id
  JOIN public.evaluation_templates t ON t.id = ea.template_id
 WHERE t.evaluation_type = 'quiz'
   AND ea.status IN ('pending', 'in_progress', 'authorized_late')
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id)
 ORDER BY ea.id;
