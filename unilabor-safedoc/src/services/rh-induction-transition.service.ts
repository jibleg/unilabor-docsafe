import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { createEvaluation } from './rh-competency-evaluation.service';
import { normalizeSearchText } from './rh-induction-dashboard.service';
import { enrollEmployeeInPhase } from './rh-induction.service';
import { queueNotifyCompetencyOpened } from './rh-induction-notification.service';
import {
  courseEvaluationLateral,
  evaluationModeForPhase,
  POSITION_EVALUATION_STATE_LABEL,
  resolvePositionEvaluationState,
} from './rh-induction-position-evaluation';
import type { PositionEvaluationState } from './rh-induction-position-evaluation';
import { mapCompetencySnapshot } from './rh-induction-phase7';
import type { CompetencySnapshot } from './rh-induction-phase7';

// -----------------------------------------------------------------------------
// Bandeja de avance de las fases por puesto (4 -> 5 -> 6 -> 7). Cada
// colaborador que aprobo su fase y no esta en la siguiente aparece en un solo
// estado visible: LISTO (cumple todo), BLOQUEADO (con el motivo exacto) o, para
// la Fase 7, EN_EVALUACION (ya tiene su REH-REG-003 inicial). Nadie queda en el
// limbo: RH lo ve, sabe que lo detiene y lo mueve desde aqui.
// -----------------------------------------------------------------------------

export type TransitionTarget = 5 | 6 | 7;
export const TRANSITION_TARGETS: TransitionTarget[] = [5, 6, 7];

export type TransitionState = 'READY' | 'BLOCKED' | 'STARTED';

export type TransitionBlockReason =
  | 'SIN_USUARIO'
  | 'SIN_PUESTO'
  | 'FASE_EN_BORRADOR'
  | 'PUESTO_NO_HABILITADO'
  | 'PUESTO_SIN_DOCUMENTOS'
  | 'EVALUACION_NO_LISTA'
  | 'PUESTO_SIN_COMPETENCIAS'
  | 'PUESTOS_PENDIENTES';

export const TRANSITION_BLOCK_REASONS: TransitionBlockReason[] = [
  'SIN_USUARIO',
  'SIN_PUESTO',
  'FASE_EN_BORRADOR',
  'PUESTO_NO_HABILITADO',
  'PUESTO_SIN_DOCUMENTOS',
  'EVALUACION_NO_LISTA',
  'PUESTO_SIN_COMPETENCIAS',
  'PUESTOS_PENDIENTES',
];

export interface TransitionBlock {
  reason: TransitionBlockReason;
  detail: string;
}


/** Estado de cada puesto del colaborador en la bandeja (ruta por puesto). */
export type TransitionPositionStatus = 'LISTO' | 'BLOQUEADO' | 'APROBADO' | 'EN_CURSO' | 'EN_COLA' | 'PENDIENTE' | 'EN_EVALUACION';

export interface TransitionPositionInfo {
  position_id: number;
  position_code: string;
  position_name: string;
  status: TransitionPositionStatus;
  detail: string | null;
}

/**
 * Datos de un candidato. `position_*` es el puesto con el que arranca (o
 * sigue) la fase destino; `positions` el estado de todos sus puestos y
 * `pending_positions` los que aun no acreditan la fase anterior.
 */
export interface TransitionCandidate {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  user_linked: boolean;
  area: string | null;
  branch_name: string | null;
  position_id: number | null;
  position_code: string | null;
  position_name: string | null;
  previous_enrollment_id: number | null;
  previous_passed_at: string | null;
  previous_percentage: number | null;
  previous_certificate_document_id: number | null;
  target_course_id: number | null;
  documents_total: number;
  competencies_total: number;
  evaluation_state: PositionEvaluationState;
  competency: CompetencySnapshot | null;
  positions?: TransitionPositionInfo[];
  pending_positions?: string[];
}

export interface TransitionRow extends TransitionCandidate {
  target: TransitionTarget;
  state: TransitionState;
  blocks: TransitionBlock[];
  waiting_hours: number | null;
}

