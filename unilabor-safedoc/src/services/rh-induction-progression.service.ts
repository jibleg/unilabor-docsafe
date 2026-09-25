import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { enrollEmployeeInPhase } from './rh-induction.service';
import type { RhInductionEnrollmentOrigin } from './rh-induction.service';

// -----------------------------------------------------------------------------
// Induccion: progresion autonoma de las Fases 1-4 (a ritmo del colaborador).
//
// Regla: cuando el colaborador ACREDITA la evaluacion de la fase institucional
// N y la fase tiene encendido "Avanzar automaticamente al aprobar", el sistema
// lo inscribe en la fase N+1 con su propio limite de lectura y ventana de
// examen desde ese momento. Si N+1 sigue en borrador, la inscripcion queda en
// espera y recibe lecturas al publicar (flujo ya existente). Nunca se brinca el
// candado "no se avanza sin aprobar la anterior": lo sigue validando
// enrollEmployeeInPhase.
//
// La progresion termina en la Fase 4. Las Fases 5-7 (por puesto) no participan
// y no se tocan.
//
// Puntos de disparo (todos best-effort, idempotentes):
//   1. Gancho al emitir la constancia de una evaluacion acreditada.
//   2. Auto-sanado al consultar el progreso del colaborador (Mi induccion / RH).
//   3. Reconciliacion al publicar una fase o desde el tablero ("Sincronizar").
//   4. Avance manual por inscrito desde el tablero.
// -----------------------------------------------------------------------------

const LAST_INSTITUTIONAL_PHASE = 4;

const SYSTEM_ACTOR_EMAIL = (process.env.RH_INDUCTION_CHECKLIST_AUTHOR_EMAIL ?? 'recursos.humanos@unilabor.mx')
  .trim()
  .toLowerCase();

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface InductionAdvanceResult {
  employee_id: number;
  employee_name: string;
  from_enrollment_id: number;
  from_phase_number: number;
  to_phase_id: number;
  to_phase_number: number;
  to_enrollment_id: number;
  to_phase_published: boolean;
  /** Horas de descanso aplicadas antes de activar las lecturas (0 = arranque inmediato). */
  grace_hours: number;
  origin: RhInductionEnrollmentOrigin;
}

export interface InductionReconcileResult {
  phase_id: number;
  phase_number: number;
  candidates: number;
  advanced: number;
  skipped: Array<{ employee_id: number; full_name: string; reason: string }>;
}

interface PassedEnrollmentRow {
  enrollment_id: number;
  employee_id: number;
  employee_name: string;
  phase_number: number;
  supervisor_employee_id: number | null;
  auto_advance_on_pass: boolean;
}

interface NextPhaseRow {
  id: number;
  phase_number: number;
  published: boolean;
  grace_hours: number;
}

/**
 * Cuenta con la que se firman las inscripciones automaticas (misma que las
 * marcas automaticas del checklist). Si no existe, cae al primer superusuario
 * activo; y si tampoco, al actor que disparo la operacion.
 */
export const resolveInductionSystemActorId = async (fallbackUserId: string | null): Promise<string | null> => {
  const byEmail = await pool.query(
    `SELECT id FROM public.users WHERE lower(email) = $1 AND is_active = TRUE LIMIT 1;`,
    [SYSTEM_ACTOR_EMAIL],
  );
  if (byEmail.rows.length > 0) {
    return String(byEmail.rows[0].id);
  }
  if (fallbackUserId) {
    return fallbackUserId;
  }
  const admin = await pool.query(
    `SELECT id FROM public.users WHERE role = 'ADMIN' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1;`,
  );
  return admin.rows.length > 0 ? String(admin.rows[0].id) : null;
};

