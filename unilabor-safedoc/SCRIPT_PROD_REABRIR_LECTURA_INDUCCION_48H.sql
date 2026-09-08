-- =============================================================================
-- REABRIR LA LECTURA DE UNA FASE DE INDUCCION POR N HORAS (pgAdmin, prod)
-- =============================================================================
-- Caso: el limite de lectura de la fase vencio, el cron ya abrio el cuestionario
-- a los inscritos que no terminaron de leer (evaluacion "pending" sin iniciar) y
-- sus acuses en Sala de Lectura quedaron "expired". Se quiere darles N horas mas
-- de lectura y que el cuestionario se vuelva a abrir SOLO al terminar de leer
-- (o al vencer el nuevo limite), tal como esta disenado el programa.
--
-- Que hace, para cada inscrito de la fase con LECTURA INCOMPLETA:
--   1. Si tiene un cuestionario abierto que NUNCA inicio (pending, sin
--      started_at ni respuestas), lo desliga y lo elimina (con su snapshot de
--      preguntas). Los avisos ya enviados se conservan (solo se desligan).
--   2. Fija reading_deadline_at = NOW() + N horas en la inscripcion.
--   3. Reactiva sus acuses de Sala de Lectura con ese mismo limite:
--      expired -> read / in_progress / pending segun el avance que ya llevaban
--      (las paginas leidas y el tiempo acumulado NO se pierden).
--
-- NO toca: inscritos con lectura completa, ni evaluaciones ya iniciadas
-- (in_progress), reprobadas, aprobadas ni vencidas.
-- Despues: al firmar todo -> examen inmediato; al vencer -> el cron (*/10 min)
-- abre el examen con la ventana de la plantilla. Ni el script ni el sistema
-- mandan SMS por esta reapertura (politica: 1 SMS por fase).
--
-- USO: ajusta los dos parametros de abajo y ejecuta TODO el script.
--      Revisa primero el bloque "VISTA PREVIA" (solo consulta).
-- =============================================================================

-- ---------- PARAMETROS ----------
-- Numero de fase (1..6) y horas de reapertura.
--   :phase_number -> 1
--   :hours        -> 48

-- ============================ VISTA PREVIA ==================================
-- Inscritos que SERAN afectados: lectura incompleta y (sin examen, o examen
-- "pending" que nunca se inicio). Mismo criterio que el bloque de ejecucion.
-- Debe coincidir con los "pendientes de lectura" que ves en la fase.
SELECT e.id            AS enrollment_id,
       emp.employee_code,
       emp.full_name,
       e.reading_deadline_at  AS limite_actual,
       a.id            AS assignment_id,
       a.status        AS examen_status,
       CASE
         WHEN a.id IS NULL THEN 'sin examen: solo se reabre lectura'
         ELSE 'examen sin iniciar: se elimina y se reabre lectura'
       END AS accion,
       (SELECT count(*) FROM public.rh_induction_reading_items ri
          JOIN public.quality_reading_acknowledgements q ON q.id = ri.acknowledgement_id
         WHERE ri.enrollment_id = e.id AND q.status = 'signed') AS docs_firmados,
       (SELECT count(*) FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS docs_total
  FROM public.rh_induction_enrollments e
  JOIN public.rh_induction_phases p ON p.id = e.phase_id
  JOIN public.employees emp ON emp.id = e.employee_id
  LEFT JOIN public.evaluation_assignments a ON a.id = e.evaluation_assignment_id
 WHERE p.phase_number = 1                       -- <== :phase_number
   AND e.reading_completed_at IS NULL
   AND (a.id IS NULL OR (a.status = 'pending' AND a.started_at IS NULL
                         AND NOT EXISTS (SELECT 1 FROM public.evaluation_responses r WHERE r.assignment_id = a.id)))
 ORDER BY emp.full_name;

-- (Opcional) Inscritos con lectura incompleta que NO se tocan porque su examen
-- ya se inicio, se envio, se califico o vencio (in_progress, grading, passed,
-- failed, expired, authorized_late). Solo para conciliar contra la UI.
SELECT e.id AS enrollment_id, emp.employee_code, emp.full_name, a.id AS assignment_id, a.status AS examen_status, a.started_at
  FROM public.rh_induction_enrollments e
  JOIN public.rh_induction_phases p ON p.id = e.phase_id
  JOIN public.employees emp ON emp.id = e.employee_id
  JOIN public.evaluation_assignments a ON a.id = e.evaluation_assignment_id
 WHERE p.phase_number = 1                       -- <== :phase_number
   AND e.reading_completed_at IS NULL
   AND NOT (a.status = 'pending' AND a.started_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.evaluation_responses r WHERE r.assignment_id = a.id))
 ORDER BY a.status, emp.full_name;

