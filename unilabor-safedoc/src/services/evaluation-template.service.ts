import type { PoolClient } from 'pg';
import pool from '../config/db';
import type {
  EvaluationQuestionRecord,
  EvaluationTemplateRecord,
  EvaluationQuestionType,
} from '../types';

/**
 * Plantillas de evaluacion (evaluation_templates) y banco de preguntas
 * (evaluation_questions + evaluation_question_options) del modulo de capacitacion.
 *
 * `requires_manual_grading` se deriva de la existencia de preguntas tipo 'open'
 * (no se almacena, para evitar desincronizacion). El banco se gestiona por
 * reemplazo total transaccional (valido en Sprint 31: aun no existen respuestas).
 */

export interface EvaluationTemplatePayload {
  title: string;
  instructions?: string | null;
  passing_score?: number;
  window_hours?: number;
  selection_mode?: 'all' | 'random';
  random_count?: number | null;
  status?: 'draft' | 'published';
  is_active?: boolean;
}

export interface QuestionOptionInput {
  text: string;
  is_correct?: boolean;
  sort_order?: number;
}

export interface QuestionInput {
  type: EvaluationQuestionType;
  text: string;
  points?: number;
  sort_order?: number;
  options?: QuestionOptionInput[];
}

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const throwCoded = (code: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  throw error;
};

const tableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.evaluation_templates') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const assertTable = async () => {
  if (!(await tableExists())) {
    throwCoded('TRAINING_TABLES_NOT_AVAILABLE');
  }
};

const courseExists = async (courseId: number): Promise<boolean> => {
  const result = await pool.query(
    `SELECT 1 FROM public.training_courses WHERE id = $1 AND is_active = TRUE LIMIT 1;`,
    [courseId],
  );
  return result.rows.length > 0;
};

const mapQuestionRow = (row: any): EvaluationQuestionRecord => ({
  id: Number(row.id),
  template_id: Number(row.template_id),
  type: String(row.type) as EvaluationQuestionType,
  text: String(row.text),
  points: Number(row.points),
  sort_order: Number(row.sort_order),
  options: [],
});

const loadQuestions = async (templateId: number): Promise<EvaluationQuestionRecord[]> => {
  const questionsResult = await pool.query(
    `SELECT id, template_id, type, text, points, sort_order
       FROM public.evaluation_questions
      WHERE template_id = $1
      ORDER BY sort_order ASC, id ASC;`,
    [templateId],
  );
  const questions = questionsResult.rows.map(mapQuestionRow);
  if (questions.length === 0) {
    return questions;
  }

  const optionsResult = await pool.query(
    `SELECT o.id, o.question_id, o.text, o.is_correct, o.sort_order
       FROM public.evaluation_question_options o
       JOIN public.evaluation_questions q ON q.id = o.question_id
      WHERE q.template_id = $1
      ORDER BY o.sort_order ASC, o.id ASC;`,
    [templateId],
  );

  const byQuestion = new Map<number, EvaluationQuestionRecord>();
  questions.forEach((question) => byQuestion.set(question.id, question));
  optionsResult.rows.forEach((row) => {
    byQuestion.get(Number(row.question_id))?.options.push({
      id: Number(row.id),
      question_id: Number(row.question_id),
      text: String(row.text),
      is_correct: Boolean(row.is_correct),
      sort_order: Number(row.sort_order),
    });
  });

  return questions;
};

const mapTemplateRow = (row: any): EvaluationTemplateRecord => {
  const template: EvaluationTemplateRecord = {
    id: Number(row.id),
    training_course_id: Number(row.training_course_id),
    title: String(row.title),
    instructions: row.instructions ? String(row.instructions) : null,
    passing_score: Number(row.passing_score),
    window_hours: Number(row.window_hours),
    selection_mode: String(row.selection_mode) as 'all' | 'random',
    random_count: row.random_count !== null && row.random_count !== undefined ? Number(row.random_count) : null,
    status: String(row.status) as 'draft' | 'published',
    is_active: Boolean(row.is_active),
    requires_manual_grading: Boolean(row.requires_manual_grading),
  };
  if (row.question_count !== undefined) {
    template.question_count = Number(row.question_count);
  }
  if (row.created_at) {
    template.created_at = String(row.created_at);
  }
  if (row.updated_at) {
    template.updated_at = String(row.updated_at);
  }
  return template;
};

const TEMPLATE_BASE_QUERY = `
  SELECT
    t.id, t.training_course_id, t.title, t.instructions, t.passing_score, t.window_hours,
    t.selection_mode, t.random_count, t.status, t.is_active, t.created_at, t.updated_at,
    COUNT(q.id)::int AS question_count,
    COALESCE(BOOL_OR(q.type = 'open'), FALSE) AS requires_manual_grading
  FROM public.evaluation_templates t
  LEFT JOIN public.evaluation_questions q ON q.template_id = t.id
`;

export const listTemplatesByCourse = async (courseId: number): Promise<EvaluationTemplateRecord[]> => {
  await assertTable();
  const result = await pool.query(
    `${TEMPLATE_BASE_QUERY}
      WHERE t.training_course_id = $1 AND t.is_active = TRUE
      GROUP BY t.id
      ORDER BY t.created_at ASC, t.id ASC;`,
    [courseId],
  );
  return result.rows.map(mapTemplateRow);
};

