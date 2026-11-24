-- SCRIPT_PROD_20261123_REH_REG_008_RA_OTRAS_Y_REEMISION.sql
-- Aplicar por pgAdmin en xlab-extended (BD de DocSafe). Requiere la migracion
-- 20261123_04_rh_position_assignment_other_authorizations.sql.
--
-- Cartas de asignacion de puesto REH-REG-008 del puesto RA Recepcionistas. El
-- modelo es la carta de Martha Rodriguez Rodriguez (REH-REG-008-00013):
--   autorizaciones 1 a 14, 16, 18, 19, 62, 68, 69 y 82 "Otras", con el texto
--   "Elaboración de bitácoras de trabajo, Generación de facturas a pacientes".
--
-- Que hace:
--   1. PUESTO: deja ese modelo como predeterminado del puesto RA (autorizaciones
--      y texto de "Otras"), para que las cartas nuevas salgan asi.
--   2. CARTAS EN BORRADOR o EN FIRMA: las iguala al modelo (activa "Otras" con
--      el texto y quita lo que el modelo no tiene, p. ej. 71 y 72). CONSERVA las
--      firmas ya recabadas (decision del 23-nov-2026) y deja en la auditoria lo
--      que tenia cada carta antes.
--   3. CARTAS CERRADAS distintas al modelo: NO se tocan (son evidencia). Se emite
--      una carta NUEVA con el modelo, los mismos firmantes y fecha de hoy, y se
--      envia a firma cuando los tres firmantes tienen cuenta activa; si no, queda
--      en borrador para que RH elija firmantes.
--
-- Que NO hace: no modifica ni borra cartas cerradas ni sus PDF, no firma por
-- nadie, no invalida firmas, no toca cartas de otros puestos. Repetirlo no
-- cambia nada. Auditoria en access_logs: RH_ASSIGNMENT_LETTER_ALIGNED y
-- RH_ASSIGNMENT_LETTER_REISSUED. Compatible con PostgreSQL 10.
BEGIN;

CREATE TEMP TABLE tmp_cfg ON COMMIT DROP AS
SELECT (SELECT id FROM public.rh_positions WHERE code = 'RA') AS position_id,
       (SELECT id FROM public.users WHERE lower(email) = 'sistemas@unilabor.mx') AS actor_id,
       'Elaboración de bitácoras de trabajo, Generación de facturas a pacientes'::text AS other_text;

CREATE TEMP TABLE tmp_model ON COMMIT DROP AS
SELECT i.id AS item_id, i.item_no
  FROM public.rh_assignment_authorization_items i
 WHERE i.is_active AND i.item_no IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,16,18,19,62,68,69,82);

DO $$
BEGIN
  IF (SELECT position_id FROM tmp_cfg) IS NULL THEN RAISE EXCEPTION 'No existe el puesto RA'; END IF;
  IF (SELECT actor_id FROM tmp_cfg) IS NULL THEN RAISE EXCEPTION 'No existe la cuenta sistemas@unilabor.mx (actor de la auditoria)'; END IF;
  IF (SELECT count(*) FROM tmp_model) <> 21 THEN RAISE EXCEPTION 'El modelo deberia tener 21 autorizaciones y tiene %', (SELECT count(*) FROM tmp_model); END IF;
END $$;

-- Estado de cada carta del puesto frente al modelo.
CREATE TEMP TABLE tmp_cartas ON COMMIT DROP AS
SELECT l.id, l.folio, l.status, l.employee_id, e.full_name, l.other_authorizations,
       (SELECT string_agg(ai.item_no::text, ',' ORDER BY ai.item_no)
          FROM public.rh_assignment_letter_items li JOIN public.rh_assignment_authorization_items ai ON ai.id = li.item_id
         WHERE li.letter_id = l.id AND li.authorized) AS items_antes,
       (COALESCE(l.other_authorizations, '') = (SELECT other_text FROM tmp_cfg)
        AND NOT EXISTS (SELECT 1 FROM public.rh_assignment_letter_items li
                         WHERE li.letter_id = l.id
                           AND li.authorized IS DISTINCT FROM EXISTS (SELECT 1 FROM tmp_model m WHERE m.item_id = li.item_id))) AS igual_al_modelo
  FROM public.rh_assignment_letters l
  JOIN public.employees e ON e.id = l.employee_id
 WHERE l.position_id = (SELECT position_id FROM tmp_cfg);

