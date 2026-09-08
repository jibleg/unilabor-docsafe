-- =============================================================================
-- SANEAMIENTO GLOBAL: examenes abiertos sin preguntas + inventario de evidencia
-- perdida (pgAdmin, prod). Ejecutar DESPUES de aplicar la migracion
-- 20260908_01_evaluation_questions_soft_delete.sql (o antes: no depende de ella).
-- =============================================================================
-- Causa raiz (corregida en codigo el 2026-09-08): al guardar un cuestionario en
-- Capacitaciones, el sistema borraba y reinsertaba todas sus preguntas; por el
-- ON DELETE CASCADE de evaluation_assignment_questions y evaluation_responses,
-- cada guardado destruia:
--   - el snapshot de preguntas de los examenes abiertos -> "Esta evaluacion no
--     tiene preguntas" al iniciarla;
--   - las respuestas de los examenes ya presentados -> "no tiene respuestas
--     registradas" en el boton Ver del Panel de capacitacion.
-- La calificacion (score/percentage/estado) y la constancia NO se perdieron.
--
-- Este script:
--   1) DIAGNOSTICO: lista examenes abiertos sin snapshot y examenes presentados
--      sin respuestas (estos ultimos son irrecuperables sin respaldo de BD).
--   2) REPARACION: regenera el snapshot de TODOS los examenes abiertos de tipo
--      cuestionario que no tienen preguntas (todas o el subconjunto aleatorio
--      de su plantilla), los deja en "pending" sin iniciar y les da la ventana
--      completa de la plantilla desde ahora. Solo se tocan examenes SIN
--      respuestas capturadas.
-- =============================================================================

-- ------------------------------ 1) DIAGNOSTICO -------------------------------
-- a) Examenes abiertos sin preguntas (se reparan abajo).
SELECT ea.id AS assignment_id, u.email, e.full_name, t.title, ea.status, ea.started_at, ea.deadline_at
  FROM public.evaluation_assignments ea
  JOIN public.employees e ON e.id = ea.employee_id
  LEFT JOIN public.users u ON u.id = e.user_id
  JOIN public.evaluation_templates t ON t.id = ea.template_id
 WHERE t.evaluation_type = 'quiz'
   AND ea.status IN ('pending', 'in_progress', 'authorized_late')
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id)
 ORDER BY t.title, e.full_name;

-- b) Examenes ya presentados cuya evidencia por pregunta se perdio (informativo;
--    conservan calificacion, estado y constancia).
SELECT t.title, ea.status, count(*) AS examenes_sin_respuestas,
       min(ea.submitted_at) AS primero, max(ea.submitted_at) AS ultimo
  FROM public.evaluation_assignments ea
  JOIN public.evaluation_templates t ON t.id = ea.template_id
 WHERE t.evaluation_type = 'quiz'
   AND ea.status IN ('submitted', 'grading', 'passed', 'failed')
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_responses r WHERE r.assignment_id = ea.id)
 GROUP BY t.title, ea.status
 ORDER BY t.title, ea.status;

-- c) Cuando se guardo por ultima vez cada cuestionario vs. cuando se presentaron
--    examenes (para ubicar el momento de la perdida).
SELECT t.id, t.title, t.updated_at AS plantilla_guardada,
       (SELECT min(q.created_at) FROM public.evaluation_questions q WHERE q.template_id = t.id) AS preguntas_creadas,
       (SELECT count(*) FROM public.evaluation_assignments a WHERE a.template_id = t.id) AS examenes
  FROM public.evaluation_templates t
 WHERE t.evaluation_type = 'quiz' AND t.status = 'published'
 ORDER BY t.updated_at DESC;

-- ------------------------------ 2) REPARACION --------------------------------
BEGIN;

DO $$
DECLARE
  r RECORD; v_fixed INT := 0;
BEGIN
  FOR r IN
    SELECT ea.id, ea.employee_id, t.id AS template_id, t.selection_mode, t.random_count, t.window_hours,
           (SELECT count(*) FROM public.evaluation_questions q WHERE q.template_id = t.id
              AND COALESCE((to_jsonb(q) ->> 'is_active')::boolean, TRUE)) AS banco
      FROM public.evaluation_assignments ea
      JOIN public.evaluation_templates t ON t.id = ea.template_id
     WHERE t.evaluation_type = 'quiz'
       AND ea.status IN ('pending', 'in_progress', 'authorized_late')
       AND NOT EXISTS (SELECT 1 FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id)
       AND NOT EXISTS (SELECT 1 FROM public.evaluation_responses rs WHERE rs.assignment_id = ea.id)
       FOR UPDATE OF ea
  LOOP
    IF r.banco = 0 THEN
      RAISE NOTICE 'Examen %: la plantilla % no tiene preguntas activas; se omite.', r.id, r.template_id;
      CONTINUE;
    END IF;
    IF r.selection_mode = 'random' AND COALESCE(r.random_count, 0) > 0 THEN
      INSERT INTO public.evaluation_assignment_questions (assignment_id, question_id, sort_order)
      SELECT r.id, sub.id, ROW_NUMBER() OVER () - 1
        FROM (SELECT q.id FROM public.evaluation_questions q
               WHERE q.template_id = r.template_id AND COALESCE((to_jsonb(q) ->> 'is_active')::boolean, TRUE)
               ORDER BY RANDOM() LIMIT r.random_count) sub;
    ELSE
      INSERT INTO public.evaluation_assignment_questions (assignment_id, question_id, sort_order)
      SELECT r.id, q.id, q.sort_order FROM public.evaluation_questions q
       WHERE q.template_id = r.template_id AND COALESCE((to_jsonb(q) ->> 'is_active')::boolean, TRUE)
       ORDER BY q.sort_order, q.id;
    END IF;
    UPDATE public.evaluation_assignments
       SET status = 'pending', started_at = NULL,
           available_at = NOW(), deadline_at = NOW() + make_interval(hours => r.window_hours),
           reminder_sent_at = NULL, late_requested_at = NULL, updated_at = NOW()
     WHERE id = r.id;
    v_fixed := v_fixed + 1;
  END LOOP;
  RAISE NOTICE 'Examenes regenerados: %', v_fixed;
END $$;

-- Verificacion: no debe quedar ningun examen abierto sin preguntas.
SELECT count(*) AS examenes_abiertos_sin_preguntas
  FROM public.evaluation_assignments ea
  JOIN public.evaluation_templates t ON t.id = ea.template_id
 WHERE t.evaluation_type = 'quiz'
   AND ea.status IN ('pending', 'in_progress', 'authorized_late')
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id);

COMMIT;
-- Si la verificacion no es 0 o algo no cuadra, sustituye COMMIT por ROLLBACK.