export const getEvaluationTemplateById = async (
  templateId: number,
  includeQuestions = true,
): Promise<EvaluationTemplateRecord | null> => {
  await assertTable();
  const result = await pool.query(
    `${TEMPLATE_BASE_QUERY} WHERE t.id = $1 GROUP BY t.id LIMIT 1;`,
    [templateId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const template = mapTemplateRow(result.rows[0]);
  if (includeQuestions) {
    template.questions = await loadQuestions(templateId);
  }
  return template;
};

export const createEvaluationTemplate = async (
  courseId: number,
  payload: EvaluationTemplatePayload,
  createdByUserId: string | null,
): Promise<EvaluationTemplateRecord> => {
  await assertTable();
  if (!(await courseExists(courseId))) {
    throwCoded('TRAINING_COURSE_NOT_FOUND');
  }

  const result = await pool.query(
    `INSERT INTO public.evaluation_templates
       (training_course_id, title, instructions, passing_score, window_hours, selection_mode, random_count, status, created_by_user_id)
     VALUES ($1, $2, $3, COALESCE($4, 80), COALESCE($5, 72), COALESCE($6, 'all'), $7, COALESCE($8, 'draft'), $9)
     RETURNING id;`,
    [
      courseId,
      payload.title.trim(),
      normalizeOptionalText(payload.instructions),
      payload.passing_score ?? null,
      payload.window_hours ?? null,
      payload.selection_mode ?? null,
      payload.selection_mode === 'random' ? payload.random_count ?? null : null,
      payload.status ?? null,
      createdByUserId,
    ],
  );

  const created = await getEvaluationTemplateById(Number(result.rows[0]?.id));
  if (!created) {
    throwCoded('TRAINING_CREATION_FAILED');
  }
  return created as EvaluationTemplateRecord;
};

const countQuestions = async (client: PoolClient, templateId: number): Promise<number> => {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM public.evaluation_questions WHERE template_id = $1;`,
    [templateId],
  );
  return Number(result.rows[0]?.total ?? 0);
};

export const updateEvaluationTemplate = async (
  templateId: number,
  payload: EvaluationTemplatePayload,
): Promise<EvaluationTemplateRecord | null> => {
  await assertTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT * FROM public.evaluation_templates WHERE id = $1 LIMIT 1;`,
      [templateId],
    );
    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const current = currentResult.rows[0];

    const selectionMode = payload.selection_mode ?? String(current.selection_mode);
    const randomCount =
      selectionMode === 'random'
        ? payload.random_count !== undefined
          ? payload.random_count
          : current.random_count !== null
            ? Number(current.random_count)
            : null
        : null;

    // En modo aleatorio, no se puede entregar mas preguntas de las que tiene el banco.
    if (selectionMode === 'random') {
      const total = await countQuestions(client, templateId);
      if (total > 0 && typeof randomCount === 'number' && randomCount > total) {
        await client.query('ROLLBACK');
        throwCoded('RANDOM_COUNT_EXCEEDS_BANK');
      }
    }

    await client.query(
      `UPDATE public.evaluation_templates
        SET title = $1, instructions = $2, passing_score = $3, window_hours = $4,
            selection_mode = $5, random_count = $6, status = $7, is_active = $8, updated_at = NOW()
        WHERE id = $9;`,
      [
        payload.title !== undefined ? payload.title.trim() : String(current.title),
        payload.instructions !== undefined ? normalizeOptionalText(payload.instructions) : current.instructions,
        payload.passing_score ?? Number(current.passing_score),
        payload.window_hours ?? Number(current.window_hours),
        selectionMode,
        randomCount,
        payload.status ?? String(current.status),
        payload.is_active !== undefined ? payload.is_active : Boolean(current.is_active),
        templateId,
      ],
    );

    await client.query('COMMIT');
    return getEvaluationTemplateById(templateId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateEvaluationTemplate = async (templateId: number): Promise<boolean> => {
  await assertTable();
  const result = await pool.query(
    `UPDATE public.evaluation_templates SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id;`,
    [templateId],
  );
  return result.rows.length > 0;
};

/** Reemplaza por completo el banco de preguntas de una plantilla (transaccional). */
export const replaceTemplateQuestions = async (
  templateId: number,
  questions: QuestionInput[],
): Promise<EvaluationTemplateRecord | null> => {
  await assertTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const templateResult = await client.query(
      `SELECT id, selection_mode, random_count FROM public.evaluation_templates WHERE id = $1 LIMIT 1;`,
      [templateId],
    );
    if (templateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const template = templateResult.rows[0];

    if (
      String(template.selection_mode) === 'random' &&
      template.random_count !== null &&
      Number(template.random_count) > questions.length
    ) {
      await client.query('ROLLBACK');
      throwCoded('RANDOM_COUNT_EXCEEDS_BANK');
    }

    // ON DELETE CASCADE elimina opciones al borrar las preguntas previas.
    await client.query(`DELETE FROM public.evaluation_questions WHERE template_id = $1;`, [templateId]);

    for (const [index, question] of questions.entries()) {
      const insertedQuestion = await client.query(
        `INSERT INTO public.evaluation_questions (template_id, type, text, points, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id;`,
        [templateId, question.type, question.text.trim(), question.points ?? 1, question.sort_order ?? index],
      );
      const questionId = Number(insertedQuestion.rows[0]?.id);

      const options = question.type === 'open' ? [] : question.options ?? [];
      for (const [optionIndex, option] of options.entries()) {
        await client.query(
          `INSERT INTO public.evaluation_question_options (question_id, text, is_correct, sort_order)
           VALUES ($1, $2, $3, $4);`,
          [questionId, option.text.trim(), option.is_correct ?? false, option.sort_order ?? optionIndex],
        );
      }
    }

    await client.query('COMMIT');
    return getEvaluationTemplateById(templateId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