-- ============================ EJECUCION =====================================
BEGIN;

-- Inscritos objetivo: lectura incompleta y (sin examen o examen pending sin iniciar).
CREATE TEMP TABLE tmp_reopen ON COMMIT DROP AS
SELECT e.id AS enrollment_id,
       e.evaluation_assignment_id AS assignment_id
  FROM public.rh_induction_enrollments e
  JOIN public.rh_induction_phases p ON p.id = e.phase_id
  LEFT JOIN public.evaluation_assignments a ON a.id = e.evaluation_assignment_id
 WHERE p.phase_number = 1                       -- <== :phase_number
   AND e.reading_completed_at IS NULL
   AND (a.id IS NULL OR (a.status = 'pending' AND a.started_at IS NULL
                         AND NOT EXISTS (SELECT 1 FROM public.evaluation_responses r WHERE r.assignment_id = a.id)));

-- 1) Desligar y eliminar el examen abierto que nunca se inicio.
--    Se bloquean las filas y se re-evalua el estado dentro de la transaccion:
--    si el colaborador abrio el examen justo ahora (started_at), se conserva
--    ese examen con su snapshot y se le respeta el intento.
CREATE TEMP TABLE tmp_del ON COMMIT DROP AS
SELECT a.id AS assignment_id
  FROM public.evaluation_assignments a
  JOIN tmp_reopen t ON t.assignment_id = a.id
 WHERE a.status = 'pending' AND a.started_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.evaluation_responses r WHERE r.assignment_id = a.id)
   FOR UPDATE OF a;

-- Los que ya se iniciaron mientras tanto salen del alcance (ni lectura ni examen se tocan).
DELETE FROM tmp_reopen t
 WHERE t.assignment_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM tmp_del d WHERE d.assignment_id = t.assignment_id);

UPDATE public.rh_induction_enrollments e
   SET evaluation_assignment_id = NULL, updated_at = NOW()
  FROM tmp_del d
 WHERE e.evaluation_assignment_id = d.assignment_id;

UPDATE public.notification_log SET assignment_id = NULL
 WHERE assignment_id IN (SELECT assignment_id FROM tmp_del);

DELETE FROM public.evaluation_assignment_questions
 WHERE assignment_id IN (SELECT assignment_id FROM tmp_del);

DELETE FROM public.evaluation_assignments
 WHERE id IN (SELECT assignment_id FROM tmp_del);

-- 2) Nuevo limite de lectura en la inscripcion.
UPDATE public.rh_induction_enrollments e
   SET reading_deadline_at = NOW() + make_interval(hours => 48),   -- <== :hours
       updated_at = NOW()
  FROM tmp_reopen t
 WHERE e.id = t.enrollment_id;

-- 3) Reactivar los acuses de Sala de Lectura con el mismo limite.
UPDATE public.quality_reading_acknowledgements q
   SET deadline_at = e.reading_deadline_at,
       status = CASE
                  WHEN q.status = 'expired' AND q.read_completed_at IS NOT NULL THEN 'read'
                  WHEN q.status = 'expired' AND q.started_at IS NOT NULL THEN 'in_progress'
                  WHEN q.status = 'expired' THEN 'pending'
                  ELSE q.status
                END,
       updated_at = NOW()
  FROM public.rh_induction_reading_items ri
  JOIN public.rh_induction_enrollments e ON e.id = ri.enrollment_id
  JOIN tmp_reopen t ON t.enrollment_id = e.id
 WHERE q.id = ri.acknowledgement_id
   AND q.status IN ('pending', 'in_progress', 'read', 'expired');

-- Resumen de lo aplicado.
SELECT (SELECT count(*) FROM tmp_reopen)                                   AS inscritos_reabiertos,
       (SELECT count(*) FROM tmp_reopen WHERE assignment_id IS NOT NULL)   AS examenes_eliminados,
       (SELECT min(e.reading_deadline_at) FROM public.rh_induction_enrollments e JOIN tmp_reopen t ON t.enrollment_id = e.id) AS nuevo_limite,
       (SELECT count(*) FROM public.rh_induction_reading_items ri JOIN tmp_reopen t ON t.enrollment_id = ri.enrollment_id
          JOIN public.quality_reading_acknowledgements q ON q.id = ri.acknowledgement_id WHERE q.status <> 'expired') AS acuses_reactivados,
       (SELECT count(*) FROM public.rh_induction_reading_items ri JOIN tmp_reopen t ON t.enrollment_id = ri.enrollment_id
          JOIN public.quality_reading_acknowledgements q ON q.id = ri.acknowledgement_id WHERE q.status = 'expired') AS acuses_aun_vencidos;

COMMIT;
-- Si el resumen no es el esperado, sustituye COMMIT por ROLLBACK y revisa.
