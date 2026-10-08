import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { diagnoseTruncatedAttempt } from './rh-induction-attempt-repair.service';
import { tryActivateDeferredEnrollments } from './rh-induction-grace.service';
import { refreshEnrollmentReadingStatus } from './rh-induction.service';

// -----------------------------------------------------------------------------
// Tablero de gestion integral de la Induccion: Fases 1-4 (institucionales) y
// Fases 5-6 (por puesto, con el curso del puesto del colaborador). La Fase 7
// no tiene inscripciones: se resuelve con la evaluacion de competencia.
//
// Modelo de lectura unico ("fila de inscrito") que deriva, para cada
// colaborador inscrito, su ETAPA en el proceso, sus ALERTAS y las ACCIONES que
// RH puede ejecutar sobre el. El panorama por fase agrega esas filas. Todo se
// deriva de tablas existentes: no hay estado nuevo que mantener.
// -----------------------------------------------------------------------------

/** Ultima fase institucional (ruta comun 1-4 con avance automatico). */
export const DASHBOARD_LAST_PHASE = 4;
/** Ultima fase con inscripciones (la 6); la 7 vive en el REH-REG-003. */
export const ROSTER_LAST_PHASE = 6;

export type InductionStage =
  | 'EN_ESPERA_PUBLICACION'
  | 'EN_DESCANSO'
  | 'SIN_LECTURAS'
  | 'SIN_INICIAR'
  | 'LEYENDO'
  | 'LECTURA_VENCIDA'
  | 'LECTURA_COMPLETA'
  | 'EVALUACION_DISPONIBLE'
  | 'EVALUACION_EN_CURSO'
  | 'EVALUACION_TRUNCADA'
  | 'PRACTICA_PENDIENTE'
  | 'EN_CALIFICACION'
  | 'EVALUACION_VENCIDA'
  | 'COMPETENCIA_EN_PROCESO'
  | 'COMPETENCIA_POR_AUTORIZAR'
  | 'NO_ACREDITADA'
  /** Ruta por puesto: acredito un puesto y el siguiente de la cola aun no puede activarse. */
  | 'SIGUIENTE_PUESTO'
  | 'APROBADA';

export const INDUCTION_STAGES: InductionStage[] = [
  'EN_ESPERA_PUBLICACION',
  'EN_DESCANSO',
  'SIN_LECTURAS',
  'SIN_INICIAR',
  'LEYENDO',
  'LECTURA_VENCIDA',
  'LECTURA_COMPLETA',
  'EVALUACION_DISPONIBLE',
  'EVALUACION_EN_CURSO',
  'EVALUACION_TRUNCADA',
  'PRACTICA_PENDIENTE',
  'EN_CALIFICACION',
  'EVALUACION_VENCIDA',
  'COMPETENCIA_EN_PROCESO',
  'COMPETENCIA_POR_AUTORIZAR',
  'NO_ACREDITADA',
  'SIGUIENTE_PUESTO',
  'APROBADA',
];

export type InductionAlert =
  | 'LECTURA_VENCIDA'
  | 'LECTURA_POR_VENCER'
  | 'EVALUACION_TRUNCADA'
  | 'EVALUACION_VENCIDA'
  | 'EVALUACION_POR_VENCER'
  | 'NO_ACREDITADA'
  | 'EN_CALIFICACION'
  | 'SIN_CUESTIONARIO'
  | 'AVANCE_PENDIENTE'
  | 'SIN_CONSTANCIA'
  | 'DATOS_CONSTANCIA'
  | 'FIRMAS_PENDIENTES';

export type InductionAction =
  | 'REOPEN_READING'
  | 'EXTEND_READING'
  | 'REOPEN_SIGNATURES'
  | 'RESEND_NOTICE'
  | 'RESET_ATTEMPT'
  | 'AUTHORIZE_RETRY'
  | 'GRADE'
  | 'ADVANCE'
  | 'ISSUE_CERTIFICATE'
  | 'COMPLETE_DATA'
  | 'START_NOW'
  | 'CAPTURE_PRACTICAL'
  | 'UNENROLL';

