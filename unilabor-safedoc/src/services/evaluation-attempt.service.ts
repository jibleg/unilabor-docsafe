import type { PoolClient } from 'pg';
import pool from '../config/db';
import type {
  EvaluationQuestionType,
  EvaluationSubmitResult,
  EvaluationTakingQuestion,
  EvaluationTakingView,
} from '../types';

/**
 * Realizacion y auto-calificacion de una evaluacion por el colaborador.
 *
 * Reglas:
 * - Intento unico: solo se puede responder una asignacion en estado
 *   'pending'/'in_progress' con la ventana (72h) vigente.
 * - Auto-calificacion de objetivas (single/boolean/multiple) por coincidencia
 *   exacta del conjunto de opciones correctas (todo o nada por pregunta).
 * - Si la evaluacion tiene preguntas abiertas, queda en 'grading' (la calificacion
 *   final la cierra RH en el Sprint 34). Si no, se resuelve passed/failed al instante.
 */

export interface SubmitAnswerInput {
  question_id: number;
  selected_option_ids?: number[];
  text_answer?: string | null;
}

const throwCoded = (code: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  throw error;
};

interface AssignmentContext {
  id: number;
  employee_id: number;
  status: string;
  deadline_at: string;
  started_at: string | null;
  template_id: number;
  template_title: string;
  course_title: string;
  instructions: string | null;
  passing_score: number;
  window_hours: number;
}

const loadAssignmentContext = async (
  assignmentId: number,
  employeeId: number,
  client: PoolClient | typeof pool = pool,
): Promise<AssignmentContext> => {
  const result = await client.query(
    `SELECT a.id, a.employee_id, a.status, a.deadline_at, a.started_at, a.template_id,
            t.title AS template_title, t.instructions, t.passing_score, t.window_hours,
            c.title AS course_title
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
       JOIN public.training_courses c ON c.id = t.training_course_id
      WHERE a.id = $1 LIMIT 1;`,
    [assignmentId],
  );
  if (result.rows.length === 0) {
    throwCoded('EVAL_ASSIGNMENT_NOT_FOUND');
  }
  const row = result.rows[0];
  if (Number(row.employee_id) !== employeeId) {
    throwCoded('EVAL_NOT_OWNER');
  }
  return {
    id: Number(row.id),
    employee_id: Number(row.employee_id),
    status: String(row.status),
    deadline_at: String(row.deadline_at),
    started_at: row.started_at ? String(row.started_at) : null,
    template_id: Number(row.template_id),
    template_title: String(row.template_title),
    course_title: String(row.course_title),
    instructions: row.instructions ? String(row.instructions) : null,
    passing_score: Number(row.passing_score),
    window_hours: Number(row.window_hours),
  };
};

/** Carga las preguntas del snapshot SIN exponer cual opcion es la correcta. */
const loadTakingQuestions = async (assignmentId: number): Promise<EvaluationTakingQuestion[]> => {
  const questionsResult = await pool.query(
    `SELECT q.id, q.type, q.text, q.points, aq.sort_order
       FROM public.evaluation_assignment_questions aq
       JOIN public.evaluation_questions q ON q.id = aq.question_id
      WHERE aq.assignment_id = $1
      ORDER BY aq.sort_order ASC, q.id ASC;`,
    [assignmentId],
  );
  const questions: EvaluationTakingQuestion[] = questionsResult.rows.map((row) => ({
    id: Number(row.id),
    type: String(row.type) as EvaluationQuestionType,
    text: String(row.text),
    points: Number(row.points),
    sort_order: Number(row.sort_order),
    options: [],
  }));
  if (questions.length === 0) {
    return questions;
  }

  const optionsResult = await pool.query(
    `SELECT o.id, o.question_id, o.text, o.sort_order
       FROM public.evaluation_question_options o
       JOIN public.evaluation_assignment_questions aq ON aq.question_id = o.question_id
      WHERE aq.assignment_id = $1
      ORDER BY o.sort_order ASC, o.id ASC;`,
    [assignmentId],
  );
  const byId = new Map(questions.map((question) => [question.id, question]));
  optionsResult.rows.forEach((row) => {
    byId.get(Number(row.question_id))?.options.push({
      id: Number(row.id),
      text: String(row.text),
      sort_order: Number(row.sort_order),
    });
  });
  return questions;
};

const buildView = (ctx: AssignmentContext, questions: EvaluationTakingQuestion[]): EvaluationTakingView => ({
  assignment: {
    id: ctx.id,
    status: ctx.status as EvaluationTakingView['assignment']['status'],
    deadline_at: ctx.deadline_at,
    started_at: ctx.started_at,
    template_title: ctx.template_title,
    course_title: ctx.course_title,
    instructions: ctx.instructions,
    passing_score: ctx.passing_score,
    window_hours: ctx.window_hours,
  },
  questions,
});

const isExpired = (deadlineIso: string): boolean => new Date(deadlineIso).getTime() <= Date.now();

export const getTakingView = async (
  assignmentId: number,
  employeeId: number,
): Promise<EvaluationTakingView> => {
  const ctx = await loadAssignmentContext(assignmentId, employeeId);
  const questions = await loadTakingQuestions(assignmentId);
  return buildView(ctx, questions);
};