-- 1. Predeterminado del puesto.
DELETE FROM public.rh_position_assignment_authorizations pa
 WHERE pa.position_id = (SELECT position_id FROM tmp_cfg)
   AND (SELECT count(*) FROM public.rh_position_assignment_authorizations x WHERE x.position_id = pa.position_id) <> 21;
INSERT INTO public.rh_position_assignment_authorizations (position_id, item_id, updated_by_user_id)
SELECT c.position_id, m.item_id, c.actor_id FROM tmp_cfg c CROSS JOIN tmp_model m
 WHERE NOT EXISTS (SELECT 1 FROM public.rh_position_assignment_authorizations x WHERE x.position_id = c.position_id AND x.item_id = m.item_id);
DELETE FROM public.rh_position_assignment_authorizations pa
 WHERE pa.position_id = (SELECT position_id FROM tmp_cfg) AND pa.item_id NOT IN (SELECT item_id FROM tmp_model);
UPDATE public.rh_positions p
   SET assignment_other_authorizations = c.other_text, updated_at = NOW()
  FROM tmp_cfg c
 WHERE p.id = c.position_id AND p.assignment_other_authorizations IS DISTINCT FROM c.other_text;

-- 2. Cartas en borrador o en firma: se igualan al modelo conservando las firmas.
INSERT INTO public.access_logs (user_id, action, ip_address, module_code, entity_type, entity_id, employee_id, metadata)
SELECT c.actor_id, 'RH_ASSIGNMENT_LETTER_ALIGNED', NULL, 'RH', 'assignment_letter', t.id, t.employee_id,
       jsonb_build_object('folio', t.folio, 'autorizaciones_antes', t.items_antes, 'otras_antes', t.other_authorizations,
                          'modelo', 'REH-REG-008-00013', 'origen', 'SCRIPT_PROD_20261123_REH_REG_008_RA_OTRAS_Y_REEMISION.sql')
  FROM tmp_cartas t CROSS JOIN tmp_cfg c
 WHERE t.status = 'DRAFT' AND NOT t.igual_al_modelo;

UPDATE public.rh_assignment_letter_items li
   SET authorized = EXISTS (SELECT 1 FROM tmp_model m WHERE m.item_id = li.item_id)
  FROM tmp_cartas t
 WHERE t.id = li.letter_id AND t.status = 'DRAFT' AND NOT t.igual_al_modelo
   AND li.authorized IS DISTINCT FROM EXISTS (SELECT 1 FROM tmp_model m WHERE m.item_id = li.item_id);

UPDATE public.rh_assignment_letters l
   SET other_authorizations = (SELECT other_text FROM tmp_cfg), updated_at = NOW()
  FROM tmp_cartas t
 WHERE t.id = l.id AND t.status = 'DRAFT' AND NOT t.igual_al_modelo;

-- 3. Cartas cerradas distintas al modelo: se emite una carta nueva (la cerrada queda intacta).
CREATE TEMP TABLE tmp_reemitir ON COMMIT DROP AS
SELECT l.id AS old_id, l.folio AS old_folio, l.employee_id, t.full_name, nextval('public.rh_assignment_letters_id_seq') AS new_id,
       (SELECT bool_and(ok) FROM (
          SELECT EXISTS (SELECT 1 FROM public.employees s JOIN public.users u ON u.id = s.user_id AND u.is_active
                          WHERE s.id = x.signer_id AND s.is_active) AS ok
            FROM (VALUES (l.employee_id), (l.area_signatory_employee_id), (l.director_signatory_employee_id)) AS x(signer_id)) f) AS firmantes_listos
  FROM tmp_cartas t
  JOIN public.rh_assignment_letters l ON l.id = t.id
 WHERE t.status = 'CLOSED' AND NOT t.igual_al_modelo
   AND NOT EXISTS (SELECT 1 FROM public.rh_assignment_letters n
                    WHERE n.employee_id = l.employee_id AND n.position_id = l.position_id AND n.id > l.id);