export interface TransitionPhaseInfo {
  phase_id: number;
  phase_number: number;
  name: string;
  published: boolean;
  advance_grace_hours: number | null;
}

/** Regla pura (testeable): estado y motivos de bloqueo de un candidato. */
export const evaluateTransition = (
  candidate: TransitionCandidate,
  target: TransitionTarget,
  phase: Pick<TransitionPhaseInfo, 'published'>,
): { state: TransitionState; blocks: TransitionBlock[] } => {
  if (target === 7 && candidate.competency) {
    return { state: 'STARTED', blocks: [] };
  }
  const blocks: TransitionBlock[] = [];
  // Ruta por puesto: solo se pasa a la fase siguiente con TODOS los puestos acreditados.
  if (target !== 5 && candidate.pending_positions && candidate.pending_positions.length > 0) {
    blocks.push({
      reason: 'PUESTOS_PENDIENTES',
      detail: `Le falta acreditar la Fase ${target - 1} de: ${candidate.pending_positions.join(', ')}.`,
    });
  }
  if (target !== 7 && !candidate.user_linked) {
    blocks.push({ reason: 'SIN_USUARIO', detail: 'El expediente no tiene usuario de sistema vinculado (no puede leer ni firmar).' });
  }
  if (!candidate.position_id) {
    blocks.push({ reason: 'SIN_PUESTO', detail: 'No tiene un puesto activo asignado.' });
  } else if (target === 7) {
    if (candidate.competencies_total === 0) {
      blocks.push({ reason: 'PUESTO_SIN_COMPETENCIAS', detail: `El puesto ${candidate.position_code} no tiene competencias en el catalogo.` });
    }
  } else {
    if (!phase.published) {
      blocks.push({ reason: 'FASE_EN_BORRADOR', detail: `La Fase ${target} sigue en borrador; publicala para poder inscribir.` });
    }
    if (!candidate.target_course_id) {
      blocks.push({ reason: 'PUESTO_NO_HABILITADO', detail: `El puesto ${candidate.position_code} no esta habilitado en la Fase ${target}.` });
    } else {
      if (target === 5 && candidate.documents_total === 0) {
        blocks.push({ reason: 'PUESTO_SIN_DOCUMENTOS', detail: `El puesto ${candidate.position_code} no tiene documentos obligatorios para leer.` });
      }
      if (candidate.evaluation_state !== 'READY') {
        const what = target === 5 ? 'El cuestionario' : 'La evaluacion practica';
        blocks.push({
          reason: 'EVALUACION_NO_LISTA',
          detail: `${what} del puesto ${candidate.position_code} esta ${POSITION_EVALUATION_STATE_LABEL[candidate.evaluation_state]}.`,
        });
      }
    }
  }
  return { state: blocks.length > 0 ? 'BLOCKED' : 'READY', blocks };
};

// --- Carga --------------------------------------------------------------------

export const loadTransitionPhase = async (target: TransitionTarget): Promise<TransitionPhaseInfo> => {
  const result = await pool.query(
    `SELECT id, phase_number, name, published_at, advance_grace_hours
       FROM public.rh_induction_phases WHERE phase_number = $1 AND scope = 'POSITION' LIMIT 1;`,
    [target],
  );
  if (result.rows.length === 0) {
    const error = new Error('RH_INDUCTION_PHASE_NOT_FOUND');
    (error as any).code = 'RH_INDUCTION_PHASE_NOT_FOUND';
    (error as any).publicMessage = `No existe la Fase ${target} por puesto.`;
    throw error;
  }
  const row = result.rows[0];
  return {
    phase_id: Number(row.id),
    phase_number: Number(row.phase_number),
    name: String(row.name),
    published: Boolean(row.published_at),
    advance_grace_hours: row.advance_grace_hours ? Number(row.advance_grace_hours) : null,
  };
};

