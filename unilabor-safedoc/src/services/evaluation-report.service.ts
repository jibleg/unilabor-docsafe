import pool from '../config/db';
import {
  PaginatedResult,
  PaginationInput,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';

/**
 * Dashboard y trazabilidad ISO 15189 del modulo de evaluaciones.
 * - Resumen por capacitacion (conteos por estado + % de cumplimiento).
 * - Reporte de trazabilidad: evidencia por colaborador/capacitacion con
 *   calificacion, fechas y constancia (emision/vigencia).
 */

export interface CourseEvaluationSummary {
  course_id: number;
  course_title: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  in_progress: number;
  grading: number;
  expired: number;
  authorized_late: number;
  compliance_pct: number;
}

export interface EvaluationDashboard {
  totals: {
    total: number;
    passed: number;
    failed: number;
    in_progress: number;
    pending: number;
    grading: number;
    expired: number;
    compliance_pct: number;
  };
  courses: CourseEvaluationSummary[];
}

const STATUS_AGG = `
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE a.status = 'passed')::int AS passed,
  COUNT(*) FILTER (WHERE a.status = 'failed')::int AS failed,
  COUNT(*) FILTER (WHERE a.status = 'pending')::int AS pending,
  COUNT(*) FILTER (WHERE a.status = 'in_progress')::int AS in_progress,
  COUNT(*) FILTER (WHERE a.status = 'grading')::int AS grading,
  COUNT(*) FILTER (WHERE a.status = 'expired')::int AS expired,
  COUNT(*) FILTER (WHERE a.status = 'authorized_late')::int AS authorized_late
`;

const compliance = (passed: number, total: number): number =>
  total > 0 ? Math.round((passed / total) * 10000) / 100 : 0;

export const getEvaluationDashboard = async (): Promise<EvaluationDashboard> => {
  const tableExists = await pool.query(
    `SELECT to_regclass('public.evaluation_assignments') IS NOT NULL AS exists;`,
  );
  if (!tableExists.rows[0]?.exists) {
    return {
      totals: { total: 0, passed: 0, failed: 0, in_progress: 0, pending: 0, grading: 0, expired: 0, compliance_pct: 0 },
      courses: [],
    };
  }

  const byCourse = await pool.query(
    `SELECT c.id AS course_id, c.title AS course_title, ${STATUS_AGG}
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.training_courses c ON c.id = t.training_course_id
      GROUP BY c.id, c.title
      ORDER BY c.title ASC;`,
  );

  const courses: CourseEvaluationSummary[] = byCourse.rows.map((row) => ({
    course_id: Number(row.course_id),
    course_title: String(row.course_title),
    total: Number(row.total),
    passed: Number(row.passed),
    failed: Number(row.failed),
    pending: Number(row.pending),
    in_progress: Number(row.in_progress),
    grading: Number(row.grading),
    expired: Number(row.expired),
    authorized_late: Number(row.authorized_late),
    compliance_pct: compliance(Number(row.passed), Number(row.total)),
  }));

  const totalsRow = await pool.query(
    `SELECT ${STATUS_AGG} FROM public.evaluation_assignments a;`,
  );
  const t = totalsRow.rows[0] ?? {};
  return {
    totals: {
      total: Number(t.total ?? 0),
      passed: Number(t.passed ?? 0),
      failed: Number(t.failed ?? 0),
      in_progress: Number(t.in_progress ?? 0),
      pending: Number(t.pending ?? 0),
      grading: Number(t.grading ?? 0),
      expired: Number(t.expired ?? 0),
      compliance_pct: compliance(Number(t.passed ?? 0), Number(t.total ?? 0)),
    },
    courses,
  };
};

export interface TraceabilityRow {
  assignment_id: number;
  employee_name: string;
  employee_code: string;
  course_title: string;
  template_title: string;
  status: string;
  percentage: number | null;
  passing_score: number;
  submitted_at: string | null;
  graded_at: string | null;
  certificate_issue_date: string | null;
  certificate_expiry_date: string | null;
}

export interface TraceabilityFilters extends PaginationInput {
  course_id?: number;
  employee_id?: number;
  status?: string;
}

export const getTraceabilityReport = async (
  filters: TraceabilityFilters = {},
): Promise<PaginatedResult<TraceabilityRow>> => {
  const paginate = isPaginationRequested(filters);
  const { page, limit, offset } = resolvePagination(filters);

  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.course_id) {
    values.push(filters.course_id);
    conditions.push(`c.id = $${values.length}`);
  }
  if (filters.employee_id) {
    values.push(filters.employee_id);
    conditions.push(`a.employee_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`a.status = $${values.length}`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const limitSql = paginate ? `LIMIT $${values.length + 1} OFFSET $${values.length + 2}` : '';
  const dataValues = paginate ? [...values, limit, offset] : values;

  const dataResult = await pool.query(
    `SELECT a.id AS assignment_id, e.full_name AS employee_name, e.employee_code,
            c.title AS course_title, t.title AS template_title,
            a.status, a.percentage, t.passing_score, a.submitted_at, a.graded_at,
            ed.issue_date AS certificate_issue_date, ed.expiry_date AS certificate_expiry_date
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.training_courses c ON c.id = t.training_course_id
       JOIN public.employees e ON e.id = a.employee_id
       LEFT JOIN public.employee_documents ed ON ed.id = a.certificate_document_id
       ${whereClause}
      ORDER BY c.title ASC, e.full_name ASC, a.id DESC
      ${limitSql};`,
    dataValues,
  );

  const data: TraceabilityRow[] = dataResult.rows.map((row) => ({
    assignment_id: Number(row.assignment_id),
    employee_name: String(row.employee_name),
    employee_code: String(row.employee_code),
    course_title: String(row.course_title),
    template_title: String(row.template_title),
    status: String(row.status),
    percentage: row.percentage !== null ? Number(row.percentage) : null,
    passing_score: Number(row.passing_score),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    graded_at: row.graded_at ? String(row.graded_at) : null,
    certificate_issue_date: row.certificate_issue_date ? String(row.certificate_issue_date) : null,
    certificate_expiry_date: row.certificate_expiry_date ? String(row.certificate_expiry_date) : null,
  }));

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.training_courses c ON c.id = t.training_course_id
       ${whereClause};`,
    values,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

// --- Detalle de respuestas de una evaluacion realizada (evidencia ISO) ---

export interface ResponseOptionDetail {
  id: number;
  text: string;
  is_correct: boolean;
  selected: boolean;
}

export interface QuestionResponseDetail {
  question_id: number;
  type: 'single' | 'multiple' | 'boolean' | 'open';
  text: string;
  points: number;
  points_awarded: number;
  is_correct: boolean;
  answered: boolean;
  text_answer: string | null;
  options: ResponseOptionDetail[];
}

export interface EvaluationResponsesDetail {
  assignment: {
    id: number;
    employee_name: string;
    employee_code: string;
    course_title: string;
    template_title: string;
    status: string;
    score: number | null;
    max_score: number | null;
    percentage: number | null;
    passing_score: number;
    submitted_at: string | null;
    graded_at: string | null;
  };
  questions: QuestionResponseDetail[];
}

/**
 * Detalle completo de lo contestado por un colaborador en una evaluacion: cada
 * pregunta con sus opciones (correctas y marcadas), respuesta abierta y puntaje.
 * Permite a RH revisar la evidencia exacta de cada evaluacion realizada.
 */
export const getEvaluationResponsesDetail = async (
  assignmentId: number,
): Promise<EvaluationResponsesDetail> => {
  const aRes = await pool.query(
    `SELECT a.id, a.status, a.score, a.max_score, a.percentage, a.submitted_at, a.graded_at,
            t.title AS template_title, t.passing_score,
            c.title AS course_title,
            e.full_name AS employee_name, e.employee_code
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.training_courses c ON c.id = t.training_course_id
       JOIN public.employees e ON e.id = a.employee_id
      WHERE a.id = $1 LIMIT 1;`,
    [assignmentId],
  );
  if (aRes.rows.length === 0) {
    const error = new Error('EVAL_ASSIGNMENT_NOT_FOUND');
    (error as any).code = 'EVAL_ASSIGNMENT_NOT_FOUND';
    throw error;
  }
  const a = aRes.rows[0];

  const rRes = await pool.query(
    `SELECT q.id AS question_id, q.type, q.text, q.points,
            r.selected_option_ids, r.text_answer, r.is_correct, r.points_awarded,
            COALESCE(aq.sort_order, q.sort_order, q.id) AS ord
       FROM public.evaluation_responses r
       JOIN public.evaluation_questions q ON q.id = r.question_id
       LEFT JOIN public.evaluation_assignment_questions aq
              ON aq.assignment_id = r.assignment_id AND aq.question_id = r.question_id
      WHERE r.assignment_id = $1
      ORDER BY ord ASC, q.id ASC;`,
    [assignmentId],
  );

  const questionIds = rRes.rows.map((row) => Number(row.question_id));
  const optionsByQuestion = new Map<number, Array<{ id: number; text: string; is_correct: boolean }>>();
  if (questionIds.length > 0) {
    const oRes = await pool.query(
      `SELECT question_id, id, text, is_correct
         FROM public.evaluation_question_options
        WHERE question_id = ANY($1::int[])
        ORDER BY question_id ASC, sort_order ASC, id ASC;`,
      [questionIds],
    );
    for (const row of oRes.rows) {
      const qid = Number(row.question_id);
      const list = optionsByQuestion.get(qid) ?? [];
      list.push({ id: Number(row.id), text: String(row.text), is_correct: Boolean(row.is_correct) });
      optionsByQuestion.set(qid, list);
    }
  }

  const questions: QuestionResponseDetail[] = rRes.rows.map((row) => {
    const selectedIds: number[] = Array.isArray(row.selected_option_ids)
      ? row.selected_option_ids.map((value: unknown) => Number(value))
      : [];
    const options = (optionsByQuestion.get(Number(row.question_id)) ?? []).map((option) => ({
      ...option,
      selected: selectedIds.includes(option.id),
    }));
    const textAnswer = row.text_answer ? String(row.text_answer) : null;
    const answered = row.type === 'open' ? Boolean(textAnswer && textAnswer.trim().length > 0) : selectedIds.length > 0;
    return {
      question_id: Number(row.question_id),
      type: row.type,
      text: String(row.text),
      points: Number(row.points),
      points_awarded: Number(row.points_awarded),
      is_correct: Boolean(row.is_correct),
      answered,
      text_answer: textAnswer,
      options,
    };
  });

  return {
    assignment: {
      id: Number(a.id),
      employee_name: String(a.employee_name),
      employee_code: String(a.employee_code),
      course_title: String(a.course_title),
      template_title: String(a.template_title),
      status: String(a.status),
      score: a.score !== null ? Number(a.score) : null,
      max_score: a.max_score !== null ? Number(a.max_score) : null,
      percentage: a.percentage !== null ? Number(a.percentage) : null,
      passing_score: Number(a.passing_score),
      submitted_at: a.submitted_at ? String(a.submitted_at) : null,
      graded_at: a.graded_at ? String(a.graded_at) : null,
    },
    questions,
  };
};
