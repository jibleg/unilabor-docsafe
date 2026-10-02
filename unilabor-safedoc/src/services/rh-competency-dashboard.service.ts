import pool from '../config/db';
import { CompetencyEvaluationRecord, getEvaluationById } from './rh-competency-evaluation.service';

/**
 * Tablero de evaluación de competencia (REH-REG-003) para RH: panorama global
 * (todos los colaboradores activos con puesto asignado o con evaluaciones) y
 * detalle por colaborador con la trazabilidad de cada evaluación y los
 * documentos que la soportan (registro, constancia y sus versiones).
 *
 * El panorama se entrega "plano" (colaboradores + evaluaciones) para que la UI
 * aplique los filtros y recalcule indicadores y gráficas sin ir al servidor.
 */

/** Ventana en días en la que una autorización vigente se considera "por vencer". */
export const COMPETENCY_EXPIRY_WARNING_DAYS = 60;

export type CompetencyStanding =
  | 'SIN_EVALUACION'
  | 'EN_CAPTURA'
  | 'PENDIENTE_AUTORIZACION'
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDA'
  | 'NO_COMPETENTE';

const AUTHORIZED_RESULTS = ['AUTORIZADO', 'AUTORIZADO_CON_SEGUIMIENTO'];

export interface CompetencyDashboardEvaluation {
  id: number;
  employee_id: number;
  position_id: number;
  position_name: string;
  evaluation_type: string;
  evaluation_date: string;
  evaluator_name: string;
  status: 'DRAFT' | 'CLOSED';
  competency_pct: number | null;
  performance_pct: number | null;
  knowledge_pct: number | null;
  final_pct: number | null;
  veto_applied: boolean;
  dictamen: string | null;
  authorization_result: string | null;
  authorized_at: string | null;
  authorized_by_name: string | null;
  valid_until: string | null;
  reference_course_title: string | null;
  knowledge_status: string | null;
  items_total: number;
  items_scored: number;
  actions_count: number;
  document_id: number | null;
  certificate_document_id: number | null;
  closed_at: string | null;
  created_at: string;
}

export interface CompetencyDashboardEmployee {
  employee_id: number;
  full_name: string;
  employee_code: string;
  area: string | null;
  branch_name: string | null;
  positions: Array<{ id: number; name: string }>;
  standing: CompetencyStanding;
  /** Hay un borrador abierto (p. ej. reevaluación en curso aunque siga vigente). */
  has_draft: boolean;
  evaluations_count: number;
  /** Evaluación que determina el estado (última cerrada, o el borrador si no hay cerradas). */
  current_evaluation_id: number | null;
  valid_until: string | null;
  days_to_expiry: number | null;
}

export interface CompetencyDashboard {
  today: string;
  expiry_warning_days: number;
  employees: CompetencyDashboardEmployee[];
  evaluations: CompetencyDashboardEvaluation[];
}