// --- Carga por conjuntos (una consulta por tipo de dato, no por colaborador) ---

const BASE_SELECT = `
  emp.id AS employee_id, emp.full_name AS employee_name, emp.employee_code,
  emp.user_id IS NOT NULL AS user_linked, emp.area, bu.name AS branch_name`;

/**
 * Colaboradores candidatos a la fase destino:
 * - 5: aprobaron la Fase 4 y no tienen inscripcion vigente en la 5;
 * - 6/7: ya estan en la fase anterior (por puesto) con al menos un puesto
 *   acreditado y aun no entran a la destino (7: la ruta de competencia se
 *   resuelve por puesto mas abajo).
 */
const loadCandidateBase = async (target: TransitionTarget, phaseId: number, employeeIds?: number[]): Promise<any[]> => {
  const filter = employeeIds ? 'AND emp.id = ANY($2::bigint[])' : '';
  const params = employeeIds ? [phaseId, employeeIds] : [phaseId];
  if (target === 5) {
    const result = await pool.query(
      `SELECT ${BASE_SELECT}, prev.id AS previous_enrollment_id, COALESCE(ea.graded_at, ea.submitted_at) AS previous_passed_at,
              ea.percentage AS previous_percentage, ea.certificate_document_id AS previous_certificate_document_id
         FROM public.rh_induction_enrollments prev
         JOIN public.rh_induction_phases pp ON pp.id = prev.phase_id AND pp.phase_number = 4
         JOIN public.evaluation_assignments ea ON ea.id = prev.evaluation_assignment_id AND ea.status = 'passed'
         JOIN public.employees emp ON emp.id = prev.employee_id AND emp.is_active = TRUE
         LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id
        WHERE NOT EXISTS (SELECT 1 FROM public.rh_induction_enrollments nx
                           WHERE nx.employee_id = emp.id AND nx.phase_id = $1 AND nx.queue_status <> 'CANCELLED')
          ${filter}
        ORDER BY emp.full_name ASC;`,
      params,
    );
    return result.rows;
  }
  // 6 y 7: ultima inscripcion ACREDITADA de la fase anterior como referencia.
  const previousPhase = target - 1;
  const notInTarget =
    target === 6
      ? `AND NOT EXISTS (SELECT 1 FROM public.rh_induction_enrollments nx
                          WHERE nx.employee_id = emp.id AND nx.phase_id = $1 AND nx.queue_status <> 'CANCELLED')`
      : 'AND $1::bigint IS NOT NULL'; // Fase 7 no tiene inscripcion: la ruta se resuelve por puesto.
  const result = await pool.query(
    `SELECT ${BASE_SELECT}, last.id AS previous_enrollment_id, last.passed_at AS previous_passed_at,
            last.percentage AS previous_percentage, last.certificate_document_id AS previous_certificate_document_id
       FROM public.employees emp
       LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id
       JOIN LATERAL (
         SELECT e.id, COALESCE(ea.graded_at, ea.submitted_at) AS passed_at, ea.percentage, ea.certificate_document_id
           FROM public.rh_induction_enrollments e
           JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = ${previousPhase}
           JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id AND ea.status = 'passed'
          WHERE e.employee_id = emp.id AND e.queue_status <> 'CANCELLED'
          ORDER BY COALESCE(ea.graded_at, ea.submitted_at) DESC NULLS LAST
          LIMIT 1
       ) last ON TRUE
      WHERE emp.is_active = TRUE ${notInTarget} ${filter}
      ORDER BY emp.full_name ASC;`,
    params,
  );
  return result.rows;
};

interface PositionFact {
  employee_id: number;
  position_id: number;
  position_code: string;
  position_name: string;
  assigned_at: string;
  target_course_id: number | null;
  documents_total: number;
  competencies_total: number;
  evaluation_state: PositionEvaluationState;
}

