-- =============================================================================
-- Verificacion (solo lectura) de SCRIPT_PROD_20260930_BORRADORES_COMPETENCIA_LISTADO.sql
-- Ejecutar cada consulta por separado en pgAdmin (seleccionarla + F5).
-- =============================================================================

-- A) ANTES: las 4 plantillas deben existir en DRAFT y con competencias capturadas.
SELECT ev.id, p.name AS puesto, e.full_name, ev.status,
       count(*) FILTER (WHERE i.section = 'COMPETENCIA') AS competencias,
       count(*) FILTER (WHERE i.section = 'COMPETENCIA' AND i.method IS NOT NULL) AS con_metodo,
       count(*) FILTER (WHERE i.section = 'DESEMPENO' AND i.observations IS NOT NULL) AS desempeno_con_obs
  FROM public.rh_competency_evaluations ev
  JOIN public.rh_positions p ON p.id = ev.position_id
  JOIN public.employees e ON e.id = ev.employee_id
  LEFT JOIN public.rh_competency_evaluation_items i ON i.evaluation_id = ev.id
 GROUP BY ev.id, p.name, e.full_name, ev.status
 ORDER BY ev.id;

-- B) DESPUES: borradores creados por el script (esperado: 27 filas si prod no cambio).
SELECT ev.id, e.full_name, p.name AS puesto, ev.evaluator_name, ev.status, ev.evaluation_date,
       (a.metadata ->> 'plantilla_evaluation_id') AS plantilla,
       count(i.id) FILTER (WHERE i.section = 'COMPETENCIA') AS competencias,
       count(i.id) FILTER (WHERE i.section = 'DESEMPENO') AS desempeno,
       count(i.id) FILTER (WHERE i.score IS NOT NULL) AS calificados
  FROM public.access_logs a
  JOIN public.rh_competency_evaluations ev ON ev.id = a.entity_id
  JOIN public.employees e ON e.id = ev.employee_id
  JOIN public.rh_positions p ON p.id = ev.position_id
  LEFT JOIN public.rh_competency_evaluation_items i ON i.evaluation_id = ev.id
 WHERE a.action LIKE 'RH_COMP_EVAL_CREATE:%'
   AND a.metadata ->> 'origen' LIKE 'Carga de borradores desde Listado.xlsx%'
 GROUP BY ev.id, e.full_name, p.name, ev.evaluator_name, ev.status, ev.evaluation_date, a.metadata
 ORDER BY ev.id;

-- C) DESPUES: diferencias contra la plantilla (esperado: 0 y 0).
WITH nuevos AS (
  SELECT a.entity_id AS id, (a.metadata ->> 'plantilla_evaluation_id')::bigint AS tpl
    FROM public.access_logs a
   WHERE a.action LIKE 'RH_COMP_EVAL_CREATE:%'
     AND a.metadata ->> 'origen' LIKE 'Carga de borradores desde Listado.xlsx%'
),
t AS (
  SELECT n.id, i.section, i.sort_order, i.item_text, i.criticality,
         CASE WHEN i.section = 'COMPETENCIA' THEN i.method END AS method, i.observations
    FROM nuevos n
    JOIN public.rh_competency_evaluation_items i
      ON i.evaluation_id = n.tpl AND i.section IN ('COMPETENCIA', 'DESEMPENO')
),
c AS (
  SELECT i.evaluation_id AS id, i.section, i.sort_order, i.item_text, i.criticality, i.method, i.observations
    FROM public.rh_competency_evaluation_items i
   WHERE i.evaluation_id IN (SELECT id FROM nuevos)
     AND i.section IN ('COMPETENCIA', 'DESEMPENO')  -- la seccion 3 la asigna RH despues
)
SELECT (SELECT count(*) FROM (SELECT * FROM t EXCEPT SELECT * FROM c) x) AS faltan_vs_plantilla,
       (SELECT count(*) FROM (SELECT * FROM c EXCEPT SELECT * FROM t) x) AS sobran_vs_plantilla;

-- D) DESPUES: ningun colaborador con 2 evaluaciones en el mismo puesto (esperado: 0 filas).
SELECT employee_id, position_id, count(*)
  FROM public.rh_competency_evaluations
 GROUP BY employee_id, position_id
HAVING count(*) > 1;