export const setPhaseAutoAdvance = async (phaseId: number, enabled: boolean): Promise<boolean> => {
  const phase = await pool.query(
    `SELECT scope, phase_number FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`,
    [phaseId],
  );
  if (phase.rows.length === 0) {
    return false;
  }
  if (String(phase.rows[0].scope) !== 'INSTITUTIONAL' || Number(phase.rows[0].phase_number) >= LAST_INSTITUTIONAL_PHASE) {
    throwCoded(
      'RH_INDUCTION_AUTO_ADVANCE_NOT_APPLICABLE',
      'El avance automatico solo aplica a las Fases 1 a 3 (la Fase 4 cierra el bloque institucional).',
    );
  }
  const result = await pool.query(
    `UPDATE public.rh_induction_phases SET auto_advance_on_pass = $2, updated_at = NOW() WHERE id = $1;`,
    [phaseId, enabled],
  );
  return (result.rowCount ?? 0) > 0;
};

const findNextInstitutionalPhase = async (phaseNumber: number): Promise<NextPhaseRow | null> => {
  if (phaseNumber >= LAST_INSTITUTIONAL_PHASE) {
    return null;
  }
  const result = await pool.query(
    `SELECT id, phase_number, published_at IS NOT NULL AS published, advance_grace_hours
       FROM public.rh_induction_phases
      WHERE scope = 'INSTITUTIONAL' AND phase_number = $1
      LIMIT 1;`,
    [phaseNumber + 1],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return {
    id: Number(result.rows[0].id),
    phase_number: Number(result.rows[0].phase_number),
    published: Boolean(result.rows[0].published),
    grace_hours: result.rows[0].advance_grace_hours ? Number(result.rows[0].advance_grace_hours) : 0,
  };
};

const isAlreadyEnrolled = async (employeeId: number, phaseId: number): Promise<boolean> => {
  const result = await pool.query(
    `SELECT 1 FROM public.rh_induction_enrollments WHERE employee_id = $1 AND phase_id = $2 LIMIT 1;`,
    [employeeId, phaseId],
  );
  return result.rows.length > 0;
};

const mapPassedRow = (row: any): PassedEnrollmentRow => ({
  enrollment_id: Number(row.enrollment_id),
  employee_id: Number(row.employee_id),
  employee_name: String(row.employee_name),
  phase_number: Number(row.phase_number),
  supervisor_employee_id: row.supervisor_employee_id ? Number(row.supervisor_employee_id) : null,
  auto_advance_on_pass: Boolean(row.auto_advance_on_pass),
});

const PASSED_ENROLLMENT_SELECT = `
  SELECT e.id AS enrollment_id, e.employee_id, emp.full_name AS employee_name, e.supervisor_employee_id,
         p.phase_number, p.auto_advance_on_pass
    FROM public.rh_induction_enrollments e
    JOIN public.rh_induction_phases p ON p.id = e.phase_id
    JOIN public.employees emp ON emp.id = e.employee_id
    JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
   WHERE p.scope = 'INSTITUTIONAL' AND p.phase_number < ${LAST_INSTITUTIONAL_PHASE}
     AND ea.status = 'passed' AND emp.is_active = TRUE`;

/**
 * Inscribe al colaborador en la fase siguiente a partir de una inscripcion
 * aprobada. Devuelve null si no hay fase siguiente o ya estaba inscrito.
 */
const advanceFromPassedEnrollment = async (
  passed: PassedEnrollmentRow,
  actorUserId: string | null,
  origin: RhInductionEnrollmentOrigin,
): Promise<InductionAdvanceResult | null> => {
  const next = await findNextInstitutionalPhase(passed.phase_number);
  if (!next) {
    return null;
  }
  if (await isAlreadyEnrolled(passed.employee_id, next.id)) {
    return null;
  }
  const actor = await resolveInductionSystemActorId(actorUserId);
  if (!actor) {
    throwCoded('RH_INDUCTION_SYSTEM_ACTOR_NOT_FOUND', 'No hay una cuenta activa con la que registrar el avance.');
  }
  // Descanso entre fases (regla de la fase destino): la inscripcion nace ya,
  // las lecturas/plazo/SMS se activan al terminar el descanso.
  const enrollment = await enrollEmployeeInPhase(passed.employee_id, next.id, actor as string, passed.supervisor_employee_id, {
    origin,
    advancedFromEnrollmentId: passed.enrollment_id,
    graceHours: next.grace_hours,
  });
  return {
    employee_id: passed.employee_id,
    employee_name: passed.employee_name,
    from_enrollment_id: passed.enrollment_id,
    from_phase_number: passed.phase_number,
    to_phase_id: next.id,
    to_phase_number: next.phase_number,
    to_enrollment_id: enrollment.id,
    to_phase_published: next.published,
    grace_hours: next.published ? next.grace_hours : 0,
    origin,
  };
};

/**
 * Gancho al acreditar: si la asignacion es la vigente de una inscripcion de
 * Induccion en fase 1-3 con el interruptor encendido, avanza al colaborador.
 */
export const advanceInductionAfterPass = async (assignmentId: number): Promise<InductionAdvanceResult | null> => {
  const result = await pool.query(`${PASSED_ENROLLMENT_SELECT} AND e.evaluation_assignment_id = $1 LIMIT 1;`, [
    assignmentId,
  ]);
  if (result.rows.length === 0) {
    return null;
  }
  const passed = mapPassedRow(result.rows[0]);
  if (!passed.auto_advance_on_pass) {
    return null;
  }
  return advanceFromPassedEnrollment(passed, null, 'AUTO_ADVANCE');
};

/** Version best-effort del gancho (nunca lanza): para llamarse desde otros motores. */
export const tryAdvanceInductionAfterPass = async (assignmentId: number): Promise<void> => {
  try {
    const advanced = await advanceInductionAfterPass(assignmentId);
    if (advanced) {
      console.info(
        `Induccion: ${advanced.employee_name} aprobo la Fase ${advanced.from_phase_number} y avanzo a la Fase ${advanced.to_phase_number}` +
          (advanced.to_phase_published ? '.' : ' (en espera de publicacion).'),
      );
    }
  } catch (error) {
    console.error(`No se pudo avanzar de fase de Induccion tras acreditar la evaluacion ${assignmentId}:`, error);
  }
};

/**
 * Auto-sanado por colaborador: avanza todas las fases aprobadas con
 * interruptor encendido que aun no tengan inscripcion en la siguiente
 * (cubre aprobaciones previas al interruptor o ganchos que fallaron).
 */
export const advanceEmployeeIfEligible = async (employeeId: number): Promise<InductionAdvanceResult[]> => {
  const result = await pool.query(
    `${PASSED_ENROLLMENT_SELECT} AND e.employee_id = $1 AND p.auto_advance_on_pass = TRUE ORDER BY p.phase_number ASC;`,
    [employeeId],
  );
  const advanced: InductionAdvanceResult[] = [];
  for (const row of result.rows) {
    const item = await advanceFromPassedEnrollment(mapPassedRow(row), null, 'AUTO_ADVANCE');
    if (item) {
      advanced.push(item);
    }
  }
  return advanced;
};

/** Version best-effort (nunca lanza) para las consultas de progreso. */
export const tryAdvanceEmployeeIfEligible = async (employeeId: number): Promise<void> => {
  try {
    await advanceEmployeeIfEligible(employeeId);
  } catch (error) {
    console.error(`No se pudo auto-avanzar de fase al colaborador ${employeeId}:`, error);
  }
};

/**
 * Avance manual de una inscripcion aprobada (boton del tablero). No exige el
 * interruptor de la fase: RH decide caso por caso.
 */
export const advanceEnrollmentToNextPhase = async (
  enrollmentId: number,
  actorUserId: string | null,
): Promise<InductionAdvanceResult> => {
  const enrollment = await pool.query(
    `SELECT e.id, p.phase_number, p.scope, ea.status AS evaluation_status
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.id = $1 LIMIT 1;`,
    [enrollmentId],
  );
  if (enrollment.rows.length === 0) {
    throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe.');
  }
  const row = enrollment.rows[0];
  if (String(row.scope) !== 'INSTITUTIONAL' || Number(row.phase_number) >= LAST_INSTITUTIONAL_PHASE) {
    throwCoded('RH_INDUCTION_ADVANCE_NO_NEXT_PHASE', 'Esta fase no tiene una fase institucional siguiente.');
  }
  if (String(row.evaluation_status ?? '') !== 'passed') {
    throwCoded(
      'RH_INDUCTION_PREVIOUS_PHASE_NOT_APPROVED',
      'El colaborador debe acreditar la evaluacion de esta fase antes de avanzar a la siguiente.',
    );
  }
  const passed = await pool.query(`${PASSED_ENROLLMENT_SELECT} AND e.id = $1 LIMIT 1;`, [enrollmentId]);
  if (passed.rows.length === 0) {
    throwCoded('RH_INDUCTION_ENROLLMENT_NOT_FOUND', 'La inscripcion no existe o el colaborador esta inactivo.');
  }
  const advanced = await advanceFromPassedEnrollment(mapPassedRow(passed.rows[0]), actorUserId, 'ADVANCE');
  if (!advanced) {
    return throwCoded('RH_INDUCTION_ALREADY_ENROLLED', 'El colaborador ya esta inscrito en la fase siguiente.');
  }
  return advanced;
};

/**
 * Reconciliacion hacia una fase destino (2-4): inscribe a todo colaborador
 * activo que aprobo la fase anterior y aun no esta inscrito en esta. Se usa al
 * publicar la fase y desde "Sincronizar avances" del tablero. No exige el
 * interruptor: es una accion explicita de RH.
 */
export const reconcilePhaseAdvance = async (
  targetPhaseId: number,
  actorUserId: string | null,
): Promise<InductionReconcileResult> => {
  const phase = await pool.query(
    `SELECT id, phase_number, scope FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`,
    [targetPhaseId],
  );
  if (phase.rows.length === 0) {
    throwCoded('RH_INDUCTION_PHASE_NOT_FOUND', 'La fase no existe.');
  }
  const phaseNumber = Number(phase.rows[0].phase_number);
  if (String(phase.rows[0].scope) !== 'INSTITUTIONAL' || phaseNumber <= 1 || phaseNumber > LAST_INSTITUTIONAL_PHASE) {
    throwCoded(
      'RH_INDUCTION_ADVANCE_NO_NEXT_PHASE',
      'La sincronizacion de avances solo aplica a las Fases 2 a 4.',
    );
  }
  const candidates = await pool.query(
    `${PASSED_ENROLLMENT_SELECT} AND p.phase_number = $1
        AND NOT EXISTS (
          SELECT 1 FROM public.rh_induction_enrollments n WHERE n.employee_id = e.employee_id AND n.phase_id = $2
        )
      ORDER BY emp.full_name ASC;`,
    [phaseNumber - 1, targetPhaseId],
  );
  const result: InductionReconcileResult = {
    phase_id: targetPhaseId,
    phase_number: phaseNumber,
    candidates: candidates.rows.length,
    advanced: 0,
    skipped: [],
  };
  for (const row of candidates.rows) {
    const passed = mapPassedRow(row);
    try {
      const advanced = await advanceFromPassedEnrollment(passed, actorUserId, 'RECONCILE');
      if (advanced) {
        result.advanced += 1;
      }
    } catch (error: any) {
      result.skipped.push({
        employee_id: passed.employee_id,
        full_name: passed.employee_name,
        reason: String(error?.publicMessage ?? error?.message ?? 'No se pudo inscribir'),
      });
    }
  }
  return result;
};

/** Reconciliacion best-effort (nunca lanza): p. ej. tras publicar una fase. */
export const tryReconcilePhaseAdvance = async (
  targetPhaseId: number,
  actorUserId: string | null,
): Promise<InductionReconcileResult | null> => {
  try {
    return await reconcilePhaseAdvance(targetPhaseId, actorUserId);
  } catch (error: any) {
    if (error?.code === 'RH_INDUCTION_ADVANCE_NO_NEXT_PHASE') {
      return null;
    }
    console.error(`No se pudieron sincronizar los avances hacia la fase ${targetPhaseId}:`, error);
    return null;
  }
};

// -----------------------------------------------------------------------------
// Ruta institucional del colaborador (Fases 1-4) para "Mi induccion": incluye
// las fases en las que todavia no esta inscrito, con su estado de acceso.
// -----------------------------------------------------------------------------

export type InductionTrackAccess =
  /** Ya tiene inscripcion en la fase (el detalle viene en progress). */
  | 'ENROLLED'
  /** Aprobo la anterior; la inscripcion se crea sola (o RH la crea) en cuanto corresponda. */
  | 'AVAILABLE'
  /** Todavia no aprueba la fase anterior. */
  | 'LOCKED';

export interface InductionTrackPhase {
  phase_id: number;
  phase_number: number;
  phase_name: string;
  published: boolean;
  auto_advance_on_pass: boolean;
  reading_time_limit_hours: number | null;
  advance_grace_hours: number | null;
  evaluation_window_hours: number | null;
  attempt_time_limit_minutes: number | null;
  passing_score: number | null;
  documents_total: number;
  access: InductionTrackAccess;
  enrollment_id: number | null;
  /** Fecha en que termina el descanso y se activan las lecturas (si esta en descanso). */
  readings_start_at: string | null;
  passed: boolean;
  passed_at: string | null;
}

export const getInstitutionalTrack = async (employeeId: number): Promise<InductionTrackPhase[]> => {
  const result = await pool.query(
    `SELECT p.id, p.phase_number, p.name, p.published_at IS NOT NULL AS published, p.auto_advance_on_pass,
            p.reading_time_limit_hours, p.advance_grace_hours,
            (SELECT COUNT(*)::int FROM public.rh_induction_phase_documents d WHERE d.phase_id = p.id) AS documents_total,
            t.window_hours, t.attempt_time_limit_minutes, t.passing_score,
            e.id AS enrollment_id, e.readings_start_at, ea.status AS evaluation_status,
            COALESCE(ea.graded_at, ea.submitted_at) AS passed_at
       FROM public.rh_induction_phases p
       LEFT JOIN LATERAL (
         SELECT window_hours, attempt_time_limit_minutes, passing_score
           FROM public.evaluation_templates
          WHERE training_course_id = p.training_course_id AND status = 'published' AND is_active = TRUE
            AND evaluation_type = 'quiz'
          ORDER BY created_at DESC LIMIT 1
       ) t ON TRUE
       LEFT JOIN public.rh_induction_enrollments e ON e.phase_id = p.id AND e.employee_id = $1
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE p.scope = 'INSTITUTIONAL' AND p.phase_number BETWEEN 1 AND ${LAST_INSTITUTIONAL_PHASE}
      ORDER BY p.phase_number ASC;`,
    [employeeId],
  );
  let previousPassed = true;
  return result.rows.map((row) => {
    const enrolled = Boolean(row.enrollment_id);
    const passed = String(row.evaluation_status ?? '') === 'passed';
    const access: InductionTrackAccess = enrolled ? 'ENROLLED' : previousPassed ? 'AVAILABLE' : 'LOCKED';
    previousPassed = passed;
    return {
      phase_id: Number(row.id),
      phase_number: Number(row.phase_number),
      phase_name: String(row.name),
      published: Boolean(row.published),
      auto_advance_on_pass: Boolean(row.auto_advance_on_pass),
      reading_time_limit_hours: row.reading_time_limit_hours ? Number(row.reading_time_limit_hours) : null,
      advance_grace_hours: row.advance_grace_hours ? Number(row.advance_grace_hours) : null,
      evaluation_window_hours: row.window_hours ? Number(row.window_hours) : null,
      attempt_time_limit_minutes: row.attempt_time_limit_minutes ? Number(row.attempt_time_limit_minutes) : null,
      passing_score: row.passing_score !== null && row.passing_score !== undefined ? Number(row.passing_score) : null,
      documents_total: Number(row.documents_total ?? 0),
      access,
      enrollment_id: row.enrollment_id ? Number(row.enrollment_id) : null,
      readings_start_at: row.readings_start_at && !passed ? toIsoDateTime(row.readings_start_at) : null,
      passed,
      passed_at: passed && row.passed_at ? toIsoDateTime(row.passed_at) : null,
    };
  });
};