export interface InductionRosterRow {
  enrollment_id: number;
  phase_id: number;
  phase_number: number;
  /** Fase 6 = evaluacion practica capturada por RH; el resto, cuestionario. */
  evaluation_mode: 'quiz' | 'practical';
  employee_id: number;
  employee_name: string;
  employee_code: string;
  employee_email: string | null;
  area: string | null;
  branch_name: string | null;
  position_name: string | null;
  /** Fases por puesto: codigo del puesto de la inscripcion y su lugar en la ruta. */
  position_code: string | null;
  position_sequence: number | null;
  /** Solo en vistas agregadas (directorio/panorama): avance de la ruta por puesto. */
  positions_total?: number;
  positions_passed?: number;
  origin: string;
  enrolled_at: string;
  phase_published: boolean;
  /** Descanso entre fases: cuando se activan las lecturas (null si ya arranco o no aplica). */
  readings_start_at: string | null;
  reading_total: number;
  reading_signed: number;
  reading_pages_total: number;
  reading_pages_seen: number;
  reading_active_seconds: number;
  reading_started_at: string | null;
  reading_completed_at: string | null;
  reading_deadline_at: string | null;
  evaluation_assignment_id: number | null;
  evaluation_status: string | null;
  evaluation_attempt_no: number | null;
  evaluation_available_at: string | null;
  evaluation_deadline_at: string | null;
  evaluation_started_at: string | null;
  evaluation_submitted_at: string | null;
  evaluation_percentage: number | null;
  evaluation_question_count: number;
  evaluation_response_count: number;
  attempt_time_limit_minutes: number | null;
  attempts_total: number;
  certificate_document_id: number | null;
  supervisor_employee_id: number | null;
  supervisor_name: string | null;
  checklist_total: number;
  checklist_completed: number;
  missing_branch: boolean;
  missing_position: boolean;
  next_phase_id: number | null;
  next_phase_enrolled: boolean;
  next_phase_published: boolean | null;
  quiz_published: boolean;
  stage: InductionStage;
  alerts: InductionAlert[];
  actions: InductionAction[];
  /** Horas transcurridas desde la inscripcion hasta la aprobacion (o hasta ahora). */
  elapsed_hours: number;
}

const SOON_HOURS = 24;

