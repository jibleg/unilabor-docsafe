-- SCRIPT_PROD_20261123_FASE7_DESEMPENO_PRECARGAR_DESDE_MIGUEL_CUST.sql
-- Aplicar por pgAdmin en xlab-extended (BD de DocSafe).
--
-- Que hace: toma la seccion 2. Desempeno de la evaluacion REH-REG-003 de
-- b_miguel_angel@unilabor.mx en el puesto Custodio (CUST) y la copia a los
-- borradores que tienen esa seccion PENDIENTE (ningun criterio calificado y sin
-- observaciones), de cualquier puesto. Copia calificacion, observaciones y
-- criticidad de cada uno de los 7 criterios, casando por el texto del criterio.
--
-- Borradores que llena: en borrador, de colaboradores activos, sin enviar a firma
-- y sin firmas, con los mismos 7 criterios que el modelo.
-- Que NO hace: no toca borradores que ya tienen algo capturado en Desempeno, ni
-- las secciones de competencia y conocimiento, ni evaluaciones en firma o
-- cerradas. No calcula porcentajes ni dictamen, no envia a firma, no cierra.
-- No borra filas. Repetirlo no cambia nada.
-- Deja una fila de auditoria por borrador (access_logs,
-- action = 'RH_COMP_EVAL_DRAFT_PRELOAD').
--
-- Cada evaluador debe abrir su borrador, corregir lo que no corresponda al
-- colaborador y enviarlo a firma. Compatible con PostgreSQL 10.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.norm_comp(t TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(translate(lower(t), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g');
$$ LANGUAGE sql IMMUTABLE;

-- Modelo: la evaluacion mas reciente de Miguel en Custodio.
CREATE TEMP TABLE tmp_modelo ON COMMIT DROP AS
SELECT i.evaluation_id, pg_temp.norm_comp(i.item_text) AS clave, i.item_text, i.criticality, i.score, i.observations
  FROM public.rh_competency_evaluation_items i
 WHERE i.section = 'DESEMPENO'
   AND i.evaluation_id = (
     SELECT ev.id
       FROM public.rh_competency_evaluations ev
       JOIN public.employees emp ON emp.id = ev.employee_id
       JOIN public.users u ON u.id = emp.user_id
       JOIN public.rh_positions rp ON rp.id = ev.position_id
      WHERE lower(u.email) = 'b_miguel_angel@unilabor.mx' AND rp.code = 'CUST'
      ORDER BY ev.id DESC LIMIT 1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE lower(email) = 'sistemas@unilabor.mx') THEN
    RAISE EXCEPTION 'No existe la cuenta sistemas@unilabor.mx (actor de la auditoria)';
  END IF;
  IF (SELECT count(*) FROM tmp_modelo) <> 7 OR (SELECT count(score) FROM tmp_modelo) <> 7
     OR (SELECT count(DISTINCT clave) FROM tmp_modelo) <> 7 THEN
    RAISE EXCEPTION 'El modelo (Desempeno de Miguel en CUST) no tiene 7 criterios calificados: no se precarga nada';
  END IF;
END $$;

-- Borradores con Desempeno pendiente.
CREATE TEMP TABLE tmp_destino ON COMMIT DROP AS
SELECT ev.id AS evaluation_id, ev.employee_id, emp.full_name, rp.code AS position_code, ev.evaluator_name,
       ((SELECT count(*) FROM public.rh_competency_evaluation_items i
          WHERE i.evaluation_id = ev.id AND i.section = 'DESEMPENO') = 7
        AND (SELECT count(*) FROM public.rh_competency_evaluation_items i
               JOIN tmp_modelo m ON m.clave = pg_temp.norm_comp(i.item_text)
              WHERE i.evaluation_id = ev.id AND i.section = 'DESEMPENO') = 7) AS coincide
  FROM public.rh_competency_evaluations ev
  JOIN public.rh_positions rp ON rp.id = ev.position_id
  JOIN public.employees emp ON emp.id = ev.employee_id AND emp.is_active
 WHERE ev.status = 'DRAFT'
   AND ev.id NOT IN (SELECT evaluation_id FROM tmp_modelo)
   AND ev.signature_requested_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.rh_document_signatures s
                    WHERE s.document_kind = 'COMPETENCY_EVALUATION' AND s.document_id = ev.id)
   AND NOT EXISTS (SELECT 1 FROM public.rh_competency_evaluation_items i
                    WHERE i.evaluation_id = ev.id AND i.section = 'DESEMPENO'
                      AND (i.score IS NOT NULL OR COALESCE(btrim(i.observations), '') <> ''));

-- Listado 1: modelo que se copia.
SELECT item_text AS criterio, criticality AS criticidad, score AS calificacion, observations AS observaciones
  FROM tmp_modelo ORDER BY 1;

UPDATE public.rh_competency_evaluation_items i
   SET score = m.score, observations = m.observations, criticality = m.criticality
  FROM tmp_modelo m, tmp_destino d
 WHERE d.coincide AND i.evaluation_id = d.evaluation_id AND i.section = 'DESEMPENO'
   AND pg_temp.norm_comp(i.item_text) = m.clave;

UPDATE public.rh_competency_evaluations ev
   SET updated_at = NOW()
 WHERE ev.id IN (SELECT evaluation_id FROM tmp_destino WHERE coincide);

INSERT INTO public.access_logs (user_id, action, ip_address, module_code, entity_type, entity_id, employee_id, metadata)
SELECT actor.id, 'RH_COMP_EVAL_DRAFT_PRELOAD', NULL, 'RH', 'competency_evaluation', d.evaluation_id, d.employee_id,
       jsonb_build_object(
         'seccion', 'DESEMPENO',
         'puesto', d.position_code,
         'evaluacion_modelo', (SELECT min(evaluation_id) FROM tmp_modelo),
         'reactivos_precargados', 7,
         'origen', 'SCRIPT_PROD_20261123_FASE7_DESEMPENO_PRECARGAR_DESDE_MIGUEL_CUST.sql'
       )
  FROM tmp_destino d
  CROSS JOIN (SELECT id FROM public.users WHERE lower(email) = 'sistemas@unilabor.mx') actor
 WHERE d.coincide;

-- Listado 2: borradores precargados (vacio si se repite).
SELECT evaluation_id, full_name AS colaborador, position_code AS puesto, evaluator_name AS evaluador
  FROM tmp_destino WHERE coincide ORDER BY 3, 2;

-- Listado 3: borradores pendientes cuyos criterios no coinciden con el modelo (no se tocaron).
SELECT evaluation_id, full_name AS colaborador, position_code AS puesto
  FROM tmp_destino WHERE NOT coincide ORDER BY 3, 2;

COMMIT;
