-- =============================================================================
-- Induccion Fases 5 y 6: configuracion automatica (sin decisiones pendientes)
-- Requiere haber corrido antes SCRIPT_20261001_INDUCCION_FASES_5_6_PUESTOS_FIRMAS.sql
-- (puestos habilitados en las fases).
--
--   1. Checklist de cada fase, textual del REH-REG-005 (hoja INDUCCION):
--        Fase 5: 8 puntos. Fase 6: 5 puntos.
--      Solo si la fase todavia no tiene checklist (no pisa lo que capture RH).
--   2. "Completar checklist al aprobar" = activado (igual que Fases 1-4).
--   3. Etiqueta del responsable = "Responsable del area analitica o puesto"
--      (REH-REG-005), solo si sigue la etiqueta por defecto "Coordinador de area".
--   4. Fase 6: una evaluacion PRACTICA publicada por puesto habilitado
--      (aprobatoria 80 = 8/10), con las competencias tecnicas del puesto en las
--      instrucciones como guia del supervisor.
--   5. Fase 5: un CUESTIONARIO en BORRADOR por puesto habilitado, con la
--      configuracion de la Fase 4 (80 %, ventana 24 h, 30 min, 10 al azar).
--      Sin preguntas: RH las agrega (banco IA del puesto) y lo publica.
--   4 y 5 solo se crean si el curso del puesto no tiene ya una evaluacion
--   activa de ese tipo (no pisa lo que haya disenado RH).
--
-- NO publica fases, NO cambia duracion / limite de lectura / nombre o telefono
-- del responsable / descanso entre fases.
--
-- Seguridad: UNA transaccion; valida y aborta si algo no cuadra. Solo INSERT
-- y UPDATE condicionales => re-ejecutable sin duplicar.
-- Ejecutar completo: psql -v ON_ERROR_STOP=1 -f <archivo>  (o pgAdmin).
-- Ensayo sin cambios: sustituir el COMMIT final por ROLLBACK.
-- Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE _checklist (
  fase       INT  NOT NULL,
  orden      INT  NOT NULL,
  texto      TEXT NOT NULL,
  PRIMARY KEY (fase, orden)
) ON COMMIT DROP;

INSERT INTO _checklist (fase, orden, texto) VALUES
  (5, 1, 'Descripción del puesto en el área de trabajo'),
  (5, 2, 'Revisión de procedimientos normalizados (PNO) o técnicos'),
  (5, 3, 'Manejo de equipos'),
  (5, 4, 'Reactivos y materiales'),
  (5, 5, 'Control de calidad y aseguramiento de la calidad'),
  (5, 6, 'Gestión de resultados'),
  (5, 7, 'Identificación y manejo de errores'),
  (5, 8, 'Práctica supervisada inicial'),
  (6, 1, 'Actividades reales del puesto'),
  (6, 2, 'Supervisión directa'),
  (6, 3, 'Retroalimentación'),
  (6, 4, 'Simulación de fallos'),
  (6, 5, 'Acciones correctivas y mejora');

-- Configuracion del cuestionario de la Fase 4 (plantilla vigente) -------------
CREATE TEMP TABLE _quiz_f4 ON COMMIT DROP AS
SELECT t.passing_score, t.window_hours, t.attempt_time_limit_minutes, t.selection_mode, t.random_count
  FROM public.rh_induction_phases p
  JOIN public.evaluation_templates t ON t.training_course_id = p.training_course_id
 WHERE p.phase_number = 4 AND t.evaluation_type = 'quiz'
   AND t.status = 'published' AND t.is_active = TRUE
 ORDER BY t.id DESC
 LIMIT 1;

-- Puestos habilitados en Fases 5 y 6 con su curso -----------------------------
CREATE TEMP TABLE _cursos ON COMMIT DROP AS
SELECT ph.phase_number, rp.id AS position_id, rp.code AS position_code, rp.name AS position_name,
       pp.training_course_id AS course_id
  FROM public.rh_induction_phase_positions pp
  JOIN public.rh_induction_phases ph ON ph.id = pp.phase_id
  JOIN public.rh_positions rp ON rp.id = pp.position_id
 WHERE ph.phase_number IN (5, 6) AND ph.scope = 'POSITION';

-- Validaciones ----------------------------------------------------------------
DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.rh_induction_phases
   WHERE phase_number IN (5, 6) AND scope = 'POSITION';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'No se encontraron las Fases 5 y 6 con alcance POSITION.';
  END IF;

  SELECT count(*) INTO v_n FROM _quiz_f4;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'No se encontro el cuestionario publicado de la Fase 4 para copiar su configuracion.';
  END IF;

  SELECT count(*) INTO v_n FROM _cursos;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No hay puestos habilitados en Fases 5/6; corre primero SCRIPT_20261001_INDUCCION_FASES_5_6_PUESTOS_FIRMAS.sql.';
  END IF;
END $$;

-- 1. Checklist ---------------------------------------------------------------
CREATE TEMP TABLE _fases_sin_checklist ON COMMIT DROP AS
SELECT ph.id AS phase_id, ph.phase_number
  FROM public.rh_induction_phases ph
 WHERE ph.phase_number IN (5, 6)
   AND NOT EXISTS (SELECT 1 FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = ph.id);

INSERT INTO public.rh_induction_phase_checklist_items (phase_id, item_text, sort_order)
SELECT f.phase_id, c.texto, c.orden
  FROM _fases_sin_checklist f
  JOIN _checklist c ON c.fase = f.phase_number
 ORDER BY f.phase_number, c.orden;

