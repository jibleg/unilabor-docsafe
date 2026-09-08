-- =============================================================================
-- CERRAR MANUALMENTE EVALUACIONES EN "CALIFICACION" SIN RESPUESTAS (pgAdmin, prod)
-- =============================================================================
-- Caso 2026-09-08: dos evaluaciones de Induccion Fase 1 quedaron en estado
-- "grading" (tenian preguntas abiertas) pero sus respuestas se perdieron por el
-- bug de guardado del cuestionario, asi que el modal "Calificar evaluacion" no
-- muestra nada y RH no puede cerrarlas. RH ya determino el resultado:
--   b_oscar_ivan@unilabor.mx      -> ACREDITADA
--   b_santiago_cruz@unilabor.mx   -> NO ACREDITADA
--
-- Como quedan los numeros: la asignacion conserva score (puntos de las preguntas
-- de opcion, calificadas automaticamente al enviar) y max_score (total). Las
-- abiertas ya no tienen respuesta, asi que RH declara aqui cuantos puntos les
-- otorga (open_points): el puntaje final = score + open_points y el porcentaje
-- se recalcula con max_score. El script EXIGE coherencia: ACREDITADA solo si el
-- porcentaje final alcanza la calificacion minima de la plantilla; NO
-- ACREDITADA solo si no la alcanza. Si no cuadra, no cambia nada y avisa.
--
-- Lo que NO hace: no genera la constancia PDF de la acreditada (la emite el
-- backend; se reemite despues) ni envia SMS/correo. Deja constancia en
-- access_logs (auditoria RH) con la nota capturada.
-- USO: revisa/ajusta el PASO 0 (open_points por persona) y ejecuta TODO.
-- =============================================================================

-- ---------------------------- PASO 0 ----------------------------------------
DROP TABLE IF EXISTS zz_close_target;
CREATE TEMP TABLE zz_close_target (email TEXT, phase_number INT, decision TEXT, open_points INT, note TEXT);
INSERT INTO zz_close_target VALUES
  ('b_oscar_ivan@unilabor.mx',    1, 'ACREDITADA',    NULL, 'Cierre manual RH 2026-09-08: respuestas abiertas perdidas por incidente de guardado del cuestionario; RH determina ACREDITADA.'),
  ('b_santiago_cruz@unilabor.mx', 1, 'NO ACREDITADA', 0,    'Cierre manual RH 2026-09-08: respuestas abiertas perdidas por incidente de guardado del cuestionario; RH determina NO ACREDITADA.');
-- open_points NULL en ACREDITADA = otorgar todos los puntos de las abiertas
-- (max_score - score). Si prefieres un valor exacto, capturalo.

-- ---------------------------- DIAGNOSTICO -----------------------------------
SELECT tg.email, tg.decision, e.full_name, ea.id AS assignment_id, ea.status, ea.score, ea.max_score,
       ROUND(ea.score::numeric * 100 / NULLIF(ea.max_score, 0), 2) AS pct_parcial,
       t.passing_score,
       (SELECT count(*) FROM public.evaluation_responses r WHERE r.assignment_id = ea.id) AS respuestas,
       ea.submitted_at, ea.certificate_document_id
  FROM zz_close_target tg
  JOIN public.users u ON LOWER(u.email) = LOWER(tg.email)
  JOIN public.employees e ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph ON ph.id = en.phase_id AND ph.phase_number = tg.phase_number
  JOIN public.evaluation_assignments ea ON ea.id = en.evaluation_assignment_id
  JOIN public.evaluation_templates t ON t.id = ea.template_id
 ORDER BY tg.email;

-- ---------------------------- CIERRE ----------------------------------------
BEGIN;

DO $$
DECLARE
  tg RECORD; v RECORD;
  v_open INT; v_score INT; v_pct NUMERIC; v_status TEXT; v_admin UUID;
