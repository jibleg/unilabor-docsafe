-- SCRIPT_PROD_20261123_INDUCCION_LIGAS_A_VERSION_VIGENTE.sql
-- Aplicar por pgAdmin en xlab-extended (BD de DocSafe).
--
-- Problema: al reemplazar un documento en el SGC, las ligas de Induccion se quedaban
-- en la version reemplazada. Los puestos (documentos obligatorios, lectura de la
-- Fase 5) solo toman documentos vigentes, asi que perdian el documento en silencio;
-- las fases institucionales (1 a 4) seguian apuntando a una version no vigente.
-- El origen ya se corrigio en el codigo (el reemplazo mueve las ligas); este script
-- repara las ligas que quedaron atras.
--
-- Que hace: pasa cada liga puesto-documento y fase-documento que apunta a un
-- documento reemplazado a su version VIGENTE, siguiendo toda la cadena de
-- reemplazos (un documento pudo reemplazarse varias veces).
--
-- Que NO hace:
--   - No toca las lecturas ya asignadas ni las firmadas (rh_induction_reading_items,
--     quality_reading_acknowledgements): solo cambia configuracion, asi que aplica
--     unicamente a inscripciones FUTURAS.
--   - No toca ligas cuyo documento no tiene version vigente (documento dado de baja
--     o cadena que termina en uno no vigente): salen en el listado "REVISAR A MANO".
--   - No mueve una liga si el puesto / la fase ya tiene ligada la version vigente
--     (indice unico): tambien sale en "REVISAR A MANO".
--   - No borra nada.
--
-- Deja una fila de auditoria por documento movido (access_logs, action
-- 'RH_INDUCTION_LINKS_REPAIRED:puestos=N:fases=M', con el documento anterior en
-- metadata). Repetirlo no cambia nada. Compatible con PostgreSQL 10.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE lower(email) = 'sistemas@unilabor.mx') THEN
    RAISE EXCEPTION 'No existe la cuenta sistemas@unilabor.mx (actor de la auditoria)';
  END IF;
END $$;

-- Version vigente al final de la cadena de cada documento reemplazado.
CREATE TEMP TABLE tmp_vigente ON COMMIT DROP AS
WITH RECURSIVE chain AS (
  SELECT d.id AS origin_id, d.id AS document_id, d.status, d.replaced_by_document_id, 0 AS depth
    FROM public.documents d
   WHERE d.status <> 'active'
  UNION ALL
  SELECT c.origin_id, n.id, n.status, n.replaced_by_document_id, c.depth + 1
    FROM chain c
    JOIN public.documents n ON n.id = c.replaced_by_document_id
   WHERE c.depth < 100
)
SELECT DISTINCT ON (origin_id) origin_id, document_id AS latest_id, status AS latest_status, depth
  FROM chain
 ORDER BY origin_id, depth DESC;

-- Ligas de puestos a un documento no vigente y que hacer con cada una.
CREATE TEMP TABLE tmp_ligas_puesto ON COMMIT DROP AS
SELECT pd.id, pd.position_id, pd.document_id AS previous_id, v.latest_id, v.latest_status,
       CASE
         WHEN v.latest_status <> 'active' OR v.latest_id = pd.document_id THEN 'SIN_VERSION_VIGENTE'
         WHEN EXISTS (SELECT 1 FROM public.rh_position_documents x
                       WHERE x.position_id = pd.position_id AND x.document_id = v.latest_id) THEN 'VIGENTE_YA_LIGADA'
         WHEN ROW_NUMBER() OVER (PARTITION BY pd.position_id, v.latest_id ORDER BY pd.id) > 1 THEN 'VIGENTE_YA_LIGADA'
         ELSE 'MOVER'
       END AS accion
  FROM public.rh_position_documents pd
  JOIN public.documents d ON d.id = pd.document_id AND d.status <> 'active'
  JOIN tmp_vigente v ON v.origin_id = pd.document_id;