/** Puestos activos de los candidatos con su preparacion para la fase destino. */
const loadPositionFacts = async (target: TransitionTarget, phaseId: number, employeeIds: number[]): Promise<PositionFact[]> => {
  if (employeeIds.length === 0) return [];
  const result = await pool.query(
    `SELECT rep.employee_id, rp.id AS position_id, rp.code AS position_code, rp.name AS position_name, rep.assigned_at,
            pp.training_course_id AS target_course_id,
            (SELECT COUNT(*)::int FROM public.rh_position_documents pd JOIN public.documents d ON d.id = pd.document_id
              WHERE pd.position_id = rp.id AND d.status = 'active') AS documents_total,
            (SELECT COUNT(*)::int FROM public.rh_position_competencies pc WHERE pc.position_id = rp.id) AS competencies_total,
            ev.template_id, ev.status AS evaluation_status, ev.question_count
       FROM public.rh_employee_positions rep
       JOIN public.rh_positions rp ON rp.id = rep.position_id AND rp.is_active = TRUE
       LEFT JOIN public.rh_induction_phase_positions pp ON pp.phase_id = $1 AND pp.position_id = rp.id
       ${courseEvaluationLateral('pp.training_course_id', `'${evaluationModeForPhase(target === 7 ? 6 : target)}'`, 'ev')}
      WHERE rep.is_active = TRUE AND rep.employee_id = ANY($2::bigint[]);`,
    [phaseId, employeeIds],
  );
  return result.rows.map((row) => ({
    employee_id: Number(row.employee_id),
    position_id: Number(row.position_id),
    position_code: String(row.position_code),
    position_name: String(row.position_name),
    assigned_at: new Date(row.assigned_at).toISOString(),
    target_course_id: row.target_course_id ? Number(row.target_course_id) : null,
    documents_total: Number(row.documents_total ?? 0),
    competencies_total: Number(row.competencies_total ?? 0),
    evaluation_state:
      target === 7
        ? 'READY'
        : resolvePositionEvaluationState(
            {
              template_id: row.template_id ? Number(row.template_id) : null,
              status: row.evaluation_status ? String(row.evaluation_status) : null,
              question_count: Number(row.question_count ?? 0),
            },
            evaluationModeForPhase(target),
          ),
  }));
};

interface OpenEntryFact {
  employee_id: number;
  phase_number: number;
  position_id: number;
  sequence: number;
  queue_status: string;
  passed: boolean;
}

/** Inscripciones vigentes (no canceladas) de las fases por puesto de los candidatos. */
const loadOpenEntries = async (employeeIds: number[]): Promise<OpenEntryFact[]> => {
  if (employeeIds.length === 0) return [];
  const result = await pool.query(
    `SELECT e.employee_id, p.phase_number, e.position_id, COALESCE(e.position_sequence, 1) AS sequence, e.queue_status,
            COALESCE(ea.status = 'passed', FALSE) AS passed
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.scope = 'POSITION'
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.employee_id = ANY($1::bigint[]) AND e.queue_status <> 'CANCELLED' AND e.position_id IS NOT NULL;`,
    [employeeIds],
  );
  return result.rows.map((row) => ({
    employee_id: Number(row.employee_id),
    phase_number: Number(row.phase_number),
    position_id: Number(row.position_id),
    sequence: Number(row.sequence),
    queue_status: String(row.queue_status),
    passed: Boolean(row.passed),
  }));
};

/** REH-REG-003 INICIAL mas reciente por (colaborador, puesto). */
const loadCompetenciesByPosition = async (employeeIds: number[]): Promise<Map<string, CompetencySnapshot>> => {
  if (employeeIds.length === 0) return new Map();
  const result = await pool.query(
    `SELECT DISTINCT ON (employee_id, position_id) id, employee_id, position_id, status, evaluation_date, evaluator_name,
            final_pct, dictamen, authorization_result, closed_at
       FROM public.rh_competency_evaluations
      WHERE evaluation_type = 'INICIAL' AND employee_id = ANY($1::bigint[])
      ORDER BY employee_id, position_id, created_at DESC;`,
    [employeeIds],
  );
  return new Map(result.rows.map((row) => [`${row.employee_id}:${row.position_id}`, mapCompetencySnapshot(row)]));
};

