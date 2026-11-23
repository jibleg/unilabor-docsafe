-- SCRIPT_PROD_20261123_COMPETENCIAS_BORRADORES_PRECARGA.sql
-- Aplicar por pgAdmin en xlab-extended (BD de DocSafe), DESPUES de
-- SCRIPT_PROD_20261123_COMPETENCIAS_CRITICIDAD_METODO_EVIDENCIA.sql.
--
-- Que hace: lleva a las evaluaciones REH-REG-003 que estan en BORRADOR la
-- Criticidad, el Metodo y "Que se observa" del catalogo del puesto (seccion
-- 1. Competencia), igual que ya llegan en las evaluaciones nuevas.
--
-- Solo toca competencias SIN CALIFICAR:
--   - Criticidad y Metodo: se ponen los del catalogo.
--   - Observaciones / evidencia: se llena solo si esta vacia.
-- Que NO hace:
--   - No toca competencias ya calificadas (salen en el listado 2).
--   - No toca evaluaciones cerradas, ni las secciones de desempeno y conocimiento.
--   - No toca competencias agregadas a mano que no estan en el catalogo (listado 3).
--   - No borra nada. Repetirlo no cambia nada. Compatible con PostgreSQL 10.
BEGIN;

CREATE FUNCTION pg_temp.norm_comp(t TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(translate(lower(t), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g');
$$ LANGUAGE sql IMMUTABLE;

CREATE TEMP TABLE tmp_items ON COMMIT DROP AS
SELECT i.id AS item_id, ev.id AS evaluation_id, e.full_name, p.code AS position_code, i.item_text, i.score,
       c.id AS competency_id, c.criticality, c.method, c.evidence_guide,
       CASE
         WHEN c.id IS NULL THEN 'FUERA_DEL_CATALOGO'
         WHEN i.score IS NOT NULL THEN 'YA_CALIFICADA'
         WHEN i.criticality IS DISTINCT FROM c.criticality OR i.method IS DISTINCT FROM c.method
              OR (COALESCE(btrim(i.observations), '') = '' AND c.evidence_guide IS NOT NULL) THEN 'ACTUALIZAR'
         ELSE 'SIN_CAMBIO'
       END AS accion
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
 WHERE i.section = 'COMPETENCIA';

UPDATE public.rh_competency_evaluation_items i
   SET criticality = t.criticality,
       method = t.method,
       observations = CASE WHEN COALESCE(btrim(i.observations), '') = '' THEN t.evidence_guide ELSE i.observations END
  FROM tmp_items t
 WHERE t.item_id = i.id AND t.accion = 'ACTUALIZAR';

UPDATE public.rh_competency_evaluations ev
   SET updated_at = NOW()
 WHERE ev.id IN (SELECT evaluation_id FROM tmp_items WHERE accion = 'ACTUALIZAR');

-- Listado 1: resumen.
SELECT accion, COUNT(*)::int AS competencias, COUNT(DISTINCT evaluation_id)::int AS evaluaciones
  FROM tmp_items GROUP BY accion ORDER BY 1;

-- Listado 2: borradores con competencias YA CALIFICADAS (no se tocaron).
SELECT evaluation_id, full_name, position_code, COUNT(*)::int AS calificadas
  FROM tmp_items WHERE accion = 'YA_CALIFICADA' GROUP BY 1, 2, 3 ORDER BY 2;

-- Listado 3: competencias que no estan en el catalogo del puesto (no se tocaron).
SELECT evaluation_id, full_name, position_code, item_text
  FROM tmp_items WHERE accion = 'FUERA_DEL_CATALOGO' ORDER BY 2, 4;

COMMIT;
