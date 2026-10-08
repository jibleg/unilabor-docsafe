-- =============================================================================
-- Induccion Fases 5 y 6: habilitar los puestos que faltan (ruta por puesto).
--
-- Decision RH (2026-10-07): con la ruta por puesto, cada puesto activo de un
-- colaborador cursa su Fase 5/6/7; los puestos aun no habilitados se activan
-- para que quien los tiene pueda concluirlos.
--
-- Por DATOS (re-ejecutable, idempotente):
--   Fase 5: puestos activos con >=1 colaborador activo y >=1 documento VIGENTE,
--           aun sin habilitar en la Fase 5.
--   Fase 6: puestos activos con >=1 colaborador activo, aun sin habilitar en la 6.
-- Igual que "Habilitar puesto" de la UI: curso INDUCCION-FASE-{5|6}-{CODIGO} +
-- puente rh_induction_phase_positions. Ademas, como el script del 2026-10-01:
--   * constancia: plantilla + firmas COPIADAS de un puesto ya habilitado en la
--     misma fase (asi salen iguales a las que RH configuro);
--   * Fase 6: practica publicada (80) con las competencias del puesto;
--   * Fase 5: cuestionario en BORRADOR con la config de los demas puestos; sus
--     preguntas las genera generate-phase5-question-banks (plan/generate/load),
--     que lo publica.
-- NO toca puestos ya habilitados, evaluaciones existentes ni firmas capturadas.
-- Ensayo sin cambios: sustituir el COMMIT final por ROLLBACK.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE _actor ON COMMIT DROP AS
SELECT id FROM public.users WHERE lower(email) = 'admin@unilabor.mx' LIMIT 1;

CREATE TEMP TABLE _objetivo ON COMMIT DROP AS
SELECT ph.id AS phase_id, ph.phase_number, ph.name AS phase_name,
       rp.id AS position_id, rp.code AS position_code, rp.name AS position_name,
       'INDUCCION-FASE-' || ph.phase_number || '-' || upper(rp.code) AS course_code
  FROM public.rh_positions rp
  JOIN public.rh_induction_phases ph ON ph.scope = 'POSITION' AND ph.phase_number IN (5, 6)
 WHERE rp.is_active = TRUE
   AND EXISTS (SELECT 1 FROM public.rh_employee_positions ep
                 JOIN public.employees e ON e.id = ep.employee_id AND e.is_active = TRUE
                WHERE ep.position_id = rp.id AND ep.is_active = TRUE)
   AND (ph.phase_number = 6 OR EXISTS (
         SELECT 1 FROM public.rh_position_documents pd
           JOIN public.documents d ON d.id = pd.document_id AND d.status = 'active'
          WHERE pd.position_id = rp.id))
   AND NOT EXISTS (SELECT 1 FROM public.rh_induction_phase_positions pp
                    WHERE pp.phase_id = ph.id AND pp.position_id = rp.id);

-- Constancia modelo por fase: la de un puesto ya habilitado con firmas (el que mas firmas tenga).
CREATE TEMP TABLE _modelo ON COMMIT DROP AS
SELECT DISTINCT ON (ph.phase_number) ph.phase_number, ct.id AS template_id, ct.logo_path, ct.orientation, ct.show_folio
  FROM public.rh_induction_phase_positions pp
  JOIN public.rh_induction_phases ph ON ph.id = pp.phase_id AND ph.phase_number IN (5, 6)
  JOIN public.certificate_templates ct ON ct.training_course_id = pp.training_course_id
 ORDER BY ph.phase_number,
          (SELECT count(*) FROM public.certificate_template_signatures s WHERE s.certificate_template_id = ct.id) DESC,
          ct.id ASC;

-- Cuestionario modelo de la Fase 5 (config de los demas puestos).
CREATE TEMP TABLE _quiz_modelo ON COMMIT DROP AS
SELECT t.passing_score, t.window_hours, t.instructions
  FROM public.rh_induction_phase_positions pp
  JOIN public.rh_induction_phases ph ON ph.id = pp.phase_id AND ph.phase_number = 5
  JOIN public.evaluation_templates t ON t.training_course_id = pp.training_course_id
                                    AND t.evaluation_type = 'quiz' AND t.is_active AND t.status = 'published'
 ORDER BY t.id ASC
 LIMIT 1;

DO $$
BEGIN
  IF (SELECT count(*) FROM _actor) <> 1 THEN
    RAISE EXCEPTION 'No existe la cuenta admin@unilabor.mx (actor del script).';
  END IF;
  IF (SELECT count(*) FROM _modelo) <> 2 THEN
    RAISE EXCEPTION 'No se encontro una constancia modelo con firmas en las Fases 5 y 6.';
  END IF;
  IF (SELECT count(*) FROM _quiz_modelo) <> 1 THEN
    RAISE EXCEPTION 'No se encontro un cuestionario publicado de la Fase 5 para copiar su configuracion.';
  END IF;
END $$;