const ENTRY_STATUS_LABEL = (entry: OpenEntryFact | undefined): { status: TransitionPositionStatus; detail: string } => {
  if (!entry) return { status: 'PENDIENTE', detail: 'Sin inscripcion en la fase anterior' };
  if (entry.passed) return { status: 'APROBADO', detail: 'Acreditado' };
  if (entry.queue_status === 'QUEUED') return { status: 'EN_COLA', detail: 'En cola' };
  return { status: 'EN_CURSO', detail: 'En curso' };
};

const isCompetencyAuthorized = (snapshot: CompetencySnapshot): boolean =>
  snapshot.status === 'CLOSED' &&
  (snapshot.authorization_result === 'AUTORIZADO' || snapshot.authorization_result === 'AUTORIZADO_CON_SEGUIMIENTO');

const toCandidate = (base: any, fact: PositionFact | undefined): TransitionCandidate => ({
  employee_id: Number(base.employee_id),
  employee_name: String(base.employee_name),
  employee_code: String(base.employee_code ?? ''),
  user_linked: Boolean(base.user_linked),
  area: base.area ? String(base.area) : null,
  branch_name: base.branch_name ? String(base.branch_name) : null,
  position_id: fact?.position_id ?? null,
  position_code: fact?.position_code ?? null,
  position_name: fact?.position_name ?? null,
  previous_enrollment_id: base.previous_enrollment_id ? Number(base.previous_enrollment_id) : null,
  previous_passed_at: iso(base.previous_passed_at),
  previous_percentage:
    base.previous_percentage !== null && base.previous_percentage !== undefined ? Number(base.previous_percentage) : null,
  previous_certificate_document_id: base.previous_certificate_document_id ? Number(base.previous_certificate_document_id) : null,
  target_course_id: fact?.target_course_id ?? null,
  documents_total: fact?.documents_total ?? 0,
  competencies_total: fact?.competencies_total ?? 0,
  evaluation_state: fact?.evaluation_state ?? 'MISSING',
  competency: null,
  positions: [],
  pending_positions: [],
});

const byAssignedAt = (a: PositionFact, b: PositionFact): number =>
  new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime() || a.position_code.localeCompare(b.position_code);

/**
 * Construye la fila de la bandeja de un colaborador: el puesto con el que
 * arranca (o sigue) la fase destino y el estado de cada uno de sus puestos.
 * Devuelve null si ya no tiene nada pendiente en esa fase (Fase 7 concluida).
 */