const ROSTER_SELECT = `
  SELECT
    e.id AS enrollment_id, e.phase_id, p.phase_number, p.published_at, p.training_course_id,
    -- Ruta por puesto: un puesto en cola "entra" a la fase cuando se activa.
    e.origin, COALESCE(e.activated_at, e.created_at) AS enrolled_at, e.readings_start_at,
    emp.id AS employee_id, emp.full_name AS employee_name, emp.employee_code, emp.email AS employee_email,
    emp.area, bu.name AS branch_name, emp.branch_id IS NULL AS missing_branch,
    -- Fases por puesto: el puesto de ESTA inscripcion; institucionales: el puesto vigente.
    COALESCE(epos.name, pos.name) AS position_name, epos.code AS position_code, e.position_sequence, e.queue_status,
    e.reading_completed_at, e.reading_deadline_at,
    e.supervisor_employee_id, sup.full_name AS supervisor_name,
    ea.id AS assignment_id, ea.status AS evaluation_status, ea.attempt_no, ea.available_at, ea.deadline_at AS evaluation_deadline_at,
    ea.started_at, ea.submitted_at, ea.graded_at, ea.percentage, ea.certificate_document_id,
    t.attempt_time_limit_minutes,
    (SELECT COUNT(*)::int FROM public.evaluation_assignment_questions q WHERE q.assignment_id = ea.id) AS question_count,
    (SELECT COUNT(*)::int FROM public.evaluation_responses r WHERE r.assignment_id = ea.id) AS response_count,
    (SELECT COUNT(*)::int FROM public.evaluation_assignments x
       JOIN public.evaluation_templates xt ON xt.id = x.template_id
      WHERE x.employee_id = emp.id AND xt.training_course_id = COALESCE(e.training_course_id, p.training_course_id)) AS attempts_total,
    rd.reading_total, rd.reading_signed, rd.pages_total, rd.pages_seen, rd.active_seconds, rd.reading_started_at,
    (SELECT COUNT(*)::int FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = e.phase_id) AS checklist_total,
    (SELECT COUNT(*)::int FROM public.rh_induction_checklist_progress cp WHERE cp.enrollment_id = e.id) AS checklist_completed,
    np.id AS next_phase_id, np.published_at IS NOT NULL AS next_phase_published,
    CASE WHEN p.phase_number = ${ROSTER_LAST_PHASE}
      -- De la Fase 6 se "avanza" abriendo la evaluacion de competencia inicial (Fase 7) DE ESTE PUESTO.
      THEN EXISTS (SELECT 1 FROM public.rh_competency_evaluations ce
                    WHERE ce.employee_id = emp.id AND ce.evaluation_type = 'INICIAL'
                      AND (e.position_id IS NULL OR ce.position_id = e.position_id))
      ELSE EXISTS (SELECT 1 FROM public.rh_induction_enrollments ne
                    WHERE ne.employee_id = emp.id AND ne.phase_id = np.id AND ne.queue_status <> 'CANCELLED')
    END
    -- Ruta por puesto: mientras queden puestos de esta fase por acreditar no hay "avance pendiente".
    OR (e.position_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.rh_induction_enrollments sib
            LEFT JOIN public.evaluation_assignments sea ON sea.id = sib.evaluation_assignment_id
           WHERE sib.employee_id = emp.id AND sib.phase_id = e.phase_id AND sib.id <> e.id
             AND sib.queue_status <> 'CANCELLED' AND sea.status IS DISTINCT FROM 'passed'))
    AS next_phase_enrolled,
    EXISTS (
      SELECT 1 FROM public.evaluation_templates qt
       WHERE qt.training_course_id = COALESCE(e.training_course_id, p.training_course_id) AND qt.status = 'published' AND qt.is_active = TRUE
         AND qt.evaluation_type = CASE WHEN p.phase_number = ${ROSTER_LAST_PHASE} THEN 'practical' ELSE 'quiz' END
    ) AS quiz_published
  FROM public.rh_induction_enrollments e
  JOIN public.rh_induction_phases p ON p.id = e.phase_id
  JOIN public.employees emp ON emp.id = e.employee_id
  LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id
  LEFT JOIN LATERAL (
    SELECT rp.name FROM public.rh_employee_positions rep
      JOIN public.rh_positions rp ON rp.id = rep.position_id
     WHERE rep.employee_id = emp.id AND rep.is_active = TRUE
     ORDER BY rep.assigned_at DESC LIMIT 1
  ) pos ON TRUE
  LEFT JOIN public.rh_positions epos ON epos.id = e.position_id
  LEFT JOIN public.employees sup ON sup.id = e.supervisor_employee_id
  LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
  LEFT JOIN public.evaluation_templates t ON t.id = ea.template_id
  LEFT JOIN public.rh_induction_phases np ON np.phase_number = p.phase_number + 1
    AND p.phase_number <= ${ROSTER_LAST_PHASE}
  LEFT JOIN LATERAL (
    SELECT COUNT(ri.id)::int AS reading_total,
           COUNT(ri.id) FILTER (WHERE a.status = 'signed')::int AS reading_signed,
           COALESCE(SUM(a.pages_total), 0)::int AS pages_total,
           COALESCE(SUM(COALESCE(array_length(a.pages_seen, 1), 0)), 0)::int AS pages_seen,
           COALESCE(SUM(a.active_seconds), 0)::int AS active_seconds,
           MIN(a.started_at) AS reading_started_at
      FROM public.rh_induction_reading_items ri
      LEFT JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
     WHERE ri.enrollment_id = e.id
  ) rd ON TRUE
`;

const iso = (value: unknown): string | null => (value ? toIsoDateTime(value) : null);

const hoursBetween = (from: Date, to: Date): number => Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);

