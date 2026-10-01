-- =============================================================================
-- Induccion Fases 5 y 6: habilitar puestos + firmas de constancia por puesto
-- y baja de 2 colaboradores genericos.
--
-- Decisiones del usuario (2026-10-01):
--   A. Se desactivan los colaboradores genericos sin puesto:
--      id 19 "Asesor en Calidad" (AC) e id 20 "Colaborador" (CA).
--      Igual que el boton de la UI (employees.is_active = FALSE + auditoria
--      RH_EMPLOYEE_DELETE:<id>). Sus usuarios de sistema NO se tocan.
--   B. Se habilitan por puesto, igual que "Habilitar puesto" de la UI
--      (curso INDUCCION-FASE-{5|6}-{CODIGO} + puente rh_induction_phase_positions):
--        Fase 5: 26 puestos con colaboradores Y documentos obligatorios.
--                (SGEN, CHOF, ACON, VTA quedan fuera: sin documentos, decision
--                 pendiente del usuario.)
--        Fase 6: los 30 puestos con colaboradores.
--      Los 8 puestos sin colaboradores (ACEN, ASDM, CSE, LAV, RAND, REE, RPAR,
--      RTOX) no se habilitan todavia.
--   C. Constancia de cada curso por puesto: plantilla copiada de la Fase 4
--      (logo, orientacion) con SOLO 2 firmas: Ursula Guadalupe Mendez Cuevas
--      (Coordinador de Recursos Humanos) y Guillermo Priego Hernandez
--      (Director General), mismas imagenes de firma que la Fase 4.
--      Si el curso ya tiene firmas capturadas por RH, NO se toca.
--
-- NO publica fases, NO crea evaluaciones (RH las disena en Capacitaciones),
-- NO cambia duracion/responsable/limite de lectura.
--
-- Seguridad: UNA transaccion; valida puestos, fases y firmantes y aborta si
-- algo no cuadra. Solo INSERT/UPDATE idempotentes => re-ejecutable.
-- Ejecutar completo: psql -v ON_ERROR_STOP=1 -f <archivo>  (o pgAdmin).
-- Ensayo sin cambios: sustituir el COMMIT final por ROLLBACK.
-- Compatible con PostgreSQL 10.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE _habilitar (
  fase          INT  NOT NULL,
  puesto_codigo TEXT NOT NULL,
  PRIMARY KEY (fase, puesto_codigo)
) ON COMMIT DROP;

INSERT INTO _habilitar (fase, puesto_codigo)
SELECT 5, unnest(ARRAY[
  'RA','AN-B','FLEB','RQC','AN-A','AN-C','CPA','RHEM','AP','CUST','RIES','RURO','ALM',
  'AUXA','CAF','CCM','CPP','CRH','CSGC','CSI','DG','MNT','RIRU','RMIC','RSUB','SBIO'])
UNION ALL
SELECT 6, unnest(ARRAY[
  'RA','AN-B','FLEB','RQC','AN-A','AN-C','CPA','RHEM','AP','CUST','RIES','RURO','ALM',
  'AUXA','CAF','CCM','CPP','CRH','CSGC','CSI','DG','MNT','RIRU','RMIC','RSUB','SBIO',
  'SGEN','CHOF','ACON','VTA']);

-- Firmas a copiar desde la plantilla de constancia de la Fase 4
CREATE TEMP TABLE _firmas ON COMMIT DROP AS
SELECT s.signatory_name, s.role, s.signature_image_path,
       CASE WHEN s.signatory_name ILIKE 'Ursula%' THEN 0 ELSE 1 END AS sort_order,
       ct.logo_path, ct.orientation, ct.show_folio
  FROM public.rh_induction_phases p
  JOIN public.certificate_templates ct ON ct.training_course_id = p.training_course_id
  JOIN public.certificate_template_signatures s ON s.certificate_template_id = ct.id
 WHERE p.phase_number = 4
   AND (s.signatory_name ILIKE 'Ursula Guadalupe M%ndez Cuevas'
        OR s.signatory_name ILIKE 'Guillermo Priego Hern%ndez');

-- Validaciones ----------------------------------------------------------------
DO $$
DECLARE
  v_txt TEXT;
  v_n   INT;
BEGIN
  SELECT string_agg(DISTINCT h.puesto_codigo, ', ') INTO v_txt
    FROM _habilitar h
   WHERE NOT EXISTS (SELECT 1 FROM public.rh_positions p
                      WHERE upper(p.code) = upper(h.puesto_codigo) AND p.is_active = TRUE);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Puestos inexistentes o inactivos: %', v_txt;
  END IF;

  SELECT count(*) INTO v_n FROM public.rh_induction_phases
   WHERE phase_number IN (5, 6) AND scope = 'POSITION';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'No se encontraron las Fases 5 y 6 con alcance POSITION.';
  END IF;

  SELECT count(*) INTO v_n FROM _firmas;
  IF v_n <> 2 OR (SELECT count(DISTINCT sort_order) FROM _firmas) <> 2 THEN
    RAISE EXCEPTION 'Se esperaban exactamente 2 firmas (Ursula y Guillermo) en la constancia de la Fase 4; hay %.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.employees
   WHERE (id = 19 AND employee_code = 'AC' AND full_name = 'Asesor en Calidad')
      OR (id = 20 AND employee_code = 'CA' AND full_name = 'Colaborador');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Los colaboradores 19 (AC) y 20 (CA) no coinciden con lo esperado; revisar antes de desactivar.';
  END IF;
END $$;

-- A. Baja de los 2 colaboradores genericos -----------------------------------
CREATE TEMP TABLE _bajas ON COMMIT DROP AS
SELECT id, full_name FROM public.employees WHERE id IN (19, 20) AND is_active = TRUE;