CREATE TEMP TABLE tmp_ligas_fase ON COMMIT DROP AS
SELECT pd.id, pd.phase_id, pd.document_id AS previous_id, v.latest_id, v.latest_status,
       CASE
         WHEN v.latest_status <> 'active' OR v.latest_id = pd.document_id THEN 'SIN_VERSION_VIGENTE'
         WHEN EXISTS (SELECT 1 FROM public.rh_induction_phase_documents x
                       WHERE x.phase_id = pd.phase_id AND x.document_id = v.latest_id) THEN 'VIGENTE_YA_LIGADA'
         WHEN ROW_NUMBER() OVER (PARTITION BY pd.phase_id, v.latest_id ORDER BY pd.id) > 1 THEN 'VIGENTE_YA_LIGADA'
         ELSE 'MOVER'
       END AS accion
  FROM public.rh_induction_phase_documents pd
  JOIN public.documents d ON d.id = pd.document_id AND d.status <> 'active'
  JOIN tmp_vigente v ON v.origin_id = pd.document_id;

-- Auditoria: una fila por (documento anterior -> vigente) movido.
INSERT INTO public.access_logs (user_id, document_id, action, module_code, entity_type, metadata)
SELECT (SELECT id FROM public.users WHERE lower(email) = 'sistemas@unilabor.mx' LIMIT 1),
       m.latest_id,
       'RH_INDUCTION_LINKS_REPAIRED:puestos=' || m.puestos || ':fases=' || m.fases,
       'RH',
       'document',
       json_build_object('previous_document_id', m.previous_id, 'script', 'SCRIPT_PROD_20261123_INDUCCION_LIGAS_A_VERSION_VIGENTE')::jsonb
  FROM (
    SELECT previous_id, latest_id, SUM(puestos)::int AS puestos, SUM(fases)::int AS fases
      FROM (
        SELECT previous_id, latest_id, COUNT(*) AS puestos, 0 AS fases FROM tmp_ligas_puesto WHERE accion = 'MOVER' GROUP BY 1, 2
        UNION ALL
        SELECT previous_id, latest_id, 0, COUNT(*) FROM tmp_ligas_fase WHERE accion = 'MOVER' GROUP BY 1, 2
      ) parts
     GROUP BY previous_id, latest_id
  ) m;

UPDATE public.rh_position_documents pd
   SET document_id = t.latest_id
  FROM tmp_ligas_puesto t
 WHERE t.id = pd.id AND t.accion = 'MOVER';

UPDATE public.rh_induction_phase_documents pd
   SET document_id = t.latest_id
  FROM tmp_ligas_fase t
 WHERE t.id = pd.id AND t.accion = 'MOVER';

-- Listado 1: resumen.
SELECT 'puestos' AS liga, accion, COUNT(*)::int AS ligas, COUNT(DISTINCT previous_id)::int AS documentos FROM tmp_ligas_puesto GROUP BY accion
UNION ALL
SELECT 'fases', accion, COUNT(*)::int, COUNT(DISTINCT previous_id)::int FROM tmp_ligas_fase GROUP BY accion
ORDER BY 1, 2;

-- Listado 2: documentos movidos a su version vigente.
SELECT COALESCE(old.code, '') AS codigo, old.title AS version_anterior, cur.title AS version_vigente,
       SUM(CASE WHEN m.liga = 'puesto' THEN 1 ELSE 0 END)::int AS puestos,
       SUM(CASE WHEN m.liga = 'fase' THEN 1 ELSE 0 END)::int AS fases
  FROM (
    SELECT 'puesto' AS liga, previous_id, latest_id FROM tmp_ligas_puesto WHERE accion = 'MOVER'
    UNION ALL
    SELECT 'fase', previous_id, latest_id FROM tmp_ligas_fase WHERE accion = 'MOVER'
  ) m
  JOIN public.documents old ON old.id = m.previous_id
  JOIN public.documents cur ON cur.id = m.latest_id
 GROUP BY old.code, old.title, cur.title
 ORDER BY puestos DESC, version_anterior;

-- Listado 3: REVISAR A MANO (no se tocaron).
SELECT t.accion, 'puesto ' || p.code AS donde, d.title AS documento, d.status
  FROM tmp_ligas_puesto t
  JOIN public.rh_positions p ON p.id = t.position_id
  JOIN public.documents d ON d.id = t.previous_id
 WHERE t.accion <> 'MOVER'
UNION ALL
SELECT t.accion, 'fase ' || ph.phase_number, d.title, d.status
  FROM tmp_ligas_fase t
  JOIN public.rh_induction_phases ph ON ph.id = t.phase_id
  JOIN public.documents d ON d.id = t.previous_id
 WHERE t.accion <> 'MOVER'
 ORDER BY 1, 3, 2;

COMMIT;