interface StageInput {
  evaluation_mode?: 'quiz' | 'practical';
  phase_published: boolean;
  readings_start_at: string | null;
  reading_total: number;
  reading_signed: number;
  reading_pages_seen: number;
  reading_completed_at: string | null;
  reading_deadline_at: string | null;
  evaluation_status: string | null;
  evaluation_started_at: string | null;
  evaluation_question_count: number;
  attempt_time_limit_minutes: number | null;
}

/** Etapa del colaborador dentro de la fase (una sola, en orden del proceso). */
export const deriveInductionStage = (row: StageInput, now: Date = new Date()): InductionStage => {
  const status = row.evaluation_status;
  if (status === 'passed') return 'APROBADA';
  if (status === 'failed') return 'NO_ACREDITADA';
  if (status === 'expired') return 'EVALUACION_VENCIDA';
  if (status === 'grading' || status === 'submitted') return 'EN_CALIFICACION';
  if (status === 'pending' || status === 'in_progress' || status === 'authorized_late') {
    const diagnosis = diagnoseTruncatedAttempt(
      {
        status,
        started_at: row.evaluation_started_at ? new Date(row.evaluation_started_at) : null,
        attempt_time_limit_minutes: row.attempt_time_limit_minutes,
        question_count: row.evaluation_question_count,
      },
      now,
    );
    if (diagnosis.reasons.includes('TIMER_EXHAUSTED') || diagnosis.reasons.includes('NO_QUESTIONS')) {
      return 'EVALUACION_TRUNCADA';
    }
    return row.evaluation_started_at ? 'EVALUACION_EN_CURSO' : 'EVALUACION_DISPONIBLE';
  }
  if (!row.phase_published) return 'EN_ESPERA_PUBLICACION';
  // Fase 6: sin lectura; espera a que RH capture la evaluacion practica.
  if (row.evaluation_mode === 'practical') return 'PRACTICA_PENDIENTE';
  if (row.reading_completed_at) return 'LECTURA_COMPLETA';
  if (row.reading_total === 0 && row.readings_start_at && new Date(row.readings_start_at).getTime() > now.getTime()) return 'EN_DESCANSO';
  if (row.reading_total === 0) return 'SIN_LECTURAS';
  if (row.reading_deadline_at && new Date(row.reading_deadline_at).getTime() <= now.getTime()) return 'LECTURA_VENCIDA';
  if (row.reading_signed > 0 || row.reading_pages_seen > 0) return 'LEYENDO';
  return 'SIN_INICIAR';
};

/**
 * Fase aprobada con documentos sin firmar: el examen se abrio por vencimiento
 * del plazo de lectura y el colaborador lo acredito sin terminar de leer. La
 * firma de esos acuses sigue siendo evidencia pendiente para la acreditacion.
 */
const hasPendingSignatures = (row: Pick<InductionRosterRow, 'stage' | 'reading_total' | 'reading_signed'>): boolean =>
  row.stage === 'APROBADA' && row.reading_total > row.reading_signed;