const buildCandidate = (
  target: TransitionTarget,
  phase: Pick<TransitionPhaseInfo, 'published'>,
  base: any,
  facts: PositionFact[],
  entries: OpenEntryFact[],
  competencies: Map<string, CompetencySnapshot>,
): TransitionCandidate | null => {
  const employeeId = Number(base.employee_id);
  const own = facts.filter((fact) => fact.employee_id === employeeId);
  const readiness = (fact: PositionFact) => evaluateTransition(toCandidate(base, fact), target, phase);

  if (target === 5) {
    const ordered = [...own].sort(byAssignedAt);
    const chosen = ordered.find((fact) => readiness(fact).state === 'READY') ?? ordered[0];
    const candidate = toCandidate(base, chosen);
    candidate.positions = ordered.map((fact) => {
      const check = readiness(fact);
      return {
        position_id: fact.position_id,
        position_code: fact.position_code,
        position_name: fact.position_name,
        status: check.state === 'READY' ? 'LISTO' : 'BLOQUEADO',
        detail: check.blocks.map((block) => block.detail).join(' ') || null,
      };
    });
    return candidate;
  }

  const previousPhase = target - 1;
  const previousEntries = entries.filter((entry) => entry.employee_id === employeeId && entry.phase_number === previousPhase);
  const entryOf = (positionId: number) => previousEntries.find((entry) => entry.position_id === positionId);
  const sequenceOf = (fact: PositionFact) => entryOf(fact.position_id)?.sequence ?? Number.MAX_SAFE_INTEGER;
  const ordered = [...own].sort((a, b) => sequenceOf(a) - sequenceOf(b) || byAssignedAt(a, b));
  const pending = ordered.filter((fact) => !entryOf(fact.position_id)?.passed);
  const passed = ordered.filter((fact) => entryOf(fact.position_id)?.passed);

  if (target === 6) {
    const chosen = passed.find((fact) => readiness(fact).state === 'READY') ?? passed[0] ?? ordered[0];
    const candidate = toCandidate(base, chosen);
    candidate.pending_positions = pending.map((fact) => fact.position_code);
    candidate.positions = ordered.map((fact) => {
      const entry = entryOf(fact.position_id);
      if (!entry?.passed) {
        const label = ENTRY_STATUS_LABEL(entry);
        return { ...pick(fact), status: label.status, detail: `Fase 5: ${label.detail.toLowerCase()}` };
      }
      const check = readiness(fact);
      return { ...pick(fact), status: check.state === 'READY' ? 'LISTO' : 'BLOQUEADO', detail: check.blocks.map((b) => b.detail).join(' ') || null };
    });
    return candidate;
  }

  // Fase 7: un REH-REG-003 INICIAL por puesto, en el orden de la Fase 6.
  const competencyOf = (fact: PositionFact) => competencies.get(`${employeeId}:${fact.position_id}`);
  const inProgress = passed.find((fact) => competencyOf(fact) && !isCompetencyAuthorized(competencyOf(fact)!));
  const next = passed.find((fact) => !competencyOf(fact));
  if (!inProgress && !next && pending.length === 0) {
    return null; // Todos sus puestos con competencia autorizada: concluyo la Fase 7.
  }
  const chosen = inProgress ?? next ?? pending[0];
  const candidate = toCandidate(base, chosen);
  candidate.pending_positions = pending.map((fact) => fact.position_code);
  candidate.competency = inProgress ? competencyOf(inProgress)! : null;
  candidate.positions = ordered.map((fact) => {
    const entry = entryOf(fact.position_id);
    if (!entry?.passed) {
      const label = ENTRY_STATUS_LABEL(entry);
      return { ...pick(fact), status: label.status, detail: `Fase 6: ${label.detail.toLowerCase()}` };
    }
    const snapshot = competencyOf(fact);
    if (!snapshot) return { ...pick(fact), status: 'PENDIENTE', detail: 'Sin REH-REG-003 inicial' };
    if (isCompetencyAuthorized(snapshot)) return { ...pick(fact), status: 'APROBADO', detail: 'Competencia autorizada' };
    return { ...pick(fact), status: 'EN_EVALUACION', detail: 'REH-REG-003 en proceso' };
  });
  return candidate;
};

const pick = (fact: PositionFact) => ({
  position_id: fact.position_id,
  position_code: fact.position_code,
  position_name: fact.position_name,
});

const iso = (value: unknown): string | null => (value ? toIsoDateTime(value) : null);

const hoursSince = (isoValue: string | null, now: Date): number | null =>
  isoValue ? Math.max(0, Math.round(((now.getTime() - new Date(isoValue).getTime()) / 3_600_000) * 10) / 10) : null;

export const loadTransitionRows = async (target: TransitionTarget, employeeIds?: number[]): Promise<TransitionRow[]> => {
  const phase = await loadTransitionPhase(target);
  const bases = await loadCandidateBase(target, phase.phase_id, employeeIds);
  const ids = bases.map((base) => Number(base.employee_id));
  const [facts, entries, competencies] = await Promise.all([
    loadPositionFacts(target, phase.phase_id, ids),
    target === 5 ? Promise.resolve([] as OpenEntryFact[]) : loadOpenEntries(ids),
    target === 7 ? loadCompetenciesByPosition(ids) : Promise.resolve(new Map<string, CompetencySnapshot>()),
  ]);
  const now = new Date();
  const rows: TransitionRow[] = [];
  for (const base of bases) {
    const candidate = buildCandidate(target, phase, base, facts, entries, competencies);
    if (!candidate) continue;
    const evaluation = evaluateTransition(candidate, target, phase);
    rows.push({ ...candidate, target, ...evaluation, waiting_hours: hoursSince(candidate.previous_passed_at, now) });
  }
  return rows;
};

