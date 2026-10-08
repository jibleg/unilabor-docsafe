import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { loadEmployeeRosterRows } from './rh-induction-dashboard.service';
import type { InductionRosterRow } from './rh-induction-dashboard.service';
import { tryActivateDeferredEnrollments } from './rh-induction-grace.service';
import { getInstitutionalTrack, tryAdvanceEmployeeIfEligible } from './rh-induction-progression.service';
import type { InductionTrackPhase } from './rh-induction-progression.service';
import { competencyStage, PHASE7_NUMBER } from './rh-induction-phase7';
import { loadInitialCompetencyRoutes } from './rh-induction-position-summary';
import { loadTrackEntries } from './rh-induction-position-track.service';
import type { CompetencySnapshot } from './rh-induction-phase7';
import { loadTransitionRows } from './rh-induction-transition.service';
import type { TransitionBlock, TransitionState, TransitionTarget } from './rh-induction-transition.service';

// -----------------------------------------------------------------------------
// Vista 360 de un colaborador en la Induccion (Fases 1-7): ruta institucional,
// ruta por puesto (5-6 por inscripcion, 7 por su REH-REG-003 inicial),
// detalle de cada inscripcion, lectura documento por documento (paginas,
// tiempo activo, firma), historial de TODOS los intentos de evaluacion de cada
// fase (no solo el vigente), constancia y bitacora de acciones de RH.
// -----------------------------------------------------------------------------

export interface InductionReadingDocumentDetail {
  enrollment_id: number;
  document_id: string;
  document_code: string | null;
  title: string;
  acknowledgement_id: number | null;
  status: string | null;
  pages_total: number;
  pages_seen: number;
  active_seconds: number;
  current_page: number | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  deadline_at: string | null;
  last_progress_at: string | null;
}

export interface InductionAttemptDetail {
  assignment_id: number;
  /** Inscripcion (puesto, en Fases 5-6) a la que pertenece el intento. */
  enrollment_id: number;
  phase_number: number;
  template_id: number;
  template_title: string;
  is_current: boolean;
  status: string;
  attempt_no: number;
  available_at: string | null;
  deadline_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  question_count: number;
  response_count: number;
  certificate_document_id: number | null;
}

export interface InductionAuditEntry {
  id: number;
  action: string;
  occurred_at: string;
  actor_name: string | null;
  entity_type: string | null;
  entity_id: number | null;
  metadata: Record<string, unknown> | null;
}

/** Fase por puesto (5-7) en la ruta del colaborador, con su estado de avance. */
export interface InductionPositionTrackPhase {
  phase_id: number;
  phase_number: number;
  phase_name: string;
  published: boolean;
  enrollment_id: number | null;
  /** Si aun no entra: LISTO / BLOQUEADO (con motivos) segun la bandeja de avance. */
  transition: { state: TransitionState; blocks: TransitionBlock[] } | null;
  /** Solo Fase 7: evaluacion de competencia inicial (la del puesto en curso). */
  competency: CompetencySnapshot | null;
  /** Ruta por puesto: cada puesto con su lugar, estado y evaluacion (Fases 5-7). */
  positions: InductionPositionTrackEntry[];
}

export interface InductionPositionTrackEntry {
  position_id: number;
  position_code: string;
  position_name: string;
  sequence: number;
  /** Fases 5-6: QUEUED / ACTIVE / CANCELLED; Fase 7: null (no hay inscripcion). */
  queue_status: 'QUEUED' | 'ACTIVE' | 'CANCELLED' | null;
  enrollment_id: number | null;
  evaluation_status: string | null;
  passed: boolean;
  cancelled_reason: string | null;
  /** Solo Fase 7: REH-REG-003 INICIAL del puesto. */
  competency: CompetencySnapshot | null;
}

export interface InductionEmployee360 {
  employee: {
    id: number;
    full_name: string;
    employee_code: string;
    email: string | null;
    phone: string | null;
    area: string | null;
    branch_name: string | null;
    position_id: number | null;
    position_name: string | null;
    is_active: boolean;
    user_linked: boolean;
  };
  track: InductionTrackPhase[];
  position_track: InductionPositionTrackPhase[];
  enrollments: InductionRosterRow[];
  documents: InductionReadingDocumentDetail[];
  attempts: InductionAttemptDetail[];
  audit: InductionAuditEntry[];
}

const iso = (value: unknown): string | null => (value ? toIsoDateTime(value) : null);