const deriveAlerts = (row: Omit<InductionRosterRow, 'alerts' | 'actions' | 'elapsed_hours'>, now: Date): InductionAlert[] => {
  const alerts: InductionAlert[] = [];
  const soonMs = SOON_HOURS * 3_600_000;
  if (row.stage === 'LECTURA_VENCIDA') alerts.push('LECTURA_VENCIDA');
  if (
    (row.stage === 'LEYENDO' || row.stage === 'SIN_INICIAR') &&
    row.reading_deadline_at &&
    new Date(row.reading_deadline_at).getTime() - now.getTime() <= soonMs
  ) {
    alerts.push('LECTURA_POR_VENCER');
  }
  if (row.stage === 'EVALUACION_TRUNCADA') alerts.push('EVALUACION_TRUNCADA');
  if (row.stage === 'EVALUACION_VENCIDA') alerts.push('EVALUACION_VENCIDA');
  if (
    (row.stage === 'EVALUACION_DISPONIBLE' || row.stage === 'EVALUACION_EN_CURSO') &&
    row.evaluation_deadline_at &&
    new Date(row.evaluation_deadline_at).getTime() - now.getTime() <= soonMs
  ) {
    alerts.push('EVALUACION_POR_VENCER');
  }
  if (row.stage === 'NO_ACREDITADA') alerts.push('NO_ACREDITADA');
  if (row.stage === 'EN_CALIFICACION') alerts.push('EN_CALIFICACION');
  if ((row.stage === 'LECTURA_COMPLETA' || row.stage === 'PRACTICA_PENDIENTE') && !row.quiz_published) alerts.push('SIN_CUESTIONARIO');
  if (row.stage === 'APROBADA' && row.next_phase_id && !row.next_phase_enrolled) alerts.push('AVANCE_PENDIENTE');
  if (row.stage === 'APROBADA' && !row.certificate_document_id) alerts.push('SIN_CONSTANCIA');
  if (row.stage !== 'APROBADA' && (row.missing_branch || row.missing_position)) alerts.push('DATOS_CONSTANCIA');
  if (hasPendingSignatures(row)) alerts.push('FIRMAS_PENDIENTES');
  return alerts;
};

const deriveActions = (row: Omit<InductionRosterRow, 'alerts' | 'actions' | 'elapsed_hours'>): InductionAction[] => {
  const actions: InductionAction[] = [];
  const readingIncomplete = row.reading_total > 0 && !row.reading_completed_at;
  const evaluationUntouched =
    row.evaluation_status === null ||
    ((row.evaluation_status === 'pending' || row.evaluation_status === 'expired') && !row.evaluation_started_at && row.evaluation_response_count === 0);
  if (row.phase_published && readingIncomplete && evaluationUntouched) {
    actions.push(row.stage === 'LECTURA_VENCIDA' || row.stage === 'EVALUACION_VENCIDA' || row.evaluation_status !== null ? 'REOPEN_READING' : 'EXTEND_READING');
  }
  if (row.phase_published && readingIncomplete && row.evaluation_status === null) {
    actions.push('RESEND_NOTICE');
  }
  if (hasPendingSignatures(row)) {
    actions.push('REOPEN_SIGNATURES');
  }
  if (row.stage === 'EVALUACION_TRUNCADA' || row.stage === 'EVALUACION_EN_CURSO') {
    actions.push('RESET_ATTEMPT');
  }
  if (row.evaluation_mode === 'practical') {
    // La practica no tiene intentos: RH captura (o corrige) la calificacion.
    if (row.stage === 'PRACTICA_PENDIENTE' || row.stage === 'NO_ACREDITADA') actions.push('CAPTURE_PRACTICAL');
  } else if (row.stage === 'NO_ACREDITADA' || row.stage === 'EVALUACION_VENCIDA') {
    actions.push('AUTHORIZE_RETRY');
  }
  if (row.stage === 'EN_CALIFICACION') {
    actions.push('GRADE');
  }
  if (row.stage === 'EN_DESCANSO') {
    actions.push('START_NOW');
  }
  if (row.stage === 'APROBADA' && row.next_phase_id && !row.next_phase_enrolled) {
    actions.push('ADVANCE');
  }
  if (row.stage === 'APROBADA' && !row.certificate_document_id) {
    actions.push('ISSUE_CERTIFICATE');
  }
  if (row.missing_branch || row.missing_position) {
    actions.push('COMPLETE_DATA');
  }
  // Ruta por puesto: la inscripcion no se elimina (se retira dando de baja el puesto).
  if (row.stage !== 'APROBADA' && row.stage !== 'EN_CALIFICACION' && !row.position_sequence) {
    actions.push('UNENROLL');
  }
  return actions;
};

