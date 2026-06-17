import pool from '../config/db';
import type {
  EvaluationAssignmentRecord,
  EvaluationGradingDetail,
  EvaluationSubmitResult,
  OpenAnswerGradeInput,
} from '../types';
import {
  PaginatedResult,
  PaginationInput,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';
import { tryIssueCertificate } from './evaluation-attempt.service';

/**
 * Calificacion manual (RH) de las evaluaciones que quedaron en 'grading' por
 * tener preguntas abiertas. Al cerrar la calificacion se recalcula el porcentaje
 * con los puntos objetivos + los asignados a las abiertas y se resuelve
 * passed/failed con el mismo umbral (passing_score) del Sprint 33.
 */

const throwCoded = (code: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  throw error;
};

const GRADING_QUEUE_QUERY = `
  SELECT
    a.id, a.template_id, a.employee_id, a.status, a.available_at, a.deadline_at,
    a.started_at, a.submitted_at, a.graded_at, a.score, a.max_score, a.percentage, a.attempt_no,
    t.title AS template_title, t.passing_score, t.window_hours,
    c.id AS course_id, c.title AS course_title,
    e.full_name AS employee_name, e.employee_code,
    (SELECT COUNT(*)::int
       FROM public.evaluation_responses r
       JOIN public.evaluation_questions q ON q.id = r.question_id
      WHERE r.assignment_id = a.id AND q.type = 'open') AS question_count
  FROM public.evaluation_assignments a
  JOIN public.evaluation_templates t ON t.id = a.template_id
  JOIN public.training_courses c ON c.id = t.training_course_id
  JOIN public.employees e ON e.id = a.employee_id
  WHERE a.status = 'grading'
`;

const mapRow = (row: any): EvaluationAssignmentRecord => ({
  id: Number(row.id),
  template_id: Number(row.template_id),
  employee_id: Number(row.employee_id),
  status: row.status,
  available_at: String(row.available_at),
  deadline_at: String(row.deadline_at),
  started_at: row.started_at ? String(row.started_at) : null,
  submitted_at: row.submitted_at ? String(row.submitted_at) : null,
  graded_at: row.graded_at ? String(row.graded_at) : null,
  score: row.score !== null ? Number(row.score) : null,
  max_score: row.max_score !== null ? Number(row.max_score) : null,
  percentage: row.percentage !== null ? Number(row.percentage) : null,
  attempt_no: Number(row.attempt_no),
  template_title: String(row.template_title),
  course_id: Number(row.course_id),
  course_title: String(row.course_title),
  passing_score: Number(row.passing_score),
  window_hours: Number(row.window_hours),
  question_count: Number(row.question_count),
  employee_name: String(row.employee_name),
  employee_code: String(row.employee_code),
});

export const listGradingQueue = async (
  options: PaginationInput = {},
): Promise<PaginatedResult<EvaluationAssignmentRecord>> => {
  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);

  const limitSql = paginate ? 'LIMIT $1 OFFSET $2' : '';
  const dataResult = await pool.query(
    `${GRADING_QUEUE_QUERY} ORDER BY a.submitted_at ASC, a.id ASC ${limitSql};`,
    paginate ? [limit, offset] : [],
  );
  const data = dataResult.rows.map(mapRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.evaluation_assignments a WHERE a.status = 'grading';`,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

export const getGradingDetail = async (assignmentId: number): Promise<EvaluationGradingDetail> => {
  const assignmentResult = await pool.query(
    `SELECT a.id, a.status, a.score, a.max_score,
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
  if (assignmentResult.rows.length === 0) {
    throwCoded('EVAL_ASSIGNMENT_NOT_FOUND');
  }
  const a = assignmentResult.rows[0];
  if (String(a.status) !== 'grading') {
    throwCoded('EVAL_NOT_IN_GRADING');
  }

  const openResult = await pool.query(
    `SELECT q.id AS question_id, q.text, q.points, r.text_answer, r.points_awarded
       FROM public.evaluation_responses r
       JOIN public.evaluation_questions q ON q.id = r.question_id
      WHERE r.assignment_id = $1 AND q.type = 'open'
      ORDER BY q.id ASC;`,
    [assignmentId],
  );

  return {
    assignment: {
      id: Number(a.id),
      status: a.status,
      employee_name: String(a.employee_name),
      employee_code: String(a.employee_code),
      course_title: String(a.course_title),
      template_title: String(a.template_title),
      passing_score: Number(a.passing_score),
      objective_score: a.score !== null ? Number(a.score) : 0,
      max_score: a.max_score !== null ? Number(a.max_score) : 0,
    },
    open_answers: openResult.rows.map((row) => ({
      question_id: Number(row.question_id),
      text: String(row.text),
      points: Number(row.points),
      text_answer: row.text_answer ? String(row.text_answer) : null,
      points_awarded: Number(row.points_awarded),
    })),
  };
};

/** Califica las respuestas abiertas y resuelve la evaluacion (passed/failed). */
export const gradeOpenAnswers = async (
  assignmentId: number,
  grades: OpenAnswerGradeInput[],
  gradedByUserId: string | null,
): Promise<EvaluationSubmitResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignmentResult = await client.query(
      `SELECT a.id, a.status, a.max_score, t.passing_score
         FROM public.evaluation_assignments a
         JOIN public.evaluation_templates t ON t.id = a.template_id
        WHERE a.id = $1 LIMIT 1
        FOR UPDATE OF a;`,
      [assignmentId],
    );
    if (assignmentResult.rows.length === 0) {
      throwCoded('EVAL_ASSIGNMENT_NOT_FOUND');
    }
    const assignment = assignmentResult.rows[0];
    if (String(assignment.status) !== 'grading') {
      throwCoded('EVAL_NOT_IN_GRADING');
    }

    // Preguntas abiertas con respuesta registrada y sus puntos posibles.
    const openResult = await client.query(
      `SELECT q.id AS question_id, q.points
         FROM public.evaluation_responses r
         JOIN public.evaluation_questions q ON q.id = r.question_id
        WHERE r.assignment_id = $1 AND q.type = 'open';`,
      [assignmentId],
    );
    const maxByQuestion = new Map<number, number>(
      openResult.rows.map((row) => [Number(row.question_id), Number(row.points)]),
    );

    const gradeByQuestion = new Map<number, number>();
    for (const grade of grades) {
      gradeByQuestion.set(Number(grade.question_id), Number(grade.points_awarded));
    }

    // Deben calificarse TODAS las abiertas, sin exceder los puntos de la pregunta.
    for (const [questionId, maxPoints] of maxByQuestion) {
      if (!gradeByQuestion.has(questionId)) {
        throwCoded('EVAL_OPEN_ANSWERS_INCOMPLETE');
      }
      const awarded = gradeByQuestion.get(questionId)!;
      if (!Number.isFinite(awarded) || awarded < 0 || awarded > maxPoints) {
        throwCoded('EVAL_POINTS_OUT_OF_RANGE');
      }
      await client.query(
        `UPDATE public.evaluation_responses
            SET points_awarded = $3, is_correct = ($3 > 0), graded_by_user_id = $4, updated_at = NOW()
          WHERE assignment_id = $1 AND question_id = $2;`,
        [assignmentId, questionId, awarded, gradedByUserId],
      );
    }

    const totalResult = await client.query(
      `SELECT COALESCE(SUM(points_awarded), 0)::int AS score FROM public.evaluation_responses WHERE assignment_id = $1;`,
      [assignmentId],
    );
    const score = Number(totalResult.rows[0]?.score ?? 0);
    const maxScore = assignment.max_score !== null ? Number(assignment.max_score) : 0;
    const passingScore = Number(assignment.passing_score);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
    const passed = percentage >= passingScore;
    const status = passed ? 'passed' : 'failed';

    await client.query(
      `UPDATE public.evaluation_assignments
          SET status = $2, score = $3, percentage = $4, graded_at = NOW(), updated_at = NOW()
        WHERE id = $1;`,
      [assignmentId, status, score, percentage],
    );

    await client.query('COMMIT');

    const certificateDocumentId = await tryIssueCertificate(assignmentId, passed);

    return {
      assignment_id: assignmentId,
      status,
      score,
      max_score: maxScore,
      percentage,
      passing_score: passingScore,
      passed,
      requires_manual_grading: false,
      certificate_document_id: certificateDocumentId,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