// --- Bandeja (consulta paginada) ----------------------------------------------

export interface TransitionQueueQuery {
  target: TransitionTarget;
  state?: TransitionState | undefined;
  reason?: TransitionBlockReason | undefined;
  search?: string | undefined;
  page: number;
  limit: number;
}

export interface TransitionQueuePage {
  phase: TransitionPhaseInfo;
  rows: TransitionRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  state_counts: Record<TransitionState, number>;
  reason_counts: Record<TransitionBlockReason, number>;
}

export const filterTransitionRows = (all: TransitionRow[], query: Omit<TransitionQueueQuery, 'target'>) => {
  const search = query.search ? normalizeSearchText(query.search) : '';
  const searched = search
    ? all.filter((row) =>
        normalizeSearchText([row.employee_name, row.employee_code, row.position_code ?? '', row.position_name ?? '', row.branch_name ?? ''].join(' ')).includes(
          search,
        ),
      )
    : all;
  const stateCounts: Record<TransitionState, number> = { READY: 0, BLOCKED: 0, STARTED: 0 };
  const reasonCounts = TRANSITION_BLOCK_REASONS.reduce(
    (acc, reason) => ({ ...acc, [reason]: 0 }),
    {} as Record<TransitionBlockReason, number>,
  );
  for (const row of searched) {
    stateCounts[row.state] += 1;
    for (const block of row.blocks) reasonCounts[block.reason] += 1;
  }
  const filtered = searched.filter(
    (row) => (!query.state || row.state === query.state) && (!query.reason || row.blocks.some((block) => block.reason === query.reason)),
  );
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
    state_counts: stateCounts,
    reason_counts: reasonCounts,
  };
};

export const queryTransitionQueue = async (query: TransitionQueueQuery): Promise<TransitionQueuePage> => {
  const [phase, rows] = await Promise.all([loadTransitionPhase(query.target), loadTransitionRows(query.target)]);
  return { phase, ...filterTransitionRows(rows, query) };
};

/** Conteos por destino para el panorama (cuantos esperan y cuantos estan listos). */
export const summarizeTransitions = async (): Promise<Array<{ target: TransitionTarget } & Record<TransitionState, number>>> => {
  const summaries = [];
  for (const target of TRANSITION_TARGETS) {
    const rows = await loadTransitionRows(target);
    const counts: Record<TransitionState, number> = { READY: 0, BLOCKED: 0, STARTED: 0 };
    for (const row of rows) counts[row.state] += 1;
    summaries.push({ target, ...counts });
  }
  return summaries;
};

// --- Ejecucion ------------------------------------------------------------------

export interface ExecuteTransitionInput {
  target: TransitionTarget;
  employeeIds: number[];
  actorUserId: string;
  /** Solo Fase 7: quien aplica la evaluacion de competencia inicial (REH-REG-003). */
  evaluatorName?: string | undefined;
  evaluationDate?: string | undefined;
}

export interface TransitionResult {
  employee_id: number;
  employee_name: string;
  ok: boolean;
  message: string;
  /** Inscripcion creada (Fases 5-6) o evaluacion de competencia creada (Fase 7). */
  created_id: number | null;
  previous_enrollment_id: number | null;
}

const todayInMexico = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