const loadEmployee = async (employeeId: number): Promise<InductionEmployee360['employee'] | null> => {
  const result = await pool.query(
    `SELECT emp.id, emp.full_name, emp.employee_code, emp.email, emp.phone, emp.area, emp.is_active,
            emp.user_id IS NOT NULL AS user_linked, bu.name AS branch_name,
            (SELECT rp.name FROM public.rh_employee_positions rep
               JOIN public.rh_positions rp ON rp.id = rep.position_id
              WHERE rep.employee_id = emp.id AND rep.is_active = TRUE
              ORDER BY rep.assigned_at DESC LIMIT 1) AS position_name,
            (SELECT rep.position_id FROM public.rh_employee_positions rep
              WHERE rep.employee_id = emp.id AND rep.is_active = TRUE
              ORDER BY rep.assigned_at DESC LIMIT 1) AS position_id
       FROM public.employees emp
       LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id
      WHERE emp.id = $1 LIMIT 1;`,
    [employeeId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: Number(row.id),
    full_name: String(row.full_name),
    employee_code: String(row.employee_code ?? ''),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    area: row.area ? String(row.area) : null,
    branch_name: row.branch_name ? String(row.branch_name) : null,
    position_id: row.position_id ? Number(row.position_id) : null,
    position_name: row.position_name ? String(row.position_name) : null,
    is_active: Boolean(row.is_active),
    user_linked: Boolean(row.user_linked),
  };
};

const loadDocuments = async (enrollmentIds: number[]): Promise<InductionReadingDocumentDetail[]> => {
  if (enrollmentIds.length === 0) {
    return [];
  }
  const result = await pool.query(
    `SELECT ri.enrollment_id, ri.document_id, d.code AS document_code,
            COALESCE(pub.title_snapshot, d.title) AS title,
            a.id AS acknowledgement_id, a.status, a.pages_total, COALESCE(array_length(a.pages_seen, 1), 0) AS pages_seen,
            a.active_seconds, a.current_page, a.started_at, a.read_completed_at, a.signed_at, a.deadline_at, a.last_progress_at
       FROM public.rh_induction_reading_items ri
       JOIN public.documents d ON d.id = ri.document_id
       LEFT JOIN public.quality_reading_acknowledgements a ON a.id = ri.acknowledgement_id
       LEFT JOIN public.quality_reading_publications pub ON pub.id = a.publication_id
      WHERE ri.enrollment_id = ANY($1::bigint[])
      ORDER BY ri.enrollment_id ASC, ri.id ASC;`,
    [enrollmentIds],
  );
  return result.rows.map((row) => ({
    enrollment_id: Number(row.enrollment_id),
    document_id: String(row.document_id),
    document_code: row.document_code ? String(row.document_code) : null,
    title: String(row.title),
    acknowledgement_id: row.acknowledgement_id ? Number(row.acknowledgement_id) : null,
    status: row.status ? String(row.status) : null,
    pages_total: Number(row.pages_total ?? 0),
    pages_seen: Number(row.pages_seen ?? 0),
    active_seconds: Number(row.active_seconds ?? 0),
    current_page: row.current_page ? Number(row.current_page) : null,
    started_at: iso(row.started_at),
    read_completed_at: iso(row.read_completed_at),
    signed_at: iso(row.signed_at),
    deadline_at: iso(row.deadline_at),
    last_progress_at: iso(row.last_progress_at),
  }));
};

const loadAttempts = async (employeeId: number, currentAssignmentIds: Set<number>): Promise<InductionAttemptDetail[]> => {
  const result = await pool.query(
    `SELECT a.id, e.id AS enrollment_id, p.phase_number, t.id AS template_id, t.title AS template_title,
            a.status, a.attempt_no, a.available_at, a.deadline_at, a.started_at, a.submitted_at, a.graded_at,
            a.score, a.max_score, a.percentage, a.certificate_document_id,
            (SELECT COUNT(*)::int FROM public.evaluation_assignment_questions q WHERE q.assignment_id = a.id) AS question_count,
            (SELECT COUNT(*)::int FROM public.evaluation_responses r WHERE r.assignment_id = a.id) AS response_count
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.rh_induction_enrollments e ON e.employee_id = a.employee_id
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number BETWEEN 1 AND 6
        AND t.training_course_id = COALESCE(e.training_course_id, p.training_course_id)
      WHERE a.employee_id = $1
      ORDER BY p.phase_number ASC, a.created_at ASC;`,
    [employeeId],
  );
  return result.rows.map((row) => ({
    assignment_id: Number(row.id),
    enrollment_id: Number(row.enrollment_id),
    phase_number: Number(row.phase_number),
    template_id: Number(row.template_id),
    template_title: String(row.template_title),
    is_current: currentAssignmentIds.has(Number(row.id)),
    status: String(row.status),
    attempt_no: Number(row.attempt_no ?? 1),
    available_at: iso(row.available_at),
    deadline_at: iso(row.deadline_at),
    started_at: iso(row.started_at),
    submitted_at: iso(row.submitted_at),
    graded_at: iso(row.graded_at),
    score: row.score !== null && row.score !== undefined ? Number(row.score) : null,
    max_score: row.max_score !== null && row.max_score !== undefined ? Number(row.max_score) : null,
    percentage: row.percentage !== null && row.percentage !== undefined ? Number(row.percentage) : null,
    question_count: Number(row.question_count ?? 0),
    response_count: Number(row.response_count ?? 0),
    certificate_document_id: row.certificate_document_id ? Number(row.certificate_document_id) : null,
  }));
};

const loadAudit = async (employeeId: number, enrollmentIds: number[], assignmentIds: number[]): Promise<InductionAuditEntry[]> => {
  const result = await pool.query(
    `SELECT l.id, l.action, l.accessed_at, l.entity_type, l.entity_id, l.metadata, u.full_name AS actor_name
       FROM public.access_logs l
       LEFT JOIN public.users u ON u.id = l.user_id
      WHERE (l.action LIKE 'RH_INDUCTION_%' OR l.action LIKE 'RH_EVAL_AUTHORIZE_LATE%' OR l.action LIKE 'RH_EVAL_MANUAL_CLOSE%')
        AND (
          l.employee_id = $1
          OR (l.entity_type = 'induction_enrollment' AND l.entity_id = ANY($2::bigint[]))
          OR (l.entity_type = 'evaluation_assignment' AND l.entity_id = ANY($3::bigint[]))
        )
      ORDER BY l.accessed_at DESC
      LIMIT 100;`,
    [employeeId, enrollmentIds, assignmentIds],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    action: String(row.action),
    occurred_at: toIsoDateTime(row.accessed_at),
    actor_name: row.actor_name ? String(row.actor_name) : null,
    entity_type: row.entity_type ? String(row.entity_type) : null,
    entity_id: row.entity_id !== null && row.entity_id !== undefined ? Number(row.entity_id) : null,
    metadata: row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : null,
  }));
};

