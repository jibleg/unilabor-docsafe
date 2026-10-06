import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import { createEvaluation } from './rh-competency-evaluation.service';
import { normalizeSearchText } from './rh-induction-dashboard.service';
import { enrollEmployeeInPhase } from './rh-induction.service';
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
  | 'PUESTO_SIN_COMPETENCIAS';

export const TRANSITION_BLOCK_REASONS: TransitionBlockReason[] = [
  'SIN_USUARIO',
  'SIN_PUESTO',
  'FASE_EN_BORRADOR',
  'PUESTO_NO_HABILITADO',
  'PUESTO_SIN_DOCUMENTOS',
  'EVALUACION_NO_LISTA',
  'PUESTO_SIN_COMPETENCIAS',
];

export interface TransitionBlock {
  reason: TransitionBlockReason;
  detail: string;
}


/** Datos crudos de un candidato (aprobo la fase anterior y no esta en la destino). */
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
  previous_enrollment_id: number;
  previous_passed_at: string | null;
  previous_percentage: number | null;
  previous_certificate_document_id: number | null;
  target_course_id: number | null;
  documents_total: number;
  competencies_total: number;
  evaluation_state: PositionEvaluationState;
  competency: CompetencySnapshot | null;
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

const CANDIDATE_SELECT = (target: TransitionTarget): string => `
  SELECT emp.id AS employee_id, emp.full_name AS employee_name, emp.employee_code,
         emp.user_id IS NOT NULL AS user_linked, emp.area, bu.name AS branch_name,
         pos.position_id, pos.position_code, pos.position_name,
         prev.id AS previous_enrollment_id, COALESCE(ea.graded_at, ea.submitted_at) AS previous_passed_at,
         ea.percentage AS previous_percentage, ea.certificate_document_id AS previous_certificate_document_id,
         pp.training_course_id AS target_course_id,
         (SELECT COUNT(*)::int FROM public.rh_position_documents pd WHERE pd.position_id = pos.position_id) AS documents_total,
         (SELECT COUNT(*)::int FROM public.rh_position_competencies pc WHERE pc.position_id = pos.position_id) AS competencies_total,
         ev.template_id, ev.status AS evaluation_status, ev.question_count,
         ce.id AS competency_id, ce.status AS competency_status, ce.evaluation_date AS competency_date,
         ce.evaluator_name AS competency_evaluator, ce.final_pct AS competency_final_pct, ce.dictamen AS competency_dictamen,
         ce.authorization_result AS competency_authorization, ce.closed_at AS competency_closed_at
    FROM public.rh_induction_enrollments prev
    JOIN public.rh_induction_phases prev_phase ON prev_phase.id = prev.phase_id AND prev_phase.phase_number = ${target - 1}
    JOIN public.evaluation_assignments ea ON ea.id = prev.evaluation_assignment_id AND ea.status = 'passed'
    JOIN public.employees emp ON emp.id = prev.employee_id AND emp.is_active = TRUE
    LEFT JOIN public.helpdesk_asset_units bu ON bu.id = emp.branch_id
    LEFT JOIN LATERAL (
      SELECT rp.id AS position_id, rp.code AS position_code, rp.name AS position_name
        FROM public.rh_employee_positions rep
        JOIN public.rh_positions rp ON rp.id = rep.position_id AND rp.is_active = TRUE
       WHERE rep.employee_id = emp.id AND rep.is_active = TRUE
       ORDER BY rep.assigned_at DESC LIMIT 1
    ) pos ON TRUE
    LEFT JOIN public.rh_induction_phase_positions pp ON pp.phase_id = $1 AND pp.position_id = pos.position_id
    ${courseEvaluationLateral('pp.training_course_id', `'${evaluationModeForPhase(target)}'`, 'ev')}
    LEFT JOIN LATERAL (
      SELECT c.* FROM public.rh_competency_evaluations c
       WHERE c.employee_id = emp.id AND c.evaluation_type = 'INICIAL'
       ORDER BY c.created_at DESC LIMIT 1
    ) ce ON ${target === 7 ? 'TRUE' : 'FALSE'}
   WHERE ${
     target === 7
       ? 'TRUE'
       : 'NOT EXISTS (SELECT 1 FROM public.rh_induction_enrollments nx WHERE nx.employee_id = emp.id AND nx.phase_id = $1)'
   }
`;

