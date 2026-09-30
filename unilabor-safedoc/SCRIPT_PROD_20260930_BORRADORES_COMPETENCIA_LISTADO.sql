-- =============================================================================
-- Borradores de Evaluacion de competencia (REH-REG-003) desde Listado.xlsx
-- (~/Desktop/SafeDoc/Listado.xlsx: colaborador / evaluacion / correo, 31 pares)
--
-- Por cada par colaborador-puesto crea un borrador (status DRAFT) copiando la
-- PLANTILLA del puesto = el borrador existente de ese puesto con mas
-- competencias capturadas (metodo/observaciones); empate -> el mas reciente.
--   COMPETENCIA: item, criticidad, metodo y observaciones/evidencia EXACTOS;
--                calificacion (score) NULL, abierta al evaluador.
--   DESEMPENO:   item, criticidad y observaciones/evidencia EXACTOS;
--                calificacion NULL.
--   CONOCIMIENTO: no se copia (RH la liga a la capacitacion del puesto).
-- Sin plantilla en el puesto -> precarga del catalogo, igual que la UI
-- (competencias del puesto + 7 criterios de desempeno), y se reporta.
--
-- Reglas acordadas con el usuario (2026-09-30):
--   * Si el colaborador YA tiene una evaluacion en ese puesto, NO se toca
--     ni se duplica (se reporta como OMITIDO). => el script es re-ejecutable.
--   * Evaluador: CENTRO (a_) -> Ada Karen; CIDE (b_) -> Victor Manuel;
--     Ada Karen -> Victor; Victor y Guillermo -> Ada Karen.
--   * Tipo = el de la plantilla; fecha = hoy; sin curso de referencia;
--     creado por = el creador de la plantilla (RH).
--   * Auditoria RH_COMP_EVAL_CREATE:<id> en access_logs (actor admin@).
--   * Solo INSERT: no borra ni modifica nada existente.
--
-- Ejecutar completo (psql -v ON_ERROR_STOP=1 -f ... o pgAdmin). Es UNA
-- transaccion: si algo falla (colaborador no encontrado o ambiguo, puesto
-- inexistente) no se crea nada.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE _lista (
  orden          INT PRIMARY KEY,
  email          TEXT NOT NULL,
  nombre_patron  TEXT NOT NULL,   -- respaldo si el correo no coincide
  puesto         TEXT NOT NULL,
  evaluador      TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _lista VALUES
  ( 1, 'a_litzy_jysmel@unilabor.mx',      '%Litzy%Magaña%',          'Responsable de Hematología',          'Ada Karen Hernández Arias'),
  ( 2, 'b_jhoana_paulina@unilabor.mx',    '%Jhoana%Sequera%',        'Responsable de Hematología',          'Víctor Manuel Hernández Montenegro'),
  ( 3, 'a_claudia_escudero@unilabor.mx',  '%Claudia%Escudero%',      'Responsable de Hematología',          'Ada Karen Hernández Arias'),
  ( 4, 'a_flor_maria@unilabor.mx',        '%Flor%Rosas%',            'Responsable de Hematología',          'Ada Karen Hernández Arias'),
  ( 5, 'analiticos.centro@unilabor.mx',   '%Ada Karen%Hern%ndez%',   'Responsable de Hematología',          'Víctor Manuel Hernández Montenegro'),
  ( 6, 'direccion.general@unilabor.mx',   '%Guillermo%Priego%',      'Responsable de Hematología',          'Ada Karen Hernández Arias'),
  ( 7, 'analiticos.cide@unilabor.mx',     '%Victor%Montenegro%',     'Responsable de Hematología',          'Ada Karen Hernández Arias'),
  ( 8, 'b_itzel_margarita@unilabor.mx',   '%Itzel%Escalante%',       'Responsable de Hematología',          'Víctor Manuel Hernández Montenegro'),
  ( 9, 'a_mariana_salvador@unilabor.mx',  '%Mariana%Salvador%',      'Responsable de Uroanálisis',          'Ada Karen Hernández Arias'),
  (10, 'a_francisco_suarez@unilabor.mx',  '%Francisco%Espejo%',      'Responsable de Uroanálisis',          'Ada Karen Hernández Arias'),
  (11, 'b_aranza_cruz@unilabor.mx',       '%Aranza%Cruz%',           'Responsable de Uroanálisis',          'Víctor Manuel Hernández Montenegro'),
  (12, 'b_claudia_romero@unilabor.mx',    '%Claudia%Romero%',        'Responsable de Uroanálisis',          'Víctor Manuel Hernández Montenegro'),
  (13, 'analiticos.centro@unilabor.mx',   '%Ada Karen%Hern%ndez%',   'Responsable de Uroanálisis',          'Víctor Manuel Hernández Montenegro'),
  (14, 'direccion.general@unilabor.mx',   '%Guillermo%Priego%',      'Responsable de Uroanálisis',          'Ada Karen Hernández Arias'),
  (15, 'analiticos.cide@unilabor.mx',     '%Victor%Montenegro%',     'Responsable de Uroanálisis',          'Ada Karen Hernández Arias'),
  (16, 'a_dulce_maria@unilabor.mx',       '%Dulce%Bernat%',          'Responsable de Química Clínica',      'Ada Karen Hernández Arias'),
  (17, 'a_david_carballo@unilabor.mx',    '%David%Carballo%',        'Responsable de Química Clínica',      'Ada Karen Hernández Arias'),
  (18, 'a_beatriz_izquierdo@unilabor.mx', '%Beatriz%Izquierdo%',     'Responsable de Química Clínica',      'Ada Karen Hernández Arias'),
  (19, 'analiticos.centro@unilabor.mx',   '%Ada Karen%Hern%ndez%',   'Responsable de Química Clínica',      'Víctor Manuel Hernández Montenegro'),
  (20, 'direccion.general@unilabor.mx',   '%Guillermo%Priego%',      'Responsable de Química Clínica',      'Ada Karen Hernández Arias'),
  (21, 'analiticos.cide@unilabor.mx',     '%Victor%Montenegro%',     'Responsable de Química Clínica',      'Ada Karen Hernández Arias'),
  (22, 'b_aranza_cruz@unilabor.mx',       '%Aranza%Cruz%',           'Responsable de Química Clínica',      'Víctor Manuel Hernández Montenegro'),
  (23, 'b_miguel_angel@unilabor.mx',      '%Miguel%Flores%',         'Responsable de Química Clínica',      'Víctor Manuel Hernández Montenegro'),
  (24, 'a_karen_yesseli@unilabor.mx',     '%Karen Yesseli%',         'Responsable de Inmunología Especial', 'Ada Karen Hernández Arias'),
  (25, 'a_miriam_lopez@unilabor.mx',      '%Miriam%L%pez%',          'Responsable de Inmunología Especial', 'Ada Karen Hernández Arias'),
  (26, 'a_claudia_escudero@unilabor.mx',  '%Claudia%Escudero%',      'Responsable de Inmunología Especial', 'Ada Karen Hernández Arias'),
  (27, 'analiticos.centro@unilabor.mx',   '%Ada Karen%Hern%ndez%',   'Responsable de Inmunología Especial', 'Víctor Manuel Hernández Montenegro'),
  (28, 'direccion.general@unilabor.mx',   '%Guillermo%Priego%',      'Responsable de Inmunología Especial', 'Ada Karen Hernández Arias'),
  (29, 'a_dulce_maria@unilabor.mx',       '%Dulce%Bernat%',          'Responsable de Inmunología Especial', 'Ada Karen Hernández Arias'),
  (30, 'a_david_carballo@unilabor.mx',    '%David%Carballo%',        'Responsable de Inmunología Especial', 'Ada Karen Hernández Arias'),
  (31, 'a_beatriz_izquierdo@unilabor.mx', '%Beatriz%Izquierdo%',     'Responsable de Inmunología Especial', 'Ada Karen Hernández Arias');

CREATE TEMP TABLE _resultado (
  orden INT, colaborador TEXT, employee_id BIGINT, puesto TEXT, evaluador TEXT,
  resultado TEXT, evaluation_id BIGINT, plantilla_id BIGINT,
  n_competencia INT, n_desempeno INT
) ON COMMIT DROP;

DO $$
DECLARE
  r          RECORD;
  v_emp      BIGINT;
  v_emp_name TEXT;
  v_n        INT;
  v_pos      BIGINT;
  v_tpl      RECORD;
  v_existing BIGINT;
  v_new      BIGINT;
  v_actor    UUID;
  v_nc       INT;
  v_nd       INT;
BEGIN
  SELECT id INTO v_actor FROM public.users WHERE lower(email) = 'admin@unilabor.mx' LIMIT 1;

  FOR r IN SELECT * FROM _lista ORDER BY orden LOOP
    -- 1) Colaborador: por correo (expediente o usuario vinculado); si no, por nombre.
    SELECT count(DISTINCT e.id), min(e.id) INTO v_n, v_emp
      FROM public.employees e
      LEFT JOIN public.users u ON u.id = e.user_id
     WHERE e.is_active = TRUE
       AND (lower(e.email) = r.email OR lower(u.email) = r.email);
    IF v_n = 0 THEN
      SELECT count(*), min(e.id) INTO v_n, v_emp
        FROM public.employees e
       WHERE e.is_active = TRUE AND e.full_name ILIKE r.nombre_patron;
    END IF;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Fila %: colaborador % no encontrado o ambiguo (% coincidencias)', r.orden, r.email, v_n;
    END IF;
    SELECT full_name INTO v_emp_name FROM public.employees WHERE id = v_emp;

    -- 2) Puesto.
    SELECT id INTO v_pos FROM public.rh_positions WHERE name = r.puesto AND is_active = TRUE;
    IF v_pos IS NULL THEN
      RAISE EXCEPTION 'Fila %: puesto "%" no existe o esta inactivo', r.orden, r.puesto;
    END IF;

    -- 3) Ya evaluado en ese puesto -> no tocar.
    SELECT id INTO v_existing FROM public.rh_competency_evaluations
     WHERE employee_id = v_emp AND position_id = v_pos ORDER BY id DESC LIMIT 1;
    IF v_existing IS NOT NULL THEN
      INSERT INTO _resultado VALUES (r.orden, v_emp_name, v_emp, r.puesto, r.evaluador,
        'OMITIDO (ya existe)', v_existing, NULL, NULL, NULL);
      CONTINUE;
    END IF;

    -- 4) Plantilla del puesto: borrador con mas competencias capturadas.
    SELECT ev.id, ev.evaluation_type, ev.created_by_user_id INTO v_tpl
      FROM public.rh_competency_evaluations ev
      JOIN public.rh_competency_evaluation_items i
        ON i.evaluation_id = ev.id AND i.section = 'COMPETENCIA'
     WHERE ev.position_id = v_pos AND ev.status = 'DRAFT'
       AND ev.id NOT IN (SELECT evaluation_id FROM _resultado WHERE evaluation_id IS NOT NULL
                                                             AND resultado LIKE 'CREADO%')
     GROUP BY ev.id
    HAVING count(*) FILTER (WHERE i.method IS NOT NULL OR i.observations IS NOT NULL) > 0
     ORDER BY count(*) FILTER (WHERE i.method IS NOT NULL OR i.observations IS NOT NULL) DESC, ev.id DESC
     LIMIT 1;

    INSERT INTO public.rh_competency_evaluations
      (employee_id, position_id, evaluation_type, evaluation_date, evaluator_name,
       reference_course_id, reference_course_date, created_by_user_id)
    VALUES (v_emp, v_pos, COALESCE(v_tpl.evaluation_type, 'POST_CAPACITACION'), CURRENT_DATE, r.evaluador,
            NULL, NULL,
            COALESCE(v_tpl.created_by_user_id,
                     (SELECT id FROM public.users WHERE lower(email) = 'recursos.humanos@unilabor.mx' LIMIT 1)))
    RETURNING id INTO v_new;

    IF v_tpl.id IS NOT NULL THEN
      INSERT INTO public.rh_competency_evaluation_items
        (evaluation_id, section, item_text, criticality, method, score, observations, sort_order)
      SELECT v_new, i.section, i.item_text, i.criticality,
             CASE WHEN i.section = 'COMPETENCIA' THEN i.method END,
             NULL, i.observations, i.sort_order
        FROM public.rh_competency_evaluation_items i
       WHERE i.evaluation_id = v_tpl.id AND i.section IN ('COMPETENCIA', 'DESEMPENO')
       ORDER BY i.section, i.sort_order, i.id;
    ELSE
      -- Sin plantilla: misma precarga que createEvaluation() de la app.
      INSERT INTO public.rh_competency_evaluation_items (evaluation_id, section, item_text, criticality, sort_order)
      SELECT v_new, 'COMPETENCIA', competency_text, criticality, sort_order
        FROM public.rh_position_competencies WHERE position_id = v_pos ORDER BY sort_order, id;
      INSERT INTO public.rh_competency_evaluation_items (evaluation_id, section, item_text, criticality, sort_order)
      SELECT v_new, 'DESEMPENO', criterion_text, criticality, sort_order
        FROM public.rh_performance_criteria WHERE is_active = TRUE ORDER BY sort_order, id;
    END IF;

    SELECT count(*) FILTER (WHERE section = 'COMPETENCIA'), count(*) FILTER (WHERE section = 'DESEMPENO')
      INTO v_nc, v_nd FROM public.rh_competency_evaluation_items WHERE evaluation_id = v_new;

    IF v_actor IS NOT NULL THEN
      INSERT INTO public.access_logs (user_id, action, module_code, entity_type, entity_id, metadata)
      VALUES (v_actor, 'RH_COMP_EVAL_CREATE:' || v_new, 'RH', 'competency_evaluation', v_new,
              jsonb_build_object('origen', 'Carga de borradores desde Listado.xlsx (2026-09-30)',
                                 'plantilla_evaluation_id', v_tpl.id, 'employee_id', v_emp,
                                 'position_id', v_pos));
    END IF;

    INSERT INTO _resultado VALUES (r.orden, v_emp_name, v_emp, r.puesto, r.evaluador,
      CASE WHEN v_tpl.id IS NULL THEN 'CREADO (catalogo, sin plantilla)' ELSE 'CREADO' END,
      v_new, v_tpl.id, v_nc, v_nd);
    v_tpl := NULL;
  END LOOP;
END $$;

SELECT * FROM _resultado ORDER BY orden;

SELECT resultado, count(*) FROM _resultado GROUP BY resultado ORDER BY resultado;

COMMIT;
