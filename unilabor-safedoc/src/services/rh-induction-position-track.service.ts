import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { queueNotifyInductionReadingsAssigned, queueNotifyPracticalStarted } from './rh-induction-notification.service';
import {
  evaluationModeForPhase,
  loadCourseEvaluationState,
  POSITION_EVALUATION_STATE_LABEL,
} from './rh-induction-position-evaluation';
import {
  hasPositionInProgress,
  isTrackComplete,
  nextSequence,
  orderPositions,
  planTrackChanges,
  queuedInOrder,
  type TrackEntry,
  type TrackPosition,
  type TrackQueueStatus,
} from './rh-induction-position-track.rules';
import { syncInductionReadingDeadlines } from './rh-induction-reading-deadline.service';
import {
  assignEnrollmentReadings,
  getPositionDocuments,
  refreshEnrollmentReadingStatus,
  type PhaseDocumentRow,
  type RhInductionEnrollmentOrigin,
} from './rh-induction.service';

// -----------------------------------------------------------------------------
// Ruta por puesto de las Fases 5 y 6 (decision RH 2026-10-07).
//
// Al entrar a la fase se crea UNA inscripcion por cada puesto elegible del
// colaborador: la primera se activa (lecturas, plazo, SMS / practica) y las
// demas quedan EN COLA. Al acreditar un puesto se activa el siguiente sin
// descanso. Si RH da de baja un puesto, su inscripcion no aprobada se cancela
// (baja logica, se conserva la evidencia); si le agrega uno, se forma al
// final. Solo con TODOS los puestos aprobados puede entrar a la fase siguiente.
// -----------------------------------------------------------------------------

export type PositionTrackPhase = 5 | 6;

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

interface TrackPhaseInfo {
  id: number;
  phase_number: PositionTrackPhase;
  published: boolean;
  reading_time_limit_hours: number | null;
}

export interface TrackEntryDetail extends TrackEntry {
  position_code: string;
  position_name: string;
  evaluation_status: string | null;
  activated_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
}

export interface PositionActivationCheck {
  ok: boolean;
  /** Por que no se puede activar todavia (null si ok). */
  reason: string | null;
  course_id: number | null;
  documents: PhaseDocumentRow[];
}

export const loadTrackPhase = async (phaseNumber: PositionTrackPhase): Promise<TrackPhaseInfo> => {
  const result = await pool.query(
    `SELECT id, phase_number, published_at IS NOT NULL AS published, reading_time_limit_hours
       FROM public.rh_induction_phases WHERE phase_number = $1 AND scope = 'POSITION' LIMIT 1;`,
    [phaseNumber],
  );
  if (result.rows.length === 0) {
    return throwCoded('RH_INDUCTION_PHASE_NOT_FOUND', `No existe la Fase ${phaseNumber} por puesto.`);
  }
  const row = result.rows[0];
  return {
    id: Number(row.id),
    phase_number: phaseNumber,
    published: Boolean(row.published),
    reading_time_limit_hours: row.reading_time_limit_hours ? Number(row.reading_time_limit_hours) : null,
  };
};

export const loadTrackEntries = async (employeeId: number, phaseId: number): Promise<TrackEntryDetail[]> => {
  const result = await pool.query(
    `SELECT e.id, e.position_id, e.position_sequence, e.queue_status, e.activated_at, e.cancelled_at, e.cancelled_reason,
            rp.code AS position_code, rp.name AS position_name, ea.status AS evaluation_status
       FROM public.rh_induction_enrollments e
       JOIN public.rh_positions rp ON rp.id = e.position_id
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.employee_id = $1 AND e.phase_id = $2 AND e.position_id IS NOT NULL
      ORDER BY e.position_sequence ASC NULLS LAST, e.id ASC;`,
    [employeeId, phaseId],
  );
  return result.rows.map((row) => ({
    enrollment_id: Number(row.id),
    position_id: Number(row.position_id),
    sequence: Number(row.position_sequence ?? 1),
    queue_status: String(row.queue_status) as TrackQueueStatus,
    passed: String(row.evaluation_status ?? '') === 'passed',
    position_code: String(row.position_code),
    position_name: String(row.position_name),
    evaluation_status: row.evaluation_status ? String(row.evaluation_status) : null,
    activated_at: row.activated_at ? new Date(row.activated_at).toISOString() : null,
    cancelled_at: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    cancelled_reason: row.cancelled_reason ? String(row.cancelled_reason) : null,
  }));
};

