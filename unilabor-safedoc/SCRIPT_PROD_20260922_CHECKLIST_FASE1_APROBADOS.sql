-- =============================================================================
-- SCRIPT PROD 2026-09-22: marcar el Checklist de contenidos de la Fase 1 de
-- Induccion como COMPLETO para todos los colaboradores inscritos que ya
-- APROBARON la fase (evaluacion en estado 'passed').
--
-- Autor de las marcas: recursos.humanos@unilabor.mx (completed_by_user_id).
-- Idempotente: solo inserta las marcas que faltan (ON CONFLICT DO NOTHING
-- sobre ux_rh_induction_checklist_progress); no borra ni modifica nada.
-- No toca inscripciones en evaluacion (grading), vencidas ni reprobadas.
--
-- Ejecutar completo en pgAdmin (Query Tool) sobre la BD de produccion.
-- Al final imprime el resumen por colaborador; si algo no cuadra: ROLLBACK.
-- =============================================================================
BEGIN;

-- 1) Prerrequisitos: la fase 1, la cuenta RH y el catalogo de contenidos.
DO $$
DECLARE
  v_phase_id BIGINT;
  v_user_id  UUID;
  v_items    INT;
BEGIN
  SELECT id INTO v_phase_id FROM public.rh_induction_phases WHERE phase_number = 1;
  IF v_phase_id IS NULL THEN
    RAISE EXCEPTION 'No existe la Fase 1 de Induccion.';
  END IF;

  SELECT id INTO v_user_id FROM public.users
   WHERE lower(email) = 'recursos.humanos@unilabor.mx' AND is_active = TRUE;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe (o esta inactiva) la cuenta recursos.humanos@unilabor.mx.';
  END IF;

  SELECT COUNT(*) INTO v_items FROM public.rh_induction_phase_checklist_items WHERE phase_id = v_phase_id;
  IF v_items = 0 THEN
    RAISE EXCEPTION 'La Fase 1 no tiene contenidos en el checklist; nada que marcar.';
  END IF;

  RAISE NOTICE 'Fase 1 id=% | usuario RH=% | contenidos en checklist=%', v_phase_id, v_user_id, v_items;
END $$;

-- 2) ANTES: inscritos aprobados de Fase 1 y marcas que ya tenian.
SELECT
  COUNT(*)                                   AS aprobados_fase1,
  SUM(CASE WHEN done.n = items.n THEN 1 ELSE 0 END) AS ya_completos,
  SUM(items.n - done.n)                      AS marcas_por_insertar
FROM public.rh_induction_enrollments e
JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 1
JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id AND ea.status = 'passed'
CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = p.id) items
CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM public.rh_induction_checklist_progress cp WHERE cp.enrollment_id = e.id) done;

-- 3) INSERTAR las marcas faltantes (fecha = ahora, autor = cuenta RH).
INSERT INTO public.rh_induction_checklist_progress (enrollment_id, checklist_item_id, completed_at, completed_by_user_id)
SELECT e.id, ci.id, NOW(), u.id
FROM public.rh_induction_enrollments e
JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 1
JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id AND ea.status = 'passed'
JOIN public.rh_induction_phase_checklist_items ci ON ci.phase_id = p.id
CROSS JOIN (SELECT id FROM public.users WHERE lower(email) = 'recursos.humanos@unilabor.mx' AND is_active = TRUE) u
ON CONFLICT (enrollment_id, checklist_item_id) DO NOTHING;

-- 4) DESPUES: todos los aprobados deben quedar con checklist completo
--    (pendientes_total debe ser 0).
SELECT
  COUNT(*)                                          AS aprobados_fase1,
  SUM(CASE WHEN done.n = items.n THEN 1 ELSE 0 END) AS completos,
  SUM(items.n - done.n)                             AS pendientes_total
FROM public.rh_induction_enrollments e
JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 1
JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id AND ea.status = 'passed'
CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = p.id) items
CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM public.rh_induction_checklist_progress cp WHERE cp.enrollment_id = e.id) done;

-- 5) Detalle por colaborador (para el registro de la sesion).
SELECT emp.full_name, ea.percentage AS calificacion, done.n AS marcados, items.n AS contenidos
FROM public.rh_induction_enrollments e
JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 1
JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id AND ea.status = 'passed'
JOIN public.employees emp ON emp.id = e.employee_id
CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = p.id) items
CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM public.rh_induction_checklist_progress cp WHERE cp.enrollment_id = e.id) done
ORDER BY emp.full_name;

COMMIT;
