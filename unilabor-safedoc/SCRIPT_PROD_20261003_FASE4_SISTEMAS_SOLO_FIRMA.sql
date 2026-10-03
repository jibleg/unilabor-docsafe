-- =============================================================================
-- INDUCCION FASE 4: EXENTAR DE LECTURA AL RESPONSABLE DE LA FASE (pgAdmin, prod)
-- =============================================================================
-- Caso (2026-10-03): sistemas@unilabor.mx es el responsable de la Fase 4
-- ("Sistema informatico del laboratorio") y autor de los 4 documentos SIL-* que
-- la componen. Esta inscrito en la fase como cualquier colaborador, asi que el
-- sistema le exige recorrer pagina por pagina los 4 documentos (104+22+20+27
-- paginas) antes de poder firmarlos. Releer lo que el mismo escribio no aporta;
-- la FIRMA si: es la evidencia de acuse (ISO 15189) y es lo que abre la
-- evaluacion de la fase.
--
-- Que hace, para la inscripcion del usuario en la fase indicada:
--   1. Marca sus acuses de Sala de Lectura como LEIDOS (status 'read'): es el
--      unico estado en el que el servidor acepta la firma y en el que
--      "Mis lecturas" muestra el boton "Firmar" directo (sin abrir el visor).
--      Para pasar el gate se registran todas las paginas en pages_seen y
--      read_completed_at = ahora. El tiempo activo (active_seconds) NO se
--      inventa: queda el real, asi la hoja anexa refleja fielmente que la
--      lectura fue exentada y no simulada.
--   2. Garantiza que el plazo no venza antes de firmar: deadline_at de los
--      acuses y reading_deadline_at de la inscripcion quedan al menos en
--      NOW() + N horas (si ya eran mayores, no se tocan).
--   3. Deja rastro en access_logs (RH_INDUCTION_READING_EXEMPTED:<enrollment>)
--      con el motivo, los acuses afectados y las paginas acreditadas.
--
-- Que NO hace: no firma por el (la firma autografa la pone el en la app), no
-- abre ni toca la evaluacion, no modifica a ningun otro inscrito ni fase, y no
-- envia avisos. Al firmar el 4o documento el propio sistema marca la lectura
-- completa y abre el cuestionario (refreshEnrollmentReadingStatus).
--
-- Condiciones para ejecutar (si no se cumplen, el bloque DO aborta con un
-- mensaje claro y no cambia nada):
--   - El usuario existe, tiene expediente ligado y una inscripcion en la fase.
--   - La inscripcion no tiene lectura completa ni evaluacion abierta.
--   - Los acuses estan en pending / in_progress / expired (los 'signed' se
--     respetan y se cuentan como ya hechos).
--
-- USO: ajusta los parametros del bloque DO (v_email, v_phase_number, v_hours),
--      revisa la VISTA PREVIA y ejecuta TODO el script. Termina en COMMIT;
--      si el resumen no es el esperado, sustituye COMMIT por ROLLBACK.
-- =============================================================================

-- ============================ VISTA PREVIA ==================================
-- Inscripcion y acuses del usuario en la fase (solo consulta).
SELECT e.id              AS enrollment_id,
       p.phase_number,
       p.name            AS fase,
       emp.employee_code,
       emp.full_name,
       e.reading_completed_at,
       e.reading_deadline_at,
       e.evaluation_assignment_id,
       (SELECT count(*) FROM public.rh_induction_reading_items ri WHERE ri.enrollment_id = e.id) AS docs_total,
       (SELECT count(*) FROM public.rh_induction_reading_items ri
          JOIN public.quality_reading_acknowledgements q ON q.id = ri.acknowledgement_id
         WHERE ri.enrollment_id = e.id AND q.status = 'signed') AS docs_firmados
  FROM public.rh_induction_enrollments e
  JOIN public.rh_induction_phases p ON p.id = e.phase_id
  JOIN public.employees emp ON emp.id = e.employee_id
  JOIN public.users u ON u.id = emp.user_id
 WHERE u.email = 'sistemas@unilabor.mx'          -- <== v_email
   AND p.phase_number = 4;                       -- <== v_phase_number