/**
 * Puestos elegibles para la fase: en la 5, todos los puestos activos; en la 6,
 * los puestos activos que ya acreditaron su Fase 5 (en el orden de la Fase 5).
 */
export const loadEligiblePositions = async (employeeId: number, phaseNumber: PositionTrackPhase): Promise<TrackPosition[]> => {
  const result =
    phaseNumber === 5
      ? await pool.query(
          `SELECT rep.position_id, rep.assigned_at, rp.code
             FROM public.rh_employee_positions rep
             JOIN public.rh_positions rp ON rp.id = rep.position_id AND rp.is_active = TRUE
            WHERE rep.employee_id = $1 AND rep.is_active = TRUE;`,
          [employeeId],
        )
      : await pool.query(
          `SELECT rep.position_id, rep.assigned_at, rp.code, MIN(f5.position_sequence) AS f5_sequence
             FROM public.rh_employee_positions rep
             JOIN public.rh_positions rp ON rp.id = rep.position_id AND rp.is_active = TRUE
             JOIN public.rh_induction_enrollments f5 ON f5.employee_id = rep.employee_id AND f5.position_id = rep.position_id
                                                    AND f5.queue_status <> 'CANCELLED'
             JOIN public.rh_induction_phases p5 ON p5.id = f5.phase_id AND p5.phase_number = 5
             JOIN public.evaluation_assignments ea ON ea.id = f5.evaluation_assignment_id AND ea.status = 'passed'
            WHERE rep.employee_id = $1 AND rep.is_active = TRUE
            GROUP BY rep.position_id, rep.assigned_at, rp.code
            ORDER BY MIN(f5.position_sequence) ASC;`,
          [employeeId],
        );
  return result.rows.map((row) => ({
    position_id: Number(row.position_id),
    assigned_at: new Date(row.assigned_at).toISOString(),
    code: String(row.code),
  }));
};

/** Puede activarse ya el puesto en la fase? (fase publicada, puesto habilitado, evaluacion lista, documentos). */
export const checkPositionActivation = async (
  phase: TrackPhaseInfo,
  positionId: number,
): Promise<PositionActivationCheck> => {
  const position = await pool.query(`SELECT code FROM public.rh_positions WHERE id = $1 LIMIT 1;`, [positionId]);
  const code = String(position.rows[0]?.code ?? positionId);
  if (!phase.published) {
    return { ok: false, reason: `La Fase ${phase.phase_number} sigue en borrador.`, course_id: null, documents: [] };
  }
  const bridge = await pool.query(
    `SELECT training_course_id FROM public.rh_induction_phase_positions WHERE phase_id = $1 AND position_id = $2 LIMIT 1;`,
    [phase.id, positionId],
  );
  if (bridge.rows.length === 0) {
    return { ok: false, reason: `El puesto ${code} no esta habilitado en la Fase ${phase.phase_number}.`, course_id: null, documents: [] };
  }
  const courseId = Number(bridge.rows[0].training_course_id);
  const mode = evaluationModeForPhase(phase.phase_number);
  const state = await loadCourseEvaluationState(courseId, mode);
  if (state !== 'READY') {
    const what = mode === 'quiz' ? 'El cuestionario' : 'La evaluacion practica';
    return { ok: false, reason: `${what} del puesto ${code} esta ${POSITION_EVALUATION_STATE_LABEL[state]}.`, course_id: courseId, documents: [] };
  }
  if (phase.phase_number === 5) {
    const documents = await getPositionDocuments(positionId);
    if (documents.length === 0) {
      return { ok: false, reason: `El puesto ${code} no tiene documentos vigentes para leer.`, course_id: courseId, documents };
    }
    return { ok: true, reason: null, course_id: courseId, documents };
  }
  return { ok: true, reason: null, course_id: courseId, documents: [] };
};

const loadEmployeeUserId = async (employeeId: number): Promise<string | null> => {
  const result = await pool.query(`SELECT user_id FROM public.employees WHERE id = $1 LIMIT 1;`, [employeeId]);
  return result.rows[0]?.user_id ? String(result.rows[0].user_id) : null;
};

