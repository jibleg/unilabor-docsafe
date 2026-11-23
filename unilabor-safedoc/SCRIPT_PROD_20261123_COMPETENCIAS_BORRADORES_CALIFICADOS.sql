-- SCRIPT_PROD_20261123_COMPETENCIAS_BORRADORES_CALIFICADOS.sql
-- Aplicar por pgAdmin en xlab-extended (BD de DocSafe), despues de
-- SCRIPT_PROD_20261123_COMPETENCIAS_BORRADORES_PRECARGA.sql.
--
-- Que hace: en las evaluaciones REH-REG-003 en BORRADOR, pone la Criticidad y el
-- Metodo del catalogo del puesto tambien en las competencias YA CALIFICADAS
-- (el script anterior las habia dejado sin tocar). Observaciones / evidencia se
-- llena con "que se observa" solo si esta vacia.
--
-- Efecto: la calificacion capturada NO cambia, pero el porcentaje de la seccion
-- si puede cambiar, porque la criticidad pondera (A=5, M=3, B=1), y una
-- competencia A calificada por debajo de 3 da NO COMPETENTE. El listado 2 muestra
-- las competencias A con calificacion menor a 3.
--
-- Que NO hace: no cambia ninguna calificacion, no toca evaluaciones cerradas ni
-- las secciones de desempeno y conocimiento, no borra nada. Repetirlo no cambia
-- nada. Compatible con PostgreSQL 10.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.norm_comp(t TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(translate(lower(t), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g');
$$ LANGUAGE sql IMMUTABLE;

CREATE TEMP TABLE tmp_scored ON COMMIT DROP AS
SELECT i.id AS item_id, ev.id AS evaluation_id, e.full_name, p.code AS position_code, i.item_text, i.score,
       i.criticality AS criticidad_anterior, c.criticality, c.method, c.evidence_guide,
       CASE
         WHEN c.id IS NULL THEN 'FUERA_DEL_CATALOGO'
         WHEN i.criticality IS DISTINCT FROM c.criticality OR i.method IS DISTINCT FROM c.method
              OR (COALESCE(btrim(i.observations), '') = '' AND c.evidence_guide IS NOT NULL) THEN 'ACTUALIZAR'
         ELSE 'SIN_CAMBIO'
       END AS accion,
       (COALESCE(btrim(i.observations), '') = '' AND c.evidence_guide IS NOT NULL) AS llena_observacion
  FROM public.rh_competency_evaluation_items i
  JOIN public.rh_competency_evaluations ev ON ev.id = i.evaluation_id AND ev.status = 'DRAFT'
  JOIN public.employees e ON e.id = ev.employee_id
  JOIN public.rh_positions p ON p.id = ev.position_id
  LEFT JOIN LATERAL (
    SELECT c.* FROM public.rh_position_competencies c
     WHERE c.position_id = ev.position_id AND c.method IS NOT NULL
       AND pg_temp.norm_comp(c.competency_text) = pg_temp.norm_comp(i.item_text)
     ORDER BY c.id LIMIT 1
  ) c ON TRUE
 WHERE i.section = 'COMPETENCIA' AND i.score IS NOT NULL;

UPDATE public.rh_competency_evaluation_items i
   SET criticality = t.criticality,
       method = t.method,
       observations = CASE WHEN COALESCE(btrim(i.observations), '') = '' THEN t.evidence_guide ELSE i.observations END
  FROM tmp_scored t
 WHERE t.item_id = i.id AND t.accion = 'ACTUALIZAR';

UPDATE public.rh_competency_evaluations ev
   SET updated_at = NOW()
 WHERE ev.id IN (SELECT evaluation_id FROM tmp_scored WHERE accion = 'ACTUALIZAR');

-- Listado 1: resumen.
SELECT accion, COUNT(*)::int AS competencias, COUNT(DISTINCT evaluation_id)::int AS evaluaciones,
       SUM(CASE WHEN criticidad_anterior IS DISTINCT FROM criticality THEN 1 ELSE 0 END)::int AS cambian_criticidad,
       SUM(CASE WHEN llena_observacion THEN 1 ELSE 0 END)::int AS observaciones_llenadas
  FROM tmp_scored GROUP BY accion ORDER BY 1;

-- Listado 2: competencias de criticidad A con calificacion menor a 3 (dan NO COMPETENTE).
SELECT evaluation_id, full_name, position_code, score, item_text
  FROM tmp_scored WHERE criticality = 'A' AND score < 3 ORDER BY 2, 5;

-- Listado 3: competencias calificadas que no estan en el catalogo del puesto (no se tocaron).
SELECT evaluation_id, full_name, position_code, item_text
  FROM tmp_scored WHERE accion = 'FUERA_DEL_CATALOGO' ORDER BY 2, 4;

COMMIT;