const loadPositionCourse = async (phaseNumber: number, positionId: number): Promise<number | null> => {
  const result = await pool.query(
    `SELECT pp.training_course_id FROM public.rh_induction_phase_positions pp
       JOIN public.rh_induction_phases p ON p.id = pp.phase_id
      WHERE p.phase_number = $1 AND p.scope = 'POSITION' AND pp.position_id = $2 LIMIT 1;`,
    [phaseNumber, positionId],
  );
  return result.rows[0]?.training_course_id ? Number(result.rows[0].training_course_id) : null;
};

const runOne = async (row: TransitionRow, phase: TransitionPhaseInfo, input: ExecuteTransitionInput): Promise<TransitionResult> => {
  const base = { employee_id: row.employee_id, employee_name: row.employee_name, previous_enrollment_id: row.previous_enrollment_id };
  if (row.state === 'STARTED') {
    return { ...base, ok: false, created_id: null, message: `Su REH-REG-003 del puesto ${row.position_code} sigue en proceso.` };
  }
  if (row.state === 'BLOCKED') {
    return { ...base, ok: false, created_id: null, message: row.blocks.map((block) => block.detail).join(' ') };
  }
  try {
    if (input.target === 7) {
      const evaluation = await createEvaluation({
        employeeId: row.employee_id,
        positionId: row.position_id as number,
        evaluationType: 'INICIAL',
        evaluationDate: input.evaluationDate ?? todayInMexico(),
        evaluatorName: input.evaluatorName ?? '',
        referenceCourseId: await loadPositionCourse(6, row.position_id as number),
        createdByUserId: input.actorUserId,
      });
      // Aviso al colaborador (SMS): se abrio su evaluacion de competencia de este puesto.
      queueNotifyCompetencyOpened(row.employee_id, row.position_id as number);
      return {
        ...base,
        ok: true,
        created_id: evaluation.id,
        message: `Evaluacion de competencia inicial (Fase 7) del puesto ${row.position_code} abierta en borrador.`,
      };
    }
    const enrollment = await enrollEmployeeInPhase(row.employee_id, phase.phase_id, input.actorUserId, null, {
      origin: 'ADVANCE',
      advancedFromEnrollmentId: row.previous_enrollment_id,
    });
    const total = row.positions?.length ?? 1;
    const tail = total > 1 ? ` Sigue con sus otros ${total - 1} puesto(s), uno tras otro.` : '';
    return {
      ...base,
      ok: true,
      created_id: enrollment.id,
      message:
        input.target === 5
          ? `Inscrito en la Fase 5; inicia con el puesto ${row.position_code} y sus lecturas asignadas.${tail}`
          : `Inscrito en la Fase 6; inicia con la practica del puesto ${row.position_code}.${tail}`,
    };
  } catch (error: any) {
    console.error(`Induccion: fallo el avance a la Fase ${input.target} de ${row.employee_name} (#${row.employee_id}):`, error);
    return { ...base, ok: false, created_id: null, message: error?.publicMessage || 'No se pudo completar el avance.' };
  }
};

/**
 * Mueve a la fase destino a los colaboradores indicados. Revalida cada uno al
 * momento (la bandeja pudo cambiar) y solo procesa a los LISTOS; los demas
 * regresan con su motivo. Secuencial: cada inscripcion asigna lecturas y SMS.
 */
export const executeTransition = async (input: ExecuteTransitionInput): Promise<TransitionResult[]> => {
  const phase = await loadTransitionPhase(input.target);
  const rows = await loadTransitionRows(input.target, input.employeeIds);
  const byId = new Map(rows.map((row) => [row.employee_id, row]));
  const results: TransitionResult[] = [];
  for (const employeeId of input.employeeIds) {
    const row = byId.get(employeeId);
    if (!row) {
      results.push({
        employee_id: employeeId,
        employee_name: `Colaborador #${employeeId}`,
        ok: false,
        created_id: null,
        previous_enrollment_id: null,
        message: `No esta pendiente de avanzar a la Fase ${input.target} (ya inscrito, sin aprobar la fase anterior o inactivo).`,
      });
      continue;
    }
    results.push(await runOne(row, phase, input));
  }
  return results;
};