export const mapRosterRow = (row: any, now: Date = new Date()): InductionRosterRow => {
  const base = {
    enrollment_id: Number(row.enrollment_id),
    phase_id: Number(row.phase_id),
    phase_number: Number(row.phase_number),
    evaluation_mode: (Number(row.phase_number) === ROSTER_LAST_PHASE ? 'practical' : 'quiz') as 'quiz' | 'practical',
    employee_id: Number(row.employee_id),
    employee_name: String(row.employee_name),
    employee_code: String(row.employee_code ?? ''),
    employee_email: row.employee_email ? String(row.employee_email) : null,
    area: row.area ? String(row.area) : null,
    branch_name: row.branch_name ? String(row.branch_name) : null,
    position_name: row.position_name ? String(row.position_name) : null,
    position_code: row.position_code ? String(row.position_code) : null,
    position_sequence: row.position_sequence ? Number(row.position_sequence) : null,
    origin: String(row.origin ?? 'MANUAL'),
    enrolled_at: toIsoDateTime(row.enrolled_at),
    phase_published: Boolean(row.published_at),
    readings_start_at: iso(row.readings_start_at),
    reading_total: Number(row.reading_total ?? 0),
    reading_signed: Number(row.reading_signed ?? 0),
    reading_pages_total: Number(row.pages_total ?? 0),
    reading_pages_seen: Number(row.pages_seen ?? 0),
    reading_active_seconds: Number(row.active_seconds ?? 0),
    reading_started_at: iso(row.reading_started_at),
    reading_completed_at: iso(row.reading_completed_at),
    reading_deadline_at: iso(row.reading_deadline_at),
    evaluation_assignment_id: row.assignment_id ? Number(row.assignment_id) : null,
    evaluation_status: row.evaluation_status ? String(row.evaluation_status) : null,
    evaluation_attempt_no: row.attempt_no ? Number(row.attempt_no) : null,
    evaluation_available_at: iso(row.available_at),
    evaluation_deadline_at: iso(row.evaluation_deadline_at),
    evaluation_started_at: iso(row.started_at),
    evaluation_submitted_at: iso(row.submitted_at ?? row.graded_at),
    evaluation_percentage: row.percentage !== null && row.percentage !== undefined ? Number(row.percentage) : null,
    evaluation_question_count: Number(row.question_count ?? 0),
    evaluation_response_count: Number(row.response_count ?? 0),
    attempt_time_limit_minutes: row.attempt_time_limit_minutes ? Number(row.attempt_time_limit_minutes) : null,
    attempts_total: Number(row.attempts_total ?? 0),
    certificate_document_id: row.certificate_document_id ? Number(row.certificate_document_id) : null,
    supervisor_employee_id: row.supervisor_employee_id ? Number(row.supervisor_employee_id) : null,
    supervisor_name: row.supervisor_name ? String(row.supervisor_name) : null,
    checklist_total: Number(row.checklist_total ?? 0),
    checklist_completed: Number(row.checklist_completed ?? 0),
    missing_branch: Boolean(row.missing_branch),
    missing_position: Boolean(row.missing_position),
    next_phase_id: row.next_phase_id ? Number(row.next_phase_id) : null,
    next_phase_enrolled: Boolean(row.next_phase_enrolled),
    next_phase_published: row.next_phase_id ? Boolean(row.next_phase_published) : null,
    quiz_published: Boolean(row.quiz_published),
  };
  const stage = deriveInductionStage(base, now);
  const withStage = { ...base, stage };
  const finishedAt =
    stage === 'APROBADA' && withStage.evaluation_submitted_at ? new Date(withStage.evaluation_submitted_at) : now;
  return {
    ...withStage,
    alerts: deriveAlerts(withStage, now),
    actions: deriveActions(withStage),
    elapsed_hours: Math.round(hoursBetween(new Date(withStage.enrolled_at), finishedAt) * 10) / 10,
  };
};

/** Mismo auto-sanado de listPhaseEnrollments: abre el examen a quien ya le toca. */
const healPhaseEnrollments = async (phaseId: number): Promise<void> => {
  await tryActivateDeferredEnrollments({ phaseId });
  const pending = await pool.query(
    `SELECT id FROM public.rh_induction_enrollments
      WHERE phase_id = $1 AND evaluation_assignment_id IS NULL
        AND (reading_completed_at IS NOT NULL
             OR (reading_deadline_at IS NOT NULL AND reading_deadline_at <= NOW()));`,
    [phaseId],
  );
  for (const row of pending.rows) {
    await refreshEnrollmentReadingStatus(Number(row.id));
  }
};