INSERT INTO public.rh_assignment_letters
  (id, folio, employee_id, position_id, competency_evaluation_id, letter_date, area_name, position_description_name, other_authorizations,
   area_signatory_employee_id, area_signatory_name, director_signatory_employee_id, director_signatory_name, created_by_user_id,
   signature_requested_at, signature_requested_by_user_id)
SELECT r.new_id, 'REH-REG-008-' || lpad(r.new_id::text, 5, '0'), l.employee_id, l.position_id, NULL,
       (NOW() AT TIME ZONE 'America/Mexico_City')::date, l.area_name, l.position_description_name, c.other_text,
       l.area_signatory_employee_id, l.area_signatory_name, l.director_signatory_employee_id, l.director_signatory_name, c.actor_id,
       CASE WHEN r.firmantes_listos THEN NOW() END, CASE WHEN r.firmantes_listos THEN c.actor_id END
  FROM tmp_reemitir r JOIN public.rh_assignment_letters l ON l.id = r.old_id CROSS JOIN tmp_cfg c;

INSERT INTO public.rh_assignment_letter_items (letter_id, item_id, authorized)
SELECT r.new_id, i.id, EXISTS (SELECT 1 FROM tmp_model m WHERE m.item_id = i.id)
  FROM tmp_reemitir r CROSS JOIN public.rh_assignment_authorization_items i
 WHERE i.is_active;

INSERT INTO public.access_logs (user_id, action, ip_address, module_code, entity_type, entity_id, employee_id, metadata)
SELECT c.actor_id, 'RH_ASSIGNMENT_LETTER_REISSUED', NULL, 'RH', 'assignment_letter', r.new_id, r.employee_id,
       jsonb_build_object('carta_anterior_id', r.old_id, 'carta_anterior_folio', r.old_folio, 'enviada_a_firma', COALESCE(r.firmantes_listos, FALSE),
                          'motivo', 'Agregar la autorizacion 82 Otras e igualar al modelo del puesto',
                          'origen', 'SCRIPT_PROD_20261123_REH_REG_008_RA_OTRAS_Y_REEMISION.sql')
  FROM tmp_reemitir r CROSS JOIN tmp_cfg c;

-- Listado 1: predeterminado del puesto.
SELECT p.code AS puesto, p.assignment_other_authorizations AS texto_otras,
       (SELECT string_agg(ai.item_no::text, ',' ORDER BY ai.item_no) FROM public.rh_position_assignment_authorizations pa
          JOIN public.rh_assignment_authorization_items ai ON ai.id = pa.item_id WHERE pa.position_id = p.id) AS autorizaciones
  FROM public.rh_positions p WHERE p.id = (SELECT position_id FROM tmp_cfg);

-- Listado 2: cartas en borrador o en firma igualadas (vacio si se repite).
SELECT t.folio, t.full_name AS colaborador, t.items_antes AS autorizaciones_antes, t.other_authorizations AS otras_antes
  FROM tmp_cartas t WHERE t.status = 'DRAFT' AND NOT t.igual_al_modelo ORDER BY 2;

-- Listado 3: cartas nuevas emitidas en lugar de una cerrada (vacio si se repite).
SELECT r.full_name AS colaborador, r.old_folio AS carta_cerrada, 'REH-REG-008-' || lpad(r.new_id::text, 5, '0') AS carta_nueva,
       CASE WHEN r.firmantes_listos THEN 'Enviada a firma' ELSE 'En borrador: RH debe elegir firmantes y enviarla' END AS situacion
  FROM tmp_reemitir r ORDER BY 1;

COMMIT;