SELECT q.id              AS acknowledgement_id,
       d.code            AS documento,
       pub.title_snapshot,
       q.status,
       q.pages_total,
       cardinality(q.pages_seen) AS paginas_acreditadas,
       q.active_seconds,
       q.deadline_at,
       up.email          AS subido_por
  FROM public.rh_induction_enrollments e
  JOIN public.rh_induction_phases p ON p.id = e.phase_id
  JOIN public.employees emp ON emp.id = e.employee_id
  JOIN public.users u ON u.id = emp.user_id
  JOIN public.rh_induction_reading_items ri ON ri.enrollment_id = e.id
  JOIN public.quality_reading_acknowledgements q ON q.id = ri.acknowledgement_id
  JOIN public.quality_reading_publications pub ON pub.id = q.publication_id
  JOIN public.documents d ON d.id = ri.document_id
  LEFT JOIN public.users up ON up.id = d.uploaded_by
 WHERE u.email = 'sistemas@unilabor.mx'          -- <== v_email
   AND p.phase_number = 4                        -- <== v_phase_number
 ORDER BY q.id;

-- ============================ EJECUCION =====================================
BEGIN;

DO $$
DECLARE
  -- ---------- PARAMETROS ----------
  v_email        TEXT    := 'sistemas@unilabor.mx';
  v_phase_number INTEGER := 4;
  v_hours        INTEGER := 72;   -- plazo minimo que se garantiza para firmar
  v_reason       TEXT    := 'Responsable de la fase y autor de los documentos: se exenta la relectura; la firma de acuse se conserva como evidencia.';
  -- --------------------------------
  v_user_id       UUID;
  v_employee_id   BIGINT;
  v_enrollment_id BIGINT;
  v_phase_id      BIGINT;
  v_reading_completed_at TIMESTAMPTZ;
  v_assignment_id BIGINT;
  v_prev_deadline TIMESTAMPTZ;
  v_new_deadline  TIMESTAMPTZ := NOW() + make_interval(hours => v_hours);
  v_total         INTEGER;
  v_signed        INTEGER;
  v_exempted      INTEGER;
  v_pages         INTEGER;
  v_ack_ids       BIGINT[];