export const loadPhaseRosterRows = async (phaseId: number): Promise<InductionRosterRow[]> => {
  await healPhaseEnrollments(phaseId);
  const result = await pool.query(`${ROSTER_SELECT} WHERE e.phase_id = $1 AND e.queue_status = 'ACTIVE' ORDER BY emp.full_name ASC, e.position_sequence ASC NULLS FIRST;`, [phaseId]);
  const now = new Date();
  return result.rows.map((row) => mapRosterRow(row, now));
};

export const loadEmployeeRosterRows = async (employeeId: number): Promise<InductionRosterRow[]> => {
  const result = await pool.query(
    `${ROSTER_SELECT} WHERE e.employee_id = $1 AND p.phase_number <= ${ROSTER_LAST_PHASE} AND e.queue_status = 'ACTIVE'
      ORDER BY p.phase_number ASC, e.position_sequence ASC NULLS FIRST;`,
    [employeeId],
  );
  const now = new Date();
  return result.rows.map((row) => mapRosterRow(row, now));
};

/** Todas las inscripciones del programa (Fases 1-6) para el directorio por colaborador. */
export const loadProgramRosterRows = async (): Promise<InductionRosterRow[]> => {
  const result = await pool.query(
    `${ROSTER_SELECT} WHERE p.phase_number <= ${ROSTER_LAST_PHASE} AND e.queue_status = 'ACTIVE'
      ORDER BY emp.full_name ASC, p.phase_number ASC, e.position_sequence ASC NULLS FIRST;`,
  );
  const now = new Date();
  return result.rows.map((row) => mapRosterRow(row, now));
};

export const loadEnrollmentRosterRow = async (enrollmentId: number): Promise<InductionRosterRow | null> => {
  const result = await pool.query(`${ROSTER_SELECT} WHERE e.id = $1 LIMIT 1;`, [enrollmentId]);
  return result.rows.length > 0 ? mapRosterRow(result.rows[0]) : null;
};

// -----------------------------------------------------------------------------
// Roster por fase con filtros y paginacion (en memoria: una fase tiene decenas
// o pocos cientos de inscritos y la etapa se deriva en codigo).
// -----------------------------------------------------------------------------

export interface RosterQuery {
  phaseId: number;
  search?: string | undefined;
  stages?: InductionStage[] | undefined;
  alerts?: InductionAlert[] | undefined;
  page: number;
  limit: number;
}

export interface RosterPage {
  rows: InductionRosterRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  stage_counts: Record<InductionStage, number>;
}

export const normalizeSearchText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const emptyStageCounts = (): Record<InductionStage, number> =>
  INDUCTION_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = 0;
      return acc;
    },
    {} as Record<InductionStage, number>,
  );

export const queryPhaseRoster = async (query: RosterQuery): Promise<RosterPage> => {
  const all = await loadPhaseRosterRows(query.phaseId);
  const stageCounts = emptyStageCounts();
  for (const row of all) {
    stageCounts[row.stage] += 1;
  }
  const search = query.search ? normalizeSearchText(query.search) : '';
  const stages = query.stages && query.stages.length > 0 ? new Set(query.stages) : null;
  const alerts = query.alerts && query.alerts.length > 0 ? new Set(query.alerts) : null;
  const filtered = all.filter((row) => {
    if (stages && !stages.has(row.stage)) return false;
    if (alerts && !row.alerts.some((alert) => alerts.has(alert))) return false;
    if (search) {
      const haystack = normalizeSearchText(
        [row.employee_name, row.employee_code, row.employee_email ?? '', row.area ?? '', row.branch_name ?? '', row.position_name ?? ''].join(' '),
      );
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const offset = (page - 1) * query.limit;
  return {
    rows: filtered.slice(offset, offset + query.limit),
    total,
    page,
    limit: query.limit,
    total_pages: totalPages,
    stage_counts: stageCounts,
  };
};