-- Cursos + puente (mismo titulo/descripcion que enablePhaseForPosition).
INSERT INTO public.training_courses (code, title, description, certificate_validity_months)
SELECT o.course_code,
       'Fase ' || o.phase_number || ' - ' || o.phase_name || ' — ' || o.position_name,
       CASE WHEN o.phase_number = 5
            THEN 'Induccion tecnica del puesto ' || o.position_name || ': lectura de sus documentos obligatorios + cuestionario.'
            ELSE 'Capacitacion practica supervisada del puesto ' || o.position_name || ': RH captura la calificacion (0-10).'
       END,
       0
  FROM _objetivo o
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.rh_induction_phase_positions (phase_id, position_id, training_course_id, created_by_user_id)
SELECT o.phase_id, o.position_id, tc.id, (SELECT id FROM _actor)
  FROM _objetivo o
  JOIN public.training_courses tc ON tc.code = o.course_code
ON CONFLICT (phase_id, position_id) DO NOTHING;

CREATE TEMP TABLE _cursos ON COMMIT DROP AS
SELECT o.phase_number, o.phase_name, o.position_id, o.position_code, o.position_name, pp.training_course_id AS course_id
  FROM _objetivo o
  JOIN public.rh_induction_phase_positions pp ON pp.phase_id = o.phase_id AND pp.position_id = o.position_id;

-- Constancia: plantilla + firmas copiadas del modelo de su fase (solo si aun no tiene).
INSERT INTO public.certificate_templates (training_course_id, title_text, logo_path, orientation, show_folio)
SELECT c.course_id, 'Fase ' || c.phase_number || ' - ' || c.phase_name, m.logo_path, m.orientation, m.show_folio
  FROM _cursos c
  JOIN _modelo m ON m.phase_number = c.phase_number
ON CONFLICT (training_course_id) DO NOTHING;

INSERT INTO public.certificate_template_signatures
       (certificate_template_id, signatory_name, role, signature_image_path, sort_order)
SELECT ct.id, s.signatory_name, s.role, s.signature_image_path, s.sort_order
  FROM _cursos c
  JOIN public.certificate_templates ct ON ct.training_course_id = c.course_id
  JOIN _modelo m ON m.phase_number = c.phase_number
  JOIN public.certificate_template_signatures s ON s.certificate_template_id = m.template_id
 WHERE NOT EXISTS (SELECT 1 FROM public.certificate_template_signatures x WHERE x.certificate_template_id = ct.id);

-- Fase 6: practica publicada con las competencias del puesto.
INSERT INTO public.evaluation_templates
       (training_course_id, title, instructions, passing_score, selection_mode, random_count,
        status, is_active, evaluation_type, created_by_user_id)
SELECT c.course_id,
       'Fase 6 - Práctica supervisada — ' || c.position_name,
       'Evaluación práctica supervisada del puesto ' || c.position_name || ' (Fase 6, REH-REG-005).' || E'\n' ||
       'El responsable del área analítica o puesto observa al colaborador en actividades reales del puesto y ' ||
       'RH captura una calificación de 0 a 10 (aprobatoria: 8, equivalente a 80 %).' ||
       COALESCE(E'\n\nCompetencias técnicas del puesto a observar (criticidad A alta, M media, B baja):\n' ||
         (SELECT string_agg('- [' || pc.criticality || '] ' || pc.competency_text, E'\n'
                            ORDER BY CASE pc.criticality WHEN 'A' THEN 1 WHEN 'M' THEN 2 ELSE 3 END, pc.competency_text)
            FROM public.rh_position_competencies pc WHERE pc.position_id = c.position_id), ''),
       80, 'all', NULL, 'published', TRUE, 'practical', (SELECT id FROM _actor)
  FROM _cursos c
 WHERE c.phase_number = 6
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_templates t
                    WHERE t.training_course_id = c.course_id AND t.is_active AND t.evaluation_type = 'practical');

-- Fase 5: cuestionario en borrador (sus preguntas las genera el script del banco y lo publica).
INSERT INTO public.evaluation_templates
       (training_course_id, title, instructions, passing_score, window_hours, selection_mode, random_count,
        attempt_time_limit_minutes, status, is_active, evaluation_type, created_by_user_id)
SELECT c.course_id, 'Fase 5 - Inducción técnica del puesto — ' || c.position_name,
       q.instructions, q.passing_score, q.window_hours, 'all', NULL, NULL, 'draft', TRUE, 'quiz', (SELECT id FROM _actor)
  FROM _cursos c
  CROSS JOIN _quiz_modelo q
 WHERE c.phase_number = 5
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_templates t
                    WHERE t.training_course_id = c.course_id AND t.is_active AND t.evaluation_type = 'quiz');

-- Reporte ---------------------------------------------------------------------
SELECT c.phase_number AS fase, c.position_code AS puesto,
       (SELECT count(*) FROM public.certificate_template_signatures s
          JOIN public.certificate_templates ct ON ct.id = s.certificate_template_id
         WHERE ct.training_course_id = c.course_id) AS firmas,
       (SELECT string_agg(t.evaluation_type || ':' || t.status, ', ')
          FROM public.evaluation_templates t WHERE t.training_course_id = c.course_id AND t.is_active) AS evaluacion,
       (SELECT count(*) FROM public.rh_position_documents pd JOIN public.documents d ON d.id = pd.document_id AND d.status = 'active'
         WHERE pd.position_id = c.position_id) AS documentos
  FROM _cursos c
 ORDER BY c.phase_number, c.position_code;

COMMIT;