/** Activa una inscripcion en cola: curso del puesto, plazo de lectura, lecturas, SMS (Fase 5) o practica lista (Fase 6). */
const activateEnrollment = async (
  enrollmentId: number,
  phase: TrackPhaseInfo,
  check: PositionActivationCheck,
  employeeUserId: string,
  actorUserId: string,
): Promise<boolean> => {
  const readingHours = phase.phase_number === 5 && phase.reading_time_limit_hours ? phase.reading_time_limit_hours : null;
  // El UPDATE condicionado a QUEUED es el candado: si otro proceso (gancho y
  // cron a la vez) ya la activo, este no repite lecturas ni SMS.
  const updated = await pool.query(
    `UPDATE public.rh_induction_enrollments
        SET queue_status = 'ACTIVE', activated_at = NOW(), training_course_id = $2,
            reading_deadline_at = CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() + make_interval(hours => $3::int) END,
            reading_completed_at = CASE WHEN $4 THEN NOW() ELSE reading_completed_at END,
            updated_at = NOW()
      WHERE id = $1 AND queue_status = 'QUEUED';`,
    [enrollmentId, check.course_id, readingHours, phase.phase_number === 6],
  );
  if ((updated.rowCount ?? 0) === 0) {
    return false;
  }
  if (phase.phase_number === 5) {
    await assignEnrollmentReadings(enrollmentId, employeeUserId, check.documents, actorUserId);
    await syncInductionReadingDeadlines({ enrollmentId });
    queueNotifyInductionReadingsAssigned(enrollmentId);
  } else {
    // Fase 6: aviso al colaborador de que inicia la practica supervisada de este puesto.
    queueNotifyPracticalStarted(enrollmentId);
  }
  await refreshEnrollmentReadingStatus(enrollmentId);
  return true;
};

export interface TrackSyncResult {
  cancelled: number[];
  queued: number[];
  activated: number | null;
  /** Motivo por el que el siguiente puesto en cola no pudo activarse (null si no aplica). */
  waiting_reason: string | null;
}

const insertQueued = async (
  employeeId: number,
  phaseId: number,
  positionIds: number[],
  firstSequence: number,
  actorUserId: string | null,
  origin: RhInductionEnrollmentOrigin,
  advancedFromEnrollmentId: number | null,
): Promise<number[]> =>
  withTransaction(async (client) => {
    const ids: number[] = [];
    for (const [index, positionId] of positionIds.entries()) {
      const inserted = await client.query(
        `INSERT INTO public.rh_induction_enrollments
           (employee_id, phase_id, enrolled_by_user_id, position_id, position_sequence, queue_status, origin, advanced_from_enrollment_id)
         VALUES ($1, $2, $3, $4, $5, 'QUEUED', $6, $7) RETURNING id;`,
        [employeeId, phaseId, actorUserId, positionId, firstSequence + index, origin, advancedFromEnrollmentId],
      );
      ids.push(Number(inserted.rows[0].id));
    }
    return ids;
  });

/**
 * Lleva la ruta del colaborador al estado correcto: baja logica de puestos
 * retirados, forma los puestos nuevos y, si no hay un puesto en curso, activa
 * el siguiente de la cola que ya pueda activarse. Idempotente. Solo actua si
 * el colaborador ya entro a la fase (tiene alguna inscripcion en ella).
 */