UPDATE public.employees e
   SET is_active = FALSE, updated_at = NOW()
  FROM _bajas b
 WHERE e.id = b.id;

INSERT INTO public.access_logs (user_id, action, module_code, entity_type, entity_id, employee_id, metadata)
SELECT u.id, 'RH_EMPLOYEE_DELETE:' || b.id, 'RH', 'employee', b.id, b.id,
       jsonb_build_object('origen', 'Script 2026-10-01: colaborador generico sin puesto')
  FROM _bajas b
  CROSS JOIN (SELECT id FROM public.users WHERE lower(email) = 'admin@unilabor.mx' LIMIT 1) u;

-- B. Habilitar puestos en Fases 5 y 6 ----------------------------------------
CREATE TEMP TABLE _objetivo ON COMMIT DROP AS
SELECT ph.id AS phase_id, ph.phase_number, ph.name AS phase_name,
       rp.id AS position_id, rp.code AS position_code, rp.name AS position_name,
       'INDUCCION-FASE-' || ph.phase_number || '-' || upper(rp.code) AS course_code
  FROM _habilitar h
  JOIN public.rh_induction_phases ph ON ph.phase_number = h.fase AND ph.scope = 'POSITION'
  JOIN public.rh_positions rp ON upper(rp.code) = upper(h.puesto_codigo);

-- Mismo titulo/descripcion que enablePhaseForPosition (rh-induction.service.ts)
INSERT INTO public.training_courses (code, title, description, certificate_validity_months)
SELECT o.course_code,
       'Fase ' || o.phase_number || ' - ' || o.phase_name || ' — ' || o.position_name,
       CASE WHEN o.phase_number = 5
            THEN 'Induccion tecnica del puesto ' || o.position_name || ': lectura de sus documentos obligatorios + cuestionario.'
            ELSE 'Capacitacion practica supervisada del puesto ' || o.position_name || ': RH captura la calificacion (0-10).'
       END,
       0
  FROM _objetivo o
ON CONFLICT (code) DO NOTHING;

CREATE TEMP TABLE _puente_nuevo ON COMMIT DROP AS
SELECT o.phase_id, o.position_id FROM _objetivo o
 WHERE NOT EXISTS (SELECT 1 FROM public.rh_induction_phase_positions pp
                    WHERE pp.phase_id = o.phase_id AND pp.position_id = o.position_id);

INSERT INTO public.rh_induction_phase_positions (phase_id, position_id, training_course_id, created_by_user_id)
SELECT o.phase_id, o.position_id, tc.id,
       (SELECT id FROM public.users WHERE lower(email) = 'admin@unilabor.mx' LIMIT 1)
  FROM _objetivo o
  JOIN _puente_nuevo n ON n.phase_id = o.phase_id AND n.position_id = o.position_id
  JOIN public.training_courses tc ON tc.code = o.course_code
ON CONFLICT (phase_id, position_id) DO NOTHING;

-- C. Plantilla de constancia + 2 firmas por curso -----------------------------
-- Curso efectivo = el del puente (si ya existia, puede no seguir el patron).
CREATE TEMP TABLE _cursos ON COMMIT DROP AS
SELECT o.phase_number, o.position_code, pp.training_course_id AS course_id, o.phase_name
  FROM _objetivo o
  JOIN public.rh_induction_phase_positions pp
    ON pp.phase_id = o.phase_id AND pp.position_id = o.position_id;

INSERT INTO public.certificate_templates (training_course_id, title_text, logo_path, orientation, show_folio)
SELECT c.course_id, 'Fase ' || c.phase_number || ' - ' || c.phase_name,
       f.logo_path, f.orientation, f.show_folio
  FROM _cursos c
  CROSS JOIN (SELECT logo_path, orientation, show_folio FROM _firmas LIMIT 1) f
ON CONFLICT (training_course_id) DO NOTHING;

CREATE TEMP TABLE _sin_firmas ON COMMIT DROP AS
SELECT ct.id AS template_id
  FROM _cursos c
  JOIN public.certificate_templates ct ON ct.training_course_id = c.course_id
 WHERE NOT EXISTS (SELECT 1 FROM public.certificate_template_signatures s
                    WHERE s.certificate_template_id = ct.id);

INSERT INTO public.certificate_template_signatures
       (certificate_template_id, signatory_name, role, signature_image_path, sort_order)
SELECT t.template_id, f.signatory_name, f.role, f.signature_image_path, f.sort_order
  FROM _sin_firmas t
  CROSS JOIN _firmas f;

-- Reporte ---------------------------------------------------------------------
SELECT 'Colaboradores desactivados' AS concepto, count(*)::TEXT AS valor FROM _bajas
UNION ALL SELECT 'Puestos habilitados nuevos (F5+F6)', count(*)::TEXT FROM _puente_nuevo
UNION ALL SELECT 'Plantillas que recibieron firmas', count(*)::TEXT FROM _sin_firmas;

SELECT c.phase_number AS fase, c.position_code AS puesto, tc.code AS curso,
       (SELECT string_agg(s.signatory_name, ' / ' ORDER BY s.sort_order)
          FROM public.certificate_templates ct
          JOIN public.certificate_template_signatures s ON s.certificate_template_id = ct.id
         WHERE ct.training_course_id = c.course_id) AS firmas,
       (SELECT string_agg(t.evaluation_type || ':' || t.status, ', ')
          FROM public.evaluation_templates t
         WHERE t.training_course_id = c.course_id AND t.is_active) AS evaluacion
  FROM _cursos c
  JOIN public.training_courses tc ON tc.id = c.course_id
 ORDER BY c.phase_number, c.position_code;

COMMIT;