BEGIN
  -- Usuario que firma la auditoria: la cuenta de RH (ajusta el correo si aplica).
  SELECT id INTO v_admin FROM public.users WHERE LOWER(email) = 'recursos.humanos@unilabor.mx' LIMIT 1;

  FOR tg IN SELECT * FROM zz_close_target LOOP
    SELECT ea.id, ea.status, ea.score, ea.max_score, t.passing_score, e.id AS employee_id, e.full_name,
           (SELECT count(*) FROM public.evaluation_responses r WHERE r.assignment_id = ea.id) AS respuestas
      INTO v
      FROM public.users u
      JOIN public.employees e ON e.user_id = u.id
      JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
      JOIN public.rh_induction_phases ph ON ph.id = en.phase_id AND ph.phase_number = tg.phase_number
      JOIN public.evaluation_assignments ea ON ea.id = en.evaluation_assignment_id
      JOIN public.evaluation_templates t ON t.id = ea.template_id
     WHERE LOWER(u.email) = LOWER(tg.email)
     FOR UPDATE OF ea;

    IF v.id IS NULL THEN
      RAISE EXCEPTION '% : no se encontro evaluacion ligada a su inscripcion de la fase %.', tg.email, tg.phase_number;
    END IF;
    IF v.status <> 'grading' THEN
      RAISE EXCEPTION '% : la evaluacion % esta en estado "%" (se esperaba grading). No se modifico nada.', tg.email, v.id, v.status;
    END IF;
    IF v.respuestas > 0 THEN
      RAISE EXCEPTION '% : la evaluacion % SI tiene % respuesta(s); califiquenla desde la pantalla, no con este script.', tg.email, v.id, v.respuestas;
    END IF;
    IF COALESCE(v.max_score, 0) <= 0 THEN
      RAISE EXCEPTION '% : la evaluacion % no tiene max_score; no se puede calcular el porcentaje.', tg.email, v.id;
    END IF;

    v_open := COALESCE(tg.open_points, CASE WHEN tg.decision = 'ACREDITADA' THEN v.max_score - COALESCE(v.score, 0) ELSE 0 END);
    IF v_open < 0 OR COALESCE(v.score, 0) + v_open > v.max_score THEN
      RAISE EXCEPTION '% : open_points=% fuera de rango (score % / max %).', tg.email, v_open, v.score, v.max_score;
    END IF;
    v_score := COALESCE(v.score, 0) + v_open;
    v_pct := ROUND(v_score::numeric * 100 / v.max_score, 2);
    v_status := CASE WHEN tg.decision = 'ACREDITADA' THEN 'passed' WHEN tg.decision = 'NO ACREDITADA' THEN 'failed' ELSE NULL END;
    IF v_status IS NULL THEN
      RAISE EXCEPTION '% : decision "%" invalida (ACREDITADA / NO ACREDITADA).', tg.email, tg.decision;
    END IF;
    IF v_status = 'passed' AND v_pct < v.passing_score THEN
      RAISE EXCEPTION '% : con % puntos de abiertas el porcentaje es % %% y la minima es % %%; ajusta open_points.', tg.email, v_open, v_pct, v.passing_score;
    END IF;
    IF v_status = 'failed' AND v_pct >= v.passing_score THEN
      RAISE EXCEPTION '% : con % puntos de abiertas el porcentaje es % %% (>= minima % %%); no puede quedar NO ACREDITADA. Ajusta open_points.', tg.email, v_open, v_pct, v.passing_score;
    END IF;

    UPDATE public.evaluation_assignments
       SET status = v_status, score = v_score, percentage = v_pct, graded_at = NOW(), updated_at = NOW()
     WHERE id = v.id;

    INSERT INTO public.access_logs (user_id, action, module_code, entity_type, entity_id, employee_id, accessed_at, metadata)
    VALUES (v_admin, 'RH_EVAL_MANUAL_CLOSE:' || v.id, 'RH', 'evaluation_assignment', v.id, v.employee_id, NOW(),
            jsonb_build_object('decision', tg.decision, 'status', v_status, 'score', v_score, 'max_score', v.max_score,
                               'percentage', v_pct, 'open_points_awarded', v_open, 'note', tg.note, 'via', 'pgAdmin script 2026-09-08'));

    RAISE NOTICE '% (%): evaluacion % -> % con %/% = % %%.', v.full_name, tg.email, v.id, v_status, v_score, v.max_score, v_pct;
  END LOOP;
END $$;

-- Verificacion.
SELECT tg.email, ea.id AS assignment_id, ea.status, ea.score, ea.max_score, ea.percentage, ea.graded_at
  FROM zz_close_target tg
  JOIN public.users u ON LOWER(u.email) = LOWER(tg.email)
  JOIN public.employees e ON e.user_id = u.id
  JOIN public.rh_induction_enrollments en ON en.employee_id = e.id
  JOIN public.rh_induction_phases ph ON ph.id = en.phase_id AND ph.phase_number = tg.phase_number
  JOIN public.evaluation_assignments ea ON ea.id = en.evaluation_assignment_id
 ORDER BY tg.email;

COMMIT;
-- Si la verificacion no es la esperada, sustituye COMMIT por ROLLBACK.
--
-- DESPUES: (1) Oscar queda con Fase 1 aprobada en Induccion pero SIN constancia
-- PDF (se reemite desde el backend una vez desplegado el fix); (2) Santiago
-- queda NO ACREDITADO y en Fases de induccion aparece el boton "Autorizar
-- nuevo intento" para que presente de nuevo cuando RH lo decida.