const toDateString = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const toIso = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const daysBetween = (fromIso: string, toIsoDate: string): number =>
  Math.round((Date.parse(`${toIsoDate}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

const EVALUATIONS_QUERY = `
  SELECT
    ev.id, ev.employee_id, ev.position_id, p.name AS position_name, ev.evaluation_type, ev.evaluation_date,
    ev.evaluator_name, ev.status, ev.competency_pct, ev.performance_pct, ev.knowledge_pct, ev.final_pct,
    ev.veto_applied, ev.dictamen, ev.authorization_result, ev.authorized_at, au.full_name AS authorized_by_name,
    ev.valid_until, tc.title AS reference_course_title, ka.status AS knowledge_status,
    ev.document_id, ev.certificate_document_id, ev.closed_at, ev.created_at,
    COALESCE(it.items_total, 0) AS items_total, COALESCE(it.items_scored, 0) AS items_scored,
    COALESCE(ac.actions_count, 0) AS actions_count
  FROM public.rh_competency_evaluations ev
  JOIN public.employees e ON e.id = ev.employee_id AND e.is_active = TRUE
  JOIN public.rh_positions p ON p.id = ev.position_id
  LEFT JOIN public.training_courses tc ON tc.id = ev.reference_course_id
  LEFT JOIN public.evaluation_assignments ka ON ka.id = ev.knowledge_assignment_id
  LEFT JOIN public.users au ON au.id = ev.authorized_by_user_id
  LEFT JOIN (
    SELECT evaluation_id,
           COUNT(*)::int AS items_total,
           COUNT(*) FILTER (WHERE score IS NOT NULL OR is_correct IS NOT NULL)::int AS items_scored
      FROM public.rh_competency_evaluation_items GROUP BY evaluation_id
  ) it ON it.evaluation_id = ev.id
  LEFT JOIN (
    SELECT evaluation_id, COUNT(*)::int AS actions_count
      FROM public.rh_competency_evaluation_actions GROUP BY evaluation_id
  ) ac ON ac.evaluation_id = ev.id
  ORDER BY ev.evaluation_date DESC, ev.id DESC;
`;

const EMPLOYEES_QUERY = `
  SELECT
    e.id, e.full_name, e.employee_code, e.area, bu.name AS branch_name,
    COALESCE(
      json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL),
      '[]'::json
    ) AS positions
  FROM public.employees e
  LEFT JOIN public.helpdesk_asset_units bu ON bu.id = e.branch_id
  LEFT JOIN public.rh_employee_positions ep ON ep.employee_id = e.id AND ep.is_active = TRUE
  LEFT JOIN public.rh_positions p ON p.id = ep.position_id
  WHERE e.is_active = TRUE
    AND (ep.id IS NOT NULL OR EXISTS (SELECT 1 FROM public.rh_competency_evaluations ev WHERE ev.employee_id = e.id))
  GROUP BY e.id, bu.name
  ORDER BY e.full_name ASC;
`;

const mapEvaluation = (row: any): CompetencyDashboardEvaluation => ({
  id: Number(row.id),
  employee_id: Number(row.employee_id),
  position_id: Number(row.position_id),
  position_name: String(row.position_name),
  evaluation_type: String(row.evaluation_type),
  evaluation_date: toDateString(row.evaluation_date) ?? '',
  evaluator_name: String(row.evaluator_name),
  status: String(row.status) as 'DRAFT' | 'CLOSED',
  competency_pct: toNumberOrNull(row.competency_pct),
  performance_pct: toNumberOrNull(row.performance_pct),
  knowledge_pct: toNumberOrNull(row.knowledge_pct),
  final_pct: toNumberOrNull(row.final_pct),
  veto_applied: Boolean(row.veto_applied),
  dictamen: row.dictamen ? String(row.dictamen) : null,
  authorization_result: row.authorization_result ? String(row.authorization_result) : null,
  authorized_at: toDateString(row.authorized_at),
  authorized_by_name: row.authorized_by_name ? String(row.authorized_by_name) : null,
  valid_until: toDateString(row.valid_until),
  reference_course_title: row.reference_course_title ? String(row.reference_course_title) : null,
  knowledge_status: row.knowledge_status ? String(row.knowledge_status) : null,
  items_total: Number(row.items_total ?? 0),
  items_scored: Number(row.items_scored ?? 0),
  actions_count: Number(row.actions_count ?? 0),
  document_id: toNumberOrNull(row.document_id),
  certificate_document_id: toNumberOrNull(row.certificate_document_id),
  closed_at: toIso(row.closed_at),
  created_at: toIso(row.created_at) ?? '',
});

/**
 * Estado de competencia del colaborador a partir de sus evaluaciones (ya
 * ordenadas de la más reciente a la más antigua). Manda la última CERRADA:
 * pendiente de autorizar, no competente / no autorizada, o vigencia de la
 * autorización. Sin cerradas, un borrador abierto cuenta como "en captura".
 */
export const resolveStanding = (
  evaluations: CompetencyDashboardEvaluation[],
  today: string,
): Pick<CompetencyDashboardEmployee, 'standing' | 'current_evaluation_id' | 'valid_until' | 'days_to_expiry'> => {
  const closed = evaluations
    .filter((evaluation) => evaluation.status === 'CLOSED')
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? '') || b.id - a.id);
  const latestClosed = closed[0];
  if (!latestClosed) {
    const draft = evaluations.find((evaluation) => evaluation.status === 'DRAFT');
    return {
      standing: draft ? 'EN_CAPTURA' : 'SIN_EVALUACION',
      current_evaluation_id: draft?.id ?? null,
      valid_until: null,
      days_to_expiry: null,
    };
  }
  const base = { current_evaluation_id: latestClosed.id, valid_until: latestClosed.valid_until, days_to_expiry: null };
  if (latestClosed.authorization_result === 'PENDIENTE') {
    return { ...base, standing: 'PENDIENTE_AUTORIZACION' };
  }
  if (!AUTHORIZED_RESULTS.includes(latestClosed.authorization_result ?? '') || !latestClosed.valid_until) {
    return { ...base, standing: 'NO_COMPETENTE' };
  }
  const days = daysBetween(today, latestClosed.valid_until);
  const standing: CompetencyStanding =
    days < 0 ? 'VENCIDA' : days <= COMPETENCY_EXPIRY_WARNING_DAYS ? 'POR_VENCER' : 'VIGENTE';
  return { ...base, standing, days_to_expiry: days };
};

export const getCompetencyDashboard = async (): Promise<CompetencyDashboard> => {
  const today = new Date().toISOString().slice(0, 10);
  const [employeesResult, evaluationsResult] = await Promise.all([
    pool.query(EMPLOYEES_QUERY),
    pool.query(EVALUATIONS_QUERY),
  ]);
  const evaluations = evaluationsResult.rows.map(mapEvaluation);
  const byEmployee = new Map<number, CompetencyDashboardEvaluation[]>();
  for (const evaluation of evaluations) {
    const list = byEmployee.get(evaluation.employee_id) ?? [];
    list.push(evaluation);
    byEmployee.set(evaluation.employee_id, list);
  }

  const employees = employeesResult.rows.map((row): CompetencyDashboardEmployee => {
    const employeeId = Number(row.id);
    const own = byEmployee.get(employeeId) ?? [];
    return {
      employee_id: employeeId,
      full_name: String(row.full_name),
      employee_code: String(row.employee_code),
      area: row.area ? String(row.area) : null,
      branch_name: row.branch_name ? String(row.branch_name) : null,
      positions: Array.isArray(row.positions)
        ? row.positions.map((position: any) => ({ id: Number(position.id), name: String(position.name) }))
        : [],
      has_draft: own.some((evaluation) => evaluation.status === 'DRAFT'),
      evaluations_count: own.length,
      ...resolveStanding(own, today),
    };
  });

  return { today, expiry_warning_days: COMPETENCY_EXPIRY_WARNING_DAYS, employees, evaluations };
};

// --- Detalle por colaborador -------------------------------------------------

export interface CompetencyTraceEvent {
  id: number;
  evaluation_id: number;
  /** Código de la acción sin los sufijos (RH_COMP_EVAL_CLOSE, RH_COMP_EVAL_AUTHORIZE...). */
  action: string;
  /** Sufijo informativo (dictamen, decisión, id de documento...). */
  detail: string | null;
  user_name: string | null;
  occurred_at: string;
}

export interface CompetencySupportDocument {
  id: number;
  evaluation_id: number;
  kind: 'RECORD' | 'CERTIFICATE';
  title: string;
  document_type_name: string;
  version: number;
  is_current: boolean;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface CompetencyEmployeeDetail {
  employee_id: number;
  evaluations: CompetencyEvaluationRecord[];
  trace: CompetencyTraceEvent[];
  documents: CompetencySupportDocument[];
}

const REFERENCE_PATTERN = /^competency_(evaluation|certificate):(\d+)$/;

export const getCompetencyEmployeeDetail = async (employeeId: number): Promise<CompetencyEmployeeDetail | null> => {
  const employee = await pool.query(`SELECT id FROM public.employees WHERE id = $1 LIMIT 1;`, [employeeId]);
  if (employee.rows.length === 0) {
    return null;
  }
  const idsResult = await pool.query(
    `SELECT id FROM public.rh_competency_evaluations WHERE employee_id = $1 ORDER BY evaluation_date DESC, id DESC;`,
    [employeeId],
  );
  const evaluationIds = idsResult.rows.map((row) => Number(row.id));
  const evaluations: CompetencyEvaluationRecord[] = [];
  for (const id of evaluationIds) {
    const record = await getEvaluationById(id);
    if (record) evaluations.push(record);
  }

  const [traceResult, documentsResult] = await Promise.all([
    pool.query(
      `SELECT l.id, l.action, l.entity_id, l.accessed_at, u.full_name AS user_name
         FROM public.access_logs l
         LEFT JOIN public.users u ON u.id = l.user_id
        WHERE l.entity_type = 'competency_evaluation' AND l.entity_id = ANY($1::bigint[])
        ORDER BY l.accessed_at ASC, l.id ASC;`,
      [evaluationIds],
    ),
    pool.query(
      `SELECT d.id, d.title, d.version, d.is_current, d.status, d.issue_date, d.expiry_date, d.created_at,
              d.reference_key, dt.name AS document_type_name, u.full_name AS uploaded_by_name
         FROM public.employee_documents d
         JOIN public.document_types dt ON dt.id = d.document_type_id
         LEFT JOIN public.users u ON u.id = d.uploaded_by_user_id
        WHERE d.employee_id = $1
          AND (d.reference_key LIKE 'competency\\_evaluation:%' OR d.reference_key LIKE 'competency\\_certificate:%')
        ORDER BY d.created_at DESC, d.id DESC;`,
      [employeeId],
    ),
  ]);

  const trace = traceResult.rows.map((row): CompetencyTraceEvent => {
    const [action, , ...rest] = String(row.action ?? '').split(':');
    return {
      id: Number(row.id),
      evaluation_id: Number(row.entity_id),
      action: action ?? '',
      detail: rest.length > 0 ? rest.join(':') : null,
      user_name: row.user_name ? String(row.user_name) : null,
      occurred_at: toIso(row.accessed_at) ?? '',
    };
  });

  const documents = documentsResult.rows.flatMap((row): CompetencySupportDocument[] => {
    const match = REFERENCE_PATTERN.exec(String(row.reference_key ?? ''));
    if (!match) return [];
    return [
      {
        id: Number(row.id),
        evaluation_id: Number(match[2]),
        kind: match[1] === 'certificate' ? 'CERTIFICATE' : 'RECORD',
        title: String(row.title),
        document_type_name: String(row.document_type_name),
        version: Number(row.version),
        is_current: Boolean(row.is_current),
        status: String(row.status),
        issue_date: toDateString(row.issue_date),
        expiry_date: toDateString(row.expiry_date),
        uploaded_by_name: row.uploaded_by_name ? String(row.uploaded_by_name) : null,
        created_at: toIso(row.created_at) ?? '',
      },
    ];
  });

  return { employee_id: employeeId, evaluations, trace, documents };
};