-- 2 y 3. Ajustes de la fase --------------------------------------------------
CREATE TEMP TABLE _fases_ajustadas ON COMMIT DROP AS
SELECT id, phase_number FROM public.rh_induction_phases
 WHERE phase_number IN (5, 6)
   AND (auto_complete_checklist_on_pass = FALSE OR responsible_label = 'Coordinador de area');

UPDATE public.rh_induction_phases
   SET auto_complete_checklist_on_pass = TRUE,
       responsible_label = CASE WHEN responsible_label = 'Coordinador de area'
                                THEN 'Responsable del área analítica o puesto'
                                ELSE responsible_label END,
       updated_at = NOW()
 WHERE id IN (SELECT id FROM _fases_ajustadas);

-- 4. Fase 6: evaluacion practica publicada por puesto ------------------------
CREATE TEMP TABLE _practicas ON COMMIT DROP AS
SELECT c.course_id, c.position_id, c.position_name
  FROM _cursos c
 WHERE c.phase_number = 6
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_templates t
                    WHERE t.training_course_id = c.course_id AND t.is_active = TRUE
                      AND t.evaluation_type = 'practical');

INSERT INTO public.evaluation_templates
       (training_course_id, title, instructions, passing_score, selection_mode, random_count,
        status, is_active, evaluation_type, created_by_user_id)
SELECT p.course_id,
       'Fase 6 - Práctica supervisada — ' || p.position_name,
       'Evaluación práctica supervisada del puesto ' || p.position_name || ' (Fase 6, REH-REG-005).' || E'\n' ||
       'El responsable del área analítica o puesto observa al colaborador en actividades reales del puesto y ' ||
       'RH captura una calificación de 0 a 10 (aprobatoria: 8, equivalente a 80 %).' ||
       COALESCE(E'\n\nCompetencias técnicas del puesto a observar (criticidad A alta, M media, B baja):\n' ||
         (SELECT string_agg('- [' || pc.criticality || '] ' || pc.competency_text, E'\n'
                            ORDER BY CASE pc.criticality WHEN 'A' THEN 1 WHEN 'M' THEN 2 ELSE 3 END,
                                     pc.competency_text)
            FROM public.rh_position_competencies pc
           WHERE pc.position_id = p.position_id), ''),
       80, 'all', NULL, 'published', TRUE, 'practical',
       (SELECT id FROM public.users WHERE lower(email) = 'admin@unilabor.mx' LIMIT 1)
  FROM _practicas p;

-- 5. Fase 5: cuestionario en borrador por puesto -----------------------------
CREATE TEMP TABLE _cuestionarios ON COMMIT DROP AS
SELECT c.course_id, c.position_name
  FROM _cursos c
 WHERE c.phase_number = 5
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_templates t
                    WHERE t.training_course_id = c.course_id AND t.is_active = TRUE
                      AND t.evaluation_type = 'quiz');

INSERT INTO public.evaluation_templates
       (training_course_id, title, instructions, passing_score, window_hours, selection_mode, random_count,
        attempt_time_limit_minutes, status, is_active, evaluation_type, created_by_user_id)
SELECT q.course_id,
       'Fase 5 - Inducción técnica del puesto — ' || q.position_name,
       'Lee cada pregunta y selecciona la o las respuestas correctas, según el tipo de pregunta.' || E'\n' ||
       'El examen es individual y deberás obtener un mínimo de ' || f.passing_score || '% para aprobar la fase; ' ||
       'dispones de ' || COALESCE(f.attempt_time_limit_minutes::TEXT || ' minutos', 'tiempo libre') ||
       ' para concluirlo y, una vez iniciada la evaluación, debes terminarla en ese momento.' || E'\n' ||
       'Si obtienes una calificación menor, deberás recibir capacitación complementaria y presentar una reevaluación.' || E'\n' ||
       'Cualquier falla de la plataforma deberá notificarse de inmediato a la Coordinación de Recursos Humanos.',
       f.passing_score, f.window_hours, f.selection_mode, f.random_count,
       f.attempt_time_limit_minutes, 'draft', TRUE, 'quiz',
       (SELECT id FROM public.users WHERE lower(email) = 'admin@unilabor.mx' LIMIT 1)
  FROM _cuestionarios q
  CROSS JOIN _quiz_f4 f;

-- Reporte ---------------------------------------------------------------------
SELECT 'Fases que recibieron checklist' AS concepto, count(*)::TEXT AS valor FROM _fases_sin_checklist
UNION ALL SELECT 'Fases ajustadas (checklist al aprobar / etiqueta)', count(*)::TEXT FROM _fases_ajustadas
UNION ALL SELECT 'Practicas Fase 6 creadas (publicadas)', count(*)::TEXT FROM _practicas
UNION ALL SELECT 'Cuestionarios Fase 5 creados (borrador)', count(*)::TEXT FROM _cuestionarios;

SELECT ph.phase_number AS fase, ph.responsible_label, ph.auto_complete_checklist_on_pass AS checklist_al_aprobar,
       (SELECT count(*) FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = ph.id) AS puntos_checklist
  FROM public.rh_induction_phases ph
 WHERE ph.phase_number IN (5, 6)
 ORDER BY 1;

SELECT c.phase_number AS fase, c.position_code AS puesto,
       (SELECT string_agg(t.evaluation_type || ':' || t.status, ', ' ORDER BY t.id)
          FROM public.evaluation_templates t
         WHERE t.training_course_id = c.course_id AND t.is_active = TRUE) AS evaluaciones,
       (SELECT count(*) FROM public.rh_position_competencies pc WHERE pc.position_id = c.position_id) AS competencias
  FROM _cursos c
 ORDER BY c.phase_number, c.position_code;

COMMIT;