export const syncEmployeePositionTrack = async (
  employeeId: number,
  phaseNumber: PositionTrackPhase,
  actorUserId: string | null,
): Promise<TrackSyncResult> => {
  const result: TrackSyncResult = { cancelled: [], queued: [], activated: null, waiting_reason: null };
  const phase = await loadTrackPhase(phaseNumber);
  let entries = await loadTrackEntries(employeeId, phase.id);
  if (entries.length === 0) {
    return result;
  }
  const eligible = await loadEligiblePositions(employeeId, phaseNumber);
  const changes = planTrackChanges(entries, eligible);

  if (changes.toCancel.length > 0) {
    await pool.query(
      `UPDATE public.rh_induction_enrollments
          SET queue_status = 'CANCELLED', cancelled_at = NOW(), cancelled_reason = 'PUESTO_DADO_DE_BAJA', updated_at = NOW()
        WHERE id = ANY($1::bigint[]) AND queue_status <> 'CANCELLED';`,
      [changes.toCancel],
    );
    result.cancelled = changes.toCancel;
  }
  if (changes.toQueue.length > 0) {
    result.queued = await insertQueued(employeeId, phase.id, changes.toQueue, nextSequence(entries), actorUserId, 'RECONCILE', null);
  }
  if (result.cancelled.length > 0 || result.queued.length > 0) {
    entries = await loadTrackEntries(employeeId, phase.id);
  }

  if (hasPositionInProgress(entries)) {
    return result;
  }
  const employeeUserId = await loadEmployeeUserId(employeeId);
  if (!employeeUserId) {
    result.waiting_reason = 'El colaborador no tiene usuario de sistema vinculado.';
    return result;
  }
  const actor = actorUserId ?? employeeUserId;
  // Un puesto tras otro; si el siguiente aun no puede activarse (puesto sin
  // habilitar, cuestionario sin publicar) se intenta el que sigue para no
  // detener al colaborador: el pendiente se activa al quedar listo.
  for (const queued of queuedInOrder(entries)) {
    const check = await checkPositionActivation(phase, queued.position_id);
    if (!check.ok) {
      result.waiting_reason = result.waiting_reason ?? check.reason;
      continue;
    }
    if (await activateEnrollment(queued.enrollment_id, phase, check, employeeUserId, actor)) {
      result.activated = queued.enrollment_id;
    }
    result.waiting_reason = null;
    break;
  }
  return result;
};

export interface StartTrackOptions {
  origin?: RhInductionEnrollmentOrigin;
  advancedFromEnrollmentId?: number | null;
}

export interface StartTrackResult {
  enrollment_ids: number[];
  activated_enrollment_id: number | null;
  positions: number;
}

/** El colaborador acredito TODOS sus puestos en la fase (gate para entrar a la siguiente). */
export const isEmployeePositionPhaseComplete = async (employeeId: number, phaseNumber: PositionTrackPhase): Promise<boolean> => {
  const phase = await loadTrackPhase(phaseNumber);
  const [entries, eligible] = await Promise.all([
    loadTrackEntries(employeeId, phase.id),
    loadEligiblePositions(employeeId, phaseNumber),
  ]);
  return isTrackComplete(entries, eligible);
};

/**
 * Entrada a la fase por puesto: crea la ruta completa (una inscripcion por
 * puesto elegible) y activa el primero. Si ningun puesto puede activarse aun,
 * no crea nada (nadie queda inscrito en el limbo).
 */
export const startEmployeePositionTrack = async (
  employeeId: number,
  phaseNumber: PositionTrackPhase,
  actorUserId: string,
  options: StartTrackOptions = {},
): Promise<StartTrackResult> => {
  const phase = await loadTrackPhase(phaseNumber);
  const existing = await loadTrackEntries(employeeId, phase.id);
  if (existing.some((entry) => entry.queue_status !== 'CANCELLED')) {
    return throwCoded('RH_INDUCTION_ALREADY_ENROLLED', `El colaborador ya esta en la Fase ${phaseNumber}.`);
  }
  if (phaseNumber === 5) {
    const phase4 = await pool.query(
      `SELECT 1 FROM public.rh_induction_enrollments e
         JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 4
         JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id AND ea.status = 'passed'
        WHERE e.employee_id = $1 LIMIT 1;`,
      [employeeId],
    );
    if (phase4.rows.length === 0) {
      return throwCoded('RH_INDUCTION_PREVIOUS_PHASE_NOT_APPROVED', 'El colaborador debe aprobar la Fase 4 antes de avanzar a la Fase 5.');
    }
  }
  if (phaseNumber === 6 && !(await isEmployeePositionPhaseComplete(employeeId, 5))) {
    return throwCoded(
      'RH_INDUCTION_PREVIOUS_PHASE_NOT_APPROVED',
      'El colaborador debe acreditar la Fase 5 de TODOS sus puestos antes de pasar a la Fase 6.',
    );
  }
  if (!(await loadEmployeeUserId(employeeId))) {
    return throwCoded(
      'RH_INDUCTION_EMPLOYEE_WITHOUT_USER',
      'El colaborador no tiene un usuario de sistema vinculado; no puede leer ni firmar en Sala de Lectura.',
    );
  }
  const eligible = await loadEligiblePositions(employeeId, phaseNumber);
  if (eligible.length === 0) {
    return throwCoded('RH_INDUCTION_EMPLOYEE_WITHOUT_POSITION', 'El colaborador no tiene puestos activos para esta fase.');
  }
  // Fase 5: puesto mas antiguo primero; Fase 6: el orden en que acredito la 5.
  const ordered = phaseNumber === 5 ? orderPositions(eligible) : eligible;
  // El primero debe poder activarse ya; si no, se toma el primero que si.
  const checks = await Promise.all(ordered.map((position) => checkPositionActivation(phase, position.position_id)));
  const firstReady = checks.findIndex((check) => check.ok);
  if (firstReady < 0) {
    return throwCoded('RH_INDUCTION_POSITION_EVALUATION_NOT_READY', checks[0]?.reason ?? 'Ningun puesto puede iniciar la fase todavia.');
  }
  const sequence = [ordered[firstReady]!, ...ordered.filter((_, index) => index !== firstReady)];
  const ids = await insertQueued(
    employeeId,
    phase.id,
    sequence.map((position) => position.position_id),
    nextSequence(existing),
    actorUserId,
    options.origin ?? 'ADVANCE',
    options.advancedFromEnrollmentId ?? null,
  );
  const sync = await syncEmployeePositionTrack(employeeId, phaseNumber, actorUserId);
  return { enrollment_ids: ids, activated_enrollment_id: sync.activated, positions: ids.length };
};