export const startEvaluation = async (
  assignmentId: number,
  employeeId: number,
): Promise<EvaluationTakingView> => {
  const ctx = await loadAssignmentContext(assignmentId, employeeId);
  if (!['pending', 'in_progress'].includes(ctx.status)) {
    throwCoded('EVAL_NOT_ACTIONABLE');
  }
  if (isExpired(ctx.deadline_at)) {
    throwCoded('EVAL_WINDOW_EXPIRED');
  }
  await pool.query(
    `UPDATE public.evaluation_assignments
        SET status = 'in_progress', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = $1;`,
    [assignmentId],
  );
  const refreshed = await loadAssignmentContext(assignmentId, employeeId);
  const questions = await loadTakingQuestions(assignmentId);
  return buildView(refreshed, questions);
};

interface GradableQuestion {
  id: number;
  type: EvaluationQuestionType;
  points: number;
  correctOptionIds: Set<number>;
}

const loadGradableQuestions = async (
  client: PoolClient,
  assignmentId: number,
): Promise<GradableQuestion[]> => {
  const result = await client.query(
    `SELECT q.id, q.type, q.points,
            COALESCE(ARRAY_AGG(o.id) FILTER (WHERE o.is_correct), '{}') AS correct_ids
       FROM public.evaluation_assignment_questions aq
       JOIN public.evaluation_questions q ON q.id = aq.question_id
       LEFT JOIN public.evaluation_question_options o ON o.question_id = q.id
      WHERE aq.assignment_id = $1
      GROUP BY q.id, q.type, q.points;`,
    [assignmentId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    type: String(row.type) as EvaluationQuestionType,
    points: Number(row.points),
    correctOptionIds: new Set<number>((row.correct_ids as number[]).map((id) => Number(id))),
  }));
};

const sameSet = (a: Set<number>, b: Set<number>): boolean =>
  a.size === b.size && [...a].every((value) => b.has(value));

export const submitEvaluation = async (
  assignmentId: number,
  employeeId: number,
  answers: SubmitAnswerInput[],
): Promise<EvaluationSubmitResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ctx = await loadAssignmentContext(assignmentId, employeeId, client);
    if (!['pending', 'in_progress'].includes(ctx.status)) {
      throwCoded('EVAL_NOT_ACTIONABLE');
    }
    if (isExpired(ctx.deadline_at)) {
      throwCoded('EVAL_WINDOW_EXPIRED');
    }

    const questions = await loadGradableQuestions(client, assignmentId);
    const answerMap = new Map<number, SubmitAnswerInput>();
    answers.forEach((answer) => answerMap.set(Number(answer.question_id), answer));

    // Reemplazo total de respuestas (intento unico).
    await client.query(`DELETE FROM public.evaluation_responses WHERE assignment_id = $1;`, [assignmentId]);

    let score = 0;
    let maxScore = 0;
    let hasOpen = false;

    for (const question of questions) {
      maxScore += question.points;
      const answer = answerMap.get(question.id);
      const selectedIds = Array.isArray(answer?.selected_option_ids)
        ? [...new Set(answer!.selected_option_ids.map((id) => Number(id)))]
        : [];
      const textAnswer = typeof answer?.text_answer === 'string' ? answer.text_answer.trim() : null;

      let isCorrect: boolean | null = null;
      let pointsAwarded = 0;

      if (question.type === 'open') {
        hasOpen = true;
      } else {
        isCorrect = sameSet(new Set(selectedIds), question.correctOptionIds);
        pointsAwarded = isCorrect ? question.points : 0;
        score += pointsAwarded;
      }

      await client.query(
        `INSERT INTO public.evaluation_responses
           (assignment_id, question_id, selected_option_ids, text_answer, is_correct, points_awarded)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6);`,
        [assignmentId, question.id, JSON.stringify(selectedIds), textAnswer, isCorrect, pointsAwarded],
      );
    }

    let percentage: number | null = null;
    let status: string;
    let passed = false;

    if (hasOpen) {
      // Queda pendiente de revision por RH; la nota final se calcula en el Sprint 34.
      status = 'grading';
      await client.query(
        `UPDATE public.evaluation_assignments
            SET status = 'grading', submitted_at = NOW(), score = $2, max_score = $3, percentage = NULL, updated_at = NOW()
          WHERE id = $1;`,
        [assignmentId, score, maxScore],
      );
    } else {
      percentage = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
      passed = percentage >= ctx.passing_score;
      status = passed ? 'passed' : 'failed';
      await client.query(
        `UPDATE public.evaluation_assignments
            SET status = $2, submitted_at = NOW(), graded_at = NOW(), score = $3, max_score = $4, percentage = $5, updated_at = NOW()
          WHERE id = $1;`,
        [assignmentId, status, score, maxScore, percentage],
      );
    }

    await client.query('COMMIT');

    return {
      assignment_id: assignmentId,
      status: status as EvaluationSubmitResult['status'],
      score,
      max_score: maxScore,
      percentage,
      passing_score: ctx.passing_score,
      passed,
      requires_manual_grading: hasOpen,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
