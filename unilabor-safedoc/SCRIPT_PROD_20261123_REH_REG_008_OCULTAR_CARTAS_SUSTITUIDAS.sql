-- SCRIPT_PROD_20261123_REH_REG_008_OCULTAR_CARTAS_SUSTITUIDAS.sql
-- Aplicar por pgAdmin en xlab-extended (BD de DocSafe). Requiere la migracion
-- 20261123_05_rh_assignment_letter_superseded.sql y, antes,
-- SCRIPT_PROD_20261123_REH_REG_008_RA_OTRAS_Y_REEMISION.sql.
--
-- Que hace: marca como SUSTITUIDA cada carta REH-REG-008 cerrada en cuyo lugar se
-- emitio una carta nueva (segun la auditoria RH_ASSIGNMENT_LETTER_REISSUED), para
-- que ya no se muestre en /rh/assignment-letters ni se pueda abrir su PDF, y pasa
-- su PDF del expediente del colaborador a "sustituido" (deja de ser el vigente).
--
-- Que NO hace: no borra la carta, sus firmas ni el archivo PDF (siguen en la base
-- y en disco como antecedente); no toca la carta nueva. Repetirlo no cambia nada.
-- Para revertir una: poner superseded_by_letter_id = NULL en la carta y
-- status = 'active', is_current = TRUE en su documento del expediente.
-- Auditoria en access_logs: RH_ASSIGNMENT_LETTER_SUPERSEDED. PostgreSQL 10.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE lower(email) = 'sistemas@unilabor.mx') THEN
    RAISE EXCEPTION 'No existe la cuenta sistemas@unilabor.mx (actor de la auditoria)';
  END IF;
END $$;

CREATE TEMP TABLE tmp_sust ON COMMIT DROP AS
SELECT DISTINCT ON (old.id) old.id AS old_id, old.folio AS old_folio, old.employee_id, e.full_name, old.document_id,
       nw.id AS new_id, nw.folio AS new_folio, nw.status AS new_status, (nw.signature_requested_at IS NOT NULL) AS new_en_firma
  FROM public.access_logs a
  JOIN public.rh_assignment_letters nw ON nw.id = a.entity_id::bigint
  JOIN public.rh_assignment_letters old ON old.id = (a.metadata->>'carta_anterior_id')::bigint
  JOIN public.employees e ON e.id = old.employee_id
 WHERE a.action = 'RH_ASSIGNMENT_LETTER_REISSUED'
   AND old.status = 'CLOSED' AND old.superseded_by_letter_id IS NULL
   AND nw.employee_id = old.employee_id AND nw.position_id = old.position_id
 ORDER BY old.id, nw.id DESC;

UPDATE public.rh_assignment_letters l
   SET superseded_by_letter_id = t.new_id, superseded_at = NOW()
  FROM tmp_sust t
 WHERE l.id = t.old_id;

UPDATE public.employee_documents d
   SET status = 'superseded', is_current = FALSE, updated_at = NOW()
  FROM tmp_sust t
 WHERE d.id = t.document_id AND d.is_current;

INSERT INTO public.access_logs (user_id, action, ip_address, module_code, entity_type, entity_id, employee_id, metadata)
SELECT (SELECT id FROM public.users WHERE lower(email) = 'sistemas@unilabor.mx'), 'RH_ASSIGNMENT_LETTER_SUPERSEDED', NULL, 'RH',
       'assignment_letter', t.old_id, t.employee_id,
       jsonb_build_object('folio', t.old_folio, 'sustituida_por_id', t.new_id, 'sustituida_por_folio', t.new_folio,
                          'documento_expediente_id', t.document_id,
                          'origen', 'SCRIPT_PROD_20261123_REH_REG_008_OCULTAR_CARTAS_SUSTITUIDAS.sql')
  FROM tmp_sust t;

-- Listado: cartas que dejaron de mostrarse (vacio si se repite).
SELECT t.full_name AS colaborador, t.old_folio AS carta_oculta, t.new_folio AS carta_vigente,
       CASE WHEN t.new_status = 'CLOSED' THEN 'Cerrada' WHEN t.new_en_firma THEN 'En firma' ELSE 'En borrador, sin enviar a firma' END AS situacion_de_la_vigente
  FROM tmp_sust t ORDER BY 1;

COMMIT;