/** Version best-effort para ganchos (aprobacion, cambio de puestos, cron): nunca lanza. */
export const trySyncEmployeePositionTracks = async (employeeId: number, actorUserId: string | null = null): Promise<void> => {
  for (const phaseNumber of [5, 6] as PositionTrackPhase[]) {
    try {
      const result = await syncEmployeePositionTrack(employeeId, phaseNumber, actorUserId);
      if (result.activated || result.cancelled.length > 0 || result.queued.length > 0) {
        console.info(
          `Induccion Fase ${phaseNumber}: ruta por puesto del colaborador ${employeeId} sincronizada ` +
            `(activada ${result.activated ?? '-'}, en cola +${result.queued.length}, bajas ${result.cancelled.length}).`,
        );
      }
    } catch (error) {
      console.error(`No se pudo sincronizar la ruta por puesto (Fase ${phaseNumber}) del colaborador ${employeeId}:`, error);
    }
  }
};

/** Cron: sincroniza a todos los colaboradores que estan dentro de una fase por puesto. */
export const sweepPositionTracks = async (): Promise<number> => {
  const result = await pool.query(
    `SELECT DISTINCT e.employee_id
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.scope = 'POSITION'
       JOIN public.employees emp ON emp.id = e.employee_id AND emp.is_active = TRUE
      WHERE e.position_id IS NOT NULL
      ORDER BY e.employee_id;`,
  );
  for (const row of result.rows) {
    await trySyncEmployeePositionTracks(Number(row.employee_id));
  }
  return result.rows.length;
};

/**
 * Gancho al acreditar una evaluacion: si pertenece a una inscripcion por
 * puesto, sincroniza la ruta (activa el siguiente puesto). En segundo plano:
 * activar un puesto grande asigna cientos de lecturas y no debe frenar el
 * envio del examen del colaborador.
 */
export const queuePositionTrackAfterPass = (assignmentId: number): void => {
  void (async () => {
    try {
      const result = await pool.query(
        `SELECT e.employee_id FROM public.rh_induction_enrollments e
           JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.scope = 'POSITION'
          WHERE e.evaluation_assignment_id = $1 LIMIT 1;`,
        [assignmentId],
      );
      if (result.rows.length > 0) {
        await trySyncEmployeePositionTracks(Number(result.rows[0].employee_id));
      }
    } catch (error) {
      console.error(`No se pudo avanzar la ruta por puesto tras acreditar la evaluacion ${assignmentId}:`, error);
    }
  })();
};

/** Gancho al cambiar los puestos de un colaborador (alta/baja): en segundo plano. */
export const queuePositionTrackSync = (employeeId: number, actorUserId: string | null = null): void => {
  void trySyncEmployeePositionTracks(employeeId, actorUserId);
};
