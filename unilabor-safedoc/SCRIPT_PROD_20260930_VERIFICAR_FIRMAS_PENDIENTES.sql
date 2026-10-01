-- =============================================================================
-- Verificacion (SOLO LECTURA) de "Reabrir firmas pendientes" (deploy c498eee).
-- Ejecutar cada consulta por separado en pgAdmin (seleccionarla + F5).
-- =============================================================================

-- 1) Candidatos: inscritos con fase APROBADA y documentos sin firmar
--    (son los que el Tablero marca "Aprobo con documentos sin firmar").
SELECT ph.phase_number AS fase, e.id AS inscripcion, emp.full_name, u.email,
       count(*) FILTER (WHERE a.status <> 'signed') AS sin_firmar,
       count(*) FILTER (WHERE a.status = 'expired') AS vencidos,
       count(*) AS total
  FROM public.rh_induction_enrollments e
  JOIN public.rh_induction_phases ph ON ph.id = e.phase_id
  JOIN public.employees emp ON emp.id = e.employee_id
  LEFT JOIN public.users u ON u.id = emp.user_id
  JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
  JOIN public.rh_induction_reading_items ri ON ri.enrollment_id = e.id
  JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
 WHERE ea.status = 'passed'
 GROUP BY ph.phase_number, e.id, emp.full_name, u.email
HAVING count(*) FILTER (WHERE a.status <> 'signed') > 0
 ORDER BY ph.phase_number, emp.full_name;

-- 2) Despues de pulsar "Reabrir firmas pendientes" a alguien: reaperturas
--    registradas en modo firmas pendientes (esperado: una fila por reapertura).
SELECT l.accessed_at, u.email AS rh, l.entity_id AS inscripcion,
       l.metadata ->> 'mode' AS modo, l.metadata ->> 'hours' AS horas,
       l.metadata ->> 'acknowledgements_reactivated' AS acuses
  FROM public.access_logs l
  LEFT JOIN public.users u ON u.id = l.user_id
 WHERE l.action LIKE 'RH_INDUCTION_READING_REOPENED:%'
   AND l.metadata ->> 'mode' = 'PENDING_SIGNATURES'
 ORDER BY l.id DESC;

-- 3) Estado de los acuses de una inscripcion reabierta (cambiar el 0 por el id
--    de la inscripcion). Esperado tras reabrir: pending/in_progress/read con
--    deadline futuro; tras firmar: signed. La evaluacion debe seguir 'passed'.
SELECT a.id AS acuse, p.title_snapshot, a.status, a.deadline_at, a.signed_at,
       ea.status AS evaluacion, e.reading_completed_at
  FROM public.rh_induction_reading_items ri
  JOIN public.rh_induction_enrollments e ON e.id = ri.enrollment_id
  JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
  JOIN public.quality_reading_publications p ON p.id = a.publication_id
  LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
 WHERE ri.enrollment_id = 0
 ORDER BY a.id;