const iso = (value: unknown): string | null => (value ? toIsoDateTime(value) : null);
export const mapCandidate = (row: any, target: TransitionTarget): TransitionCandidate => ({
  employee_id: Number(row.employee_id),
  employee_name: String(row.employee_name),
  employee_code: String(row.employee_code ?? ''),
  user_linked: Boolean(row.user_linked),
  area: row.area ? String(row.area) : null,
  branch_name: row.branch_name ? String(row.branch_name) : null,
  position_id: row.position_id ? Number(row.position_id) : null,
  position_code: row.position_code ? String(row.position_code) : null,
  position_name: row.position_name ? String(row.position_name) : null,
  previous_enrollment_id: Number(row.previous_enrollment_id),
  previous_passed_at: iso(row.previous_passed_at),
  previous_percentage: row.previous_percentage !== null && row.previous_percentage !== undefined ? Number(row.previous_percentage) : null,
  previous_certificate_document_id: row.previous_certificate_document_id ? Number(row.previous_certificate_document_id) : null,
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
  competency: row.competency_id
    ? mapCompetencySnapshot({
        id: row.competency_id,
        status: row.competency_status,
        evaluation_date: row.competency_date,
        evaluator_name: row.competency_evaluator,
        final_pct: row.competency_final_pct,
        dictamen: row.competency_dictamen,
        authorization_result: row.competency_authorization,
        closed_at: row.competency_closed_at,
      })
    : null,
});

const hoursSince = (isoValue: string | null, now: Date): number | null =>
  isoValue ? Math.max(0, Math.round(((now.getTime() - new Date(isoValue).getTime()) / 3_600_000) * 10) / 10) : null;

export const loadTransitionRows = async (target: TransitionTarget, employeeIds?: number[]): Promise<TransitionRow[]> => {
  const phase = await loadTransitionPhase(target);
  const filter = employeeIds ? ' AND emp.id = ANY($2::bigint[])' : '';
  const result = await pool.query(
    `${CANDIDATE_SELECT(target)}${filter} ORDER BY emp.full_name ASC;`,
    employeeIds ? [phase.phase_id, employeeIds] : [phase.phase_id],
  );
  const now = new Date();
  return result.rows.map((raw) => {
    const candidate = mapCandidate(raw, target);
    const evaluation = evaluateTransition(candidate, target, phase);
    return { ...candidate, target, ...evaluation, waiting_hours: hoursSince(candidate.previous_passed_at, now) };
  });
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
    return { ...base, ok: false, created_id: null, message: 'Ya tiene su evaluacion de competencia inicial.' };
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
      return { ...base, ok: true, created_id: evaluation.id, message: 'Evaluacion de competencia inicial (Fase 7) abierta en borrador.' };
    }
    const enrollment = await enrollEmployeeInPhase(row.employee_id, phase.phase_id, input.actorUserId, null, {
      origin: 'ADVANCE',
      advancedFromEnrollmentId: row.previous_enrollment_id,
      graceHours: phase.advance_grace_hours,
    });
    return {
      ...base,
      ok: true,
      created_id: enrollment.id,
      message:
        input.target === 5
          ? phase.advance_grace_hours
            ? `Inscrito en la Fase 5; sus lecturas se activan en ${phase.advance_grace_hours} h.`
            : 'Inscrito en la Fase 5 con sus lecturas asignadas.'
          : 'Inscrito en la Fase 6; queda pendiente la captura de su evaluacion practica.',
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