const loadPositionTrack = async (employeeId: number): Promise<InductionPositionTrackPhase[]> => {
  const phases = await pool.query(
    `SELECT id, phase_number, name, published_at FROM public.rh_induction_phases
      WHERE scope = 'POSITION' AND phase_number BETWEEN 5 AND ${PHASE7_NUMBER} ORDER BY phase_number ASC;`,
  );
  const competencies = (await loadInitialCompetencyRoutes([employeeId])).get(employeeId) ?? [];
  const track: InductionPositionTrackPhase[] = [];
  let phase6Passed: InductionPositionTrackEntry[] = [];
  for (const row of phases.rows) {
    const phaseNumber = Number(row.phase_number);
    const isPhase7 = phaseNumber === PHASE7_NUMBER;
    let positions: InductionPositionTrackEntry[];
    if (isPhase7) {
      // Un REH-REG-003 INICIAL por cada puesto que acredito la Fase 6 (en ese orden).
      positions = phase6Passed.map((entry) => {
        const competency = competencies.find((item) => item.position_id === entry.position_id) ?? null;
        return {
          ...entry,
          queue_status: null,
          enrollment_id: null,
          evaluation_status: competency?.status ?? null,
          passed: Boolean(competency && competencyStage(competency) === 'APROBADA'),
          cancelled_reason: null,
          competency,
        };
      });
    } else {
      const entries = await loadTrackEntries(employeeId, Number(row.id));
      positions = entries.map((entry) => ({
        position_id: entry.position_id,
        position_code: entry.position_code,
        position_name: entry.position_name,
        sequence: entry.sequence,
        queue_status: entry.queue_status,
        enrollment_id: entry.enrollment_id,
        evaluation_status: entry.evaluation_status,
        passed: entry.passed,
        cancelled_reason: entry.cancelled_reason,
        competency: null,
      }));
      if (phaseNumber === 6) phase6Passed = positions.filter((entry) => entry.passed && entry.queue_status !== 'CANCELLED');
    }
    const open = positions.filter((entry) => entry.queue_status !== 'CANCELLED');
    const current = open.find((entry) => !entry.passed) ?? open[open.length - 1] ?? null;
    let transition: InductionPositionTrackPhase['transition'] = null;
    const [candidate] = await loadTransitionRows(phaseNumber as TransitionTarget, [employeeId]);
    if (candidate && (open.length === 0 || isPhase7)) transition = { state: candidate.state, blocks: candidate.blocks };
    track.push({
      phase_id: Number(row.id),
      phase_number: phaseNumber,
      phase_name: String(row.name),
      published: Boolean(row.published_at),
      enrollment_id: current?.enrollment_id ?? null,
      transition,
      competency: current?.competency ?? null,
      positions,
    });
  }
  return track;
};

export const getInductionEmployee360 = async (employeeId: number): Promise<InductionEmployee360 | null> => {
  const employee = await loadEmployee(employeeId);
  if (!employee) {
    return null;
  }
  // Auto-sanado: si aprobo una fase con avance automatico y aun no esta en la siguiente, lo avanza.
  await tryAdvanceEmployeeIfEligible(employeeId);
  await tryActivateDeferredEnrollments({ employeeId });
  const enrollments = await loadEmployeeRosterRows(employeeId);
  const enrollmentIds = enrollments.map((row) => row.enrollment_id);
  const currentAssignmentIds = new Set(
    enrollments.map((row) => row.evaluation_assignment_id).filter((id): id is number => id !== null),
  );
  const [track, positionTrack, documents, attempts] = await Promise.all([
    getInstitutionalTrack(employeeId),
    loadPositionTrack(employeeId),
    loadDocuments(enrollmentIds),
    loadAttempts(employeeId, currentAssignmentIds),
  ]);
  const audit = await loadAudit(
    employeeId,
    enrollmentIds,
    attempts.map((attempt) => attempt.assignment_id),
  );
  return { employee, track, position_track: positionTrack, enrollments, documents, attempts, audit };
};