BEGIN
  -- Usuario y expediente.
  SELECT u.id, emp.id INTO v_user_id, v_employee_id
    FROM public.users u
    LEFT JOIN public.employees emp ON emp.user_id = u.id
   WHERE u.email = v_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe el usuario %', v_email;
  END IF;
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'El usuario % no tiene expediente (employees.user_id) ligado', v_email;
  END IF;

  -- Inscripcion en la fase (se bloquea la fila).
  SELECT e.id, e.phase_id, e.reading_completed_at, e.evaluation_assignment_id, e.reading_deadline_at
    INTO v_enrollment_id, v_phase_id, v_reading_completed_at, v_assignment_id, v_prev_deadline
    FROM public.rh_induction_enrollments e
    JOIN public.rh_induction_phases p ON p.id = e.phase_id
   WHERE e.employee_id = v_employee_id AND p.phase_number = v_phase_number
   ORDER BY e.created_at DESC
   LIMIT 1
   FOR UPDATE OF e;
  IF v_enrollment_id IS NULL THEN
    RAISE EXCEPTION 'El usuario % no esta inscrito en la Fase %', v_email, v_phase_number;
  END IF;
  IF v_reading_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'La inscripcion % ya tiene la lectura completa (%): nada que exentar', v_enrollment_id, v_reading_completed_at;
  END IF;
  IF v_assignment_id IS NOT NULL THEN
    RAISE EXCEPTION 'La inscripcion % ya tiene evaluacion abierta (assignment %): usa el flujo de firmas pendientes', v_enrollment_id, v_assignment_id;
  END IF;

  -- Acuses de la inscripcion.
  SELECT count(*),
         count(*) FILTER (WHERE q.status = 'signed'),
         array_agg(q.id ORDER BY q.id) FILTER (WHERE q.status IN ('pending', 'in_progress', 'expired')),
         COALESCE(sum(q.pages_total) FILTER (WHERE q.status IN ('pending', 'in_progress', 'expired')), 0)
    INTO v_total, v_signed, v_ack_ids, v_pages
    FROM public.rh_induction_reading_items ri
    JOIN public.quality_reading_acknowledgements q ON q.id = ri.acknowledgement_id
   WHERE ri.enrollment_id = v_enrollment_id;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'La inscripcion % no tiene lecturas asignadas (fase en borrador?)', v_enrollment_id;
  END IF;
  IF v_ack_ids IS NULL THEN
    RAISE EXCEPTION 'La inscripcion % no tiene acuses pendientes de lectura (% firmados de %)', v_enrollment_id, v_signed, v_total;
  END IF;

  -- 1) Acuses -> 'read' con todas las paginas acreditadas. active_seconds se
  --    conserva tal cual (evidencia fiel de la exencion).
  UPDATE public.quality_reading_acknowledgements q
     SET status            = 'read',
         started_at        = COALESCE(q.started_at, NOW()),
         read_completed_at = NOW(),
         pages_seen        = ARRAY(SELECT generate_series(1, q.pages_total)),
         current_page      = q.pages_total,
         last_progress_at  = NOW(),
         deadline_at       = GREATEST(q.deadline_at, v_new_deadline),
         updated_at        = NOW()
   WHERE q.id = ANY (v_ack_ids)
     AND q.status IN ('pending', 'in_progress', 'expired');
  GET DIAGNOSTICS v_exempted = ROW_COUNT;

  -- 2) Plazo de la inscripcion: nunca antes del nuevo limite de los acuses.
  UPDATE public.rh_induction_enrollments
     SET reading_deadline_at = GREATEST(COALESCE(reading_deadline_at, v_new_deadline), v_new_deadline),
         updated_at = NOW()
   WHERE id = v_enrollment_id;

  -- 3) Auditoria (mismo formato que los eventos del modulo RH).
  INSERT INTO public.access_logs (user_id, action, module_code, entity_type, entity_id, employee_id, metadata)
  VALUES (
    v_user_id,
    'RH_INDUCTION_READING_EXEMPTED:' || v_enrollment_id,
    'RH',
    'induction_enrollment',
    v_enrollment_id,
    v_employee_id,
    jsonb_build_object(
      'mode', 'READING_EXEMPTED',
      'reason', v_reason,
      'phase_number', v_phase_number,
      'acknowledgement_ids', to_jsonb(v_ack_ids),
      'acknowledgements_exempted', v_exempted,
      'pages_credited', v_pages,
      'reading_total', v_total,
      'reading_signed_before', v_signed,
      'hours', v_hours,
      'previous_deadline_at', v_prev_deadline,
      'new_deadline_at', GREATEST(COALESCE(v_prev_deadline, v_new_deadline), v_new_deadline),
      'source', 'SCRIPT_PROD_20261003_FASE4_SISTEMAS_SOLO_FIRMA.sql'
    )
  );

  RAISE NOTICE 'Inscripcion %: % acuses exentados de lectura (% ya firmados de %), % paginas acreditadas, plazo minimo %',
    v_enrollment_id, v_exempted, v_signed, v_total, v_pages, v_new_deadline;
END $$;

-- Resumen de lo aplicado: los 4 acuses deben salir en 'read', con todas las
-- paginas acreditadas y plazo vigente. En "Mis lecturas" el usuario vera el
-- boton "Firmar" en cada uno.
SELECT q.id AS acknowledgement_id,
       d.code AS documento,
       q.status,
       q.pages_total,
       cardinality(q.pages_seen) AS paginas_acreditadas,
       q.active_seconds,
       q.read_completed_at,
       q.deadline_at,
       e.reading_deadline_at AS limite_inscripcion
  FROM public.rh_induction_enrollments e
  JOIN public.rh_induction_phases p ON p.id = e.phase_id
  JOIN public.employees emp ON emp.id = e.employee_id
  JOIN public.users u ON u.id = emp.user_id
  JOIN public.rh_induction_reading_items ri ON ri.enrollment_id = e.id
  JOIN public.quality_reading_acknowledgements q ON q.id = ri.acknowledgement_id
  JOIN public.documents d ON d.id = ri.document_id
 WHERE u.email = 'sistemas@unilabor.mx'          -- <== v_email
   AND p.phase_number = 4                        -- <== v_phase_number
 ORDER BY q.id;

SELECT action, accessed_at, metadata
  FROM public.access_logs
 WHERE action LIKE 'RH_INDUCTION_READING_EXEMPTED:%'
 ORDER BY id DESC
 LIMIT 1;

COMMIT;
-- Si el resumen no es el esperado, sustituye COMMIT por ROLLBACK y revisa.
