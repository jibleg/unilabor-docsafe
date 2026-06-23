import type { PoolClient } from 'pg';
import pool from '../config/db';
import type {
  AssignmentResultSummary,
  EvaluationAssignmentRecord,
  EvaluationAssignmentStatus,
} from '../types';
import {
  PaginatedResult,
  PaginationInput,
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';
import { tryNotifyEvaluationAvailable } from './notification.service';

/**
 * Asignaciones de evaluacion (evaluation_assignments): instancia de una plantilla
 * por colaborador, con ventana de 72h y snapshot de preguntas (todas o un
 * subconjunto aleatorio). La instanciacion es idempotente: no duplica una
 * asignacion vigente para el mismo (plantilla, colaborador).
 */

const throwCoded = (code: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  throw error;
};

const tableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.evaluation_assignments') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const assertTable = async () => {
  if (!(await tableExists())) {
    throwCoded('EVAL_ASSIGNMENT_TABLES_NOT_AVAILABLE');
  }
};

const mapAssignmentRow = (row: any): EvaluationAssignmentRecord => {
  const record: EvaluationAssignmentRecord = {
    id: Number(row.id),
    template_id: Number(row.template_id),
    employee_id: Number(row.employee_id),
    status: String(row.status) as EvaluationAssignmentStatus,
    available_at: String(row.available_at),
    deadline_at: String(row.deadline_at),
    started_at: row.started_at ? String(row.started_at) : null,
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    graded_at: row.graded_at ? String(row.graded_at) : null,
    score: row.score !== null && row.score !== undefined ? Number(row.score) : null,
    max_score: row.max_score !== null && row.max_score !== undefined ? Number(row.max_score) : null,
    percentage: row.percentage !== null && row.percentage !== undefined ? Number(row.percentage) : null,
    attempt_no: Number(row.attempt_no),
  };
  if (row.template_title !== undefined) record.template_title = String(row.template_title);
  if (row.course_id !== undefined && row.course_id !== null) record.course_id = Number(row.course_id);
  if (row.course_title !== undefined) record.course_title = String(row.course_title);
  if (row.passing_score !== undefined && row.passing_score !== null) record.passing_score = Number(row.passing_score);
  if (row.window_hours !== undefined && row.window_hours !== null) record.window_hours = Number(row.window_hours);
  if (row.question_count !== undefined) record.question_count = Number(row.question_count);
  if (row.employee_name !== undefined) record.employee_name = String(row.employee_name);
  if (row.employee_code !== undefined) record.employee_code = String(row.employee_code);
  if (row.certificate_document_id !== undefined && row.certificate_document_id !== null) {
    record.certificate_document_id = Number(row.certificate_document_id);
  }
  if (row.late_requested_at !== undefined && row.late_requested_at !== null) {
    record.late_requested_at = String(row.late_requested_at);
  }
  if (row.created_at) record.created_at = String(row.created_at);
  if (row.updated_at) record.updated_at = String(row.updated_at);
  return record;
};

const ASSIGNMENT_BASE_QUERY = `
  SELECT
    a.id, a.template_id, a.employee_id, a.status, a.available_at, a.deadline_at,
    a.started_at, a.submitted_at, a.graded_at, a.score, a.max_score, a.percentage,
    a.attempt_no, a.certificate_document_id, a.late_requested_at, a.created_at, a.updated_at,
    t.title AS template_title, t.passing_score, t.window_hours,
    c.id AS course_id, c.title AS course_title,
    e.full_name AS employee_name, e.employee_code,
    (SELECT COUNT(*)::int FROM public.evaluation_assignment_questions aq WHERE aq.assignment_id = a.id) AS question_count
  FROM public.evaluation_assignments a
  JOIN public.evaluation_templates t ON t.id = a.template_id
  JOIN public.training_courses c ON c.id = t.training_course_id
  JOIN public.employees e ON e.id = a.employee_id
`;

/** Instancia una evaluacion para una lista de colaboradores. Idempotente. */
export const assignEvaluation = async (
  templateId: number,
  employeeIds: number[],
  createdByUserId: string | null,
): Promise<AssignmentResultSummary> => {
  await assertTable();

  const templateResult = await pool.query(
    `SELECT t.id, t.is_active, t.status, t.window_hours, t.selection_mode, t.random_count,
            (SELECT COUNT(*)::int FROM public.evaluation_questions q WHERE q.template_id = t.id) AS question_count
       FROM public.evaluation_templates t WHERE t.id = $1 LIMIT 1;`,
    [templateId],
  );
  if (templateResult.rows.length === 0) {
    throwCoded('EVAL_TEMPLATE_NOT_FOUND');
  }
  const template = templateResult.rows[0];

  if (!template.is_active || String(template.status) !== 'published') {
    throwCoded('EVAL_TEMPLATE_NOT_PUBLISHED');
  }
  const questionCount = Number(template.question_count);
  if (questionCount === 0) {
    throwCoded('EVAL_TEMPLATE_WITHOUT_QUESTIONS');
  }
  const isRandom = String(template.selection_mode) === 'random';
  const randomCount = template.random_count !== null ? Number(template.random_count) : null;
  if (isRandom && (!randomCount || randomCount > questionCount)) {
    throwCoded('RANDOM_COUNT_EXCEEDS_BANK');
  }

  const uniqueEmployeeIds = [...new Set(employeeIds.filter((id) => Number.isFinite(id) && id > 0))];
  const summary: AssignmentResultSummary = { created: 0, skipped: 0 };
  const createdAssignmentIds: number[] = [];

  for (const employeeId of uniqueEmployeeIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT 1 FROM public.evaluation_assignments
          WHERE template_id = $1 AND employee_id = $2
            AND status IN ('pending', 'in_progress', 'submitted', 'grading')
          LIMIT 1;`,
        [templateId, employeeId],
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        summary.skipped += 1;
        continue;
      }

      const inserted = await client.query(
        `INSERT INTO public.evaluation_assignments
           (template_id, employee_id, status, available_at, deadline_at, created_by_user_id)
         VALUES ($1, $2, 'pending', NOW(), NOW() + ($3 || ' hours')::interval, $4)
         RETURNING id;`,
        [templateId, employeeId, Number(template.window_hours), createdByUserId],
      );
      const assignmentId = Number(inserted.rows[0]?.id);

      await snapshotQuestions(client, assignmentId, templateId, isRandom ? randomCount : null);

      await client.query('COMMIT');
      summary.created += 1;
      createdAssignmentIds.push(assignmentId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      // Carrera contra el indice unico parcial: cuenta como omitida, no como fallo.
      if ((error as any)?.code === '23505') {
        summary.skipped += 1;
      } else {
        client.release();
        throw error;
      }
    } finally {
      client.release();
    }
  }

  // Aviso de disponibilidad (correo + SMS) fuera de las transacciones, best-effort.
  for (const assignmentId of createdAssignmentIds) {
    await tryNotifyEvaluationAvailable(assignmentId);
  }

  return summary;
};

/** Congela las preguntas de la asignacion (todas o un subconjunto aleatorio). */
const snapshotQuestions = async (
  client: PoolClient,
  assignmentId: number,
  templateId: number,
  randomCount: number | null,
): Promise<void> => {
  if (randomCount && randomCount > 0) {
    await client.query(
      `INSERT INTO public.evaluation_assignment_questions (assignment_id, question_id, sort_order)
       SELECT $1, sub.id, ROW_NUMBER() OVER () - 1
         FROM (
           SELECT id FROM public.evaluation_questions
            WHERE template_id = $2
            ORDER BY RANDOM()
            LIMIT $3
         ) sub;`,
      [assignmentId, templateId, randomCount],
    );
    return;
  }

  await client.query(
    `INSERT INTO public.evaluation_assignment_questions (assignment_id, question_id, sort_order)
     SELECT $1, id, sort_order FROM public.evaluation_questions
      WHERE template_id = $2 ORDER BY sort_order ASC, id ASC;`,
    [assignmentId, templateId],
  );
};

export interface AssignmentListOptions extends PaginationInput {
  search?: string | undefined;
  status?: string | undefined;
}

/** Listado de asignaciones de una plantilla (vista RH). */
export const listAssignmentsByTemplate = async (
  templateId: number,
  options: AssignmentListOptions = {},
): Promise<PaginatedResult<EvaluationAssignmentRecord>> => {
  await assertTable();

  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const search = buildIlikeSearch(['e.full_name', 'e.employee_code'], options.search, 1);
  const conditions = ['a.template_id = $1', search.clause].filter(Boolean);
  if (options.status) {
    conditions.push(`a.status = $${search.values.length + 2}`);
  }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const baseValues: unknown[] = [templateId, ...search.values, ...(options.status ? [options.status] : [])];

  const limitSql = paginate ? `LIMIT $${baseValues.length + 1} OFFSET $${baseValues.length + 2}` : '';
  const dataValues = paginate ? [...baseValues, limit, offset] : baseValues;

  const dataResult = await pool.query(
    `${ASSIGNMENT_BASE_QUERY} ${whereClause} ORDER BY a.created_at DESC, a.id DESC ${limitSql};`,
    dataValues,
  );
  const data = dataResult.rows.map(mapAssignmentRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.evaluation_assignments a
       JOIN public.employees e ON e.id = a.employee_id ${whereClause};`,
    baseValues,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

/** Listado de las evaluaciones de un colaborador (vista /me). */
export const listEmployeeAssignments = async (
  employeeId: number,
  options: AssignmentListOptions = {},
): Promise<PaginatedResult<EvaluationAssignmentRecord>> => {
  await assertTable();

  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const whereClause = 'WHERE a.employee_id = $1';

  const limitSql = paginate ? 'LIMIT $2 OFFSET $3' : '';
  const dataValues = paginate ? [employeeId, limit, offset] : [employeeId];

  const dataResult = await pool.query(
    `${ASSIGNMENT_BASE_QUERY} ${whereClause} ORDER BY a.deadline_at ASC, a.id DESC ${limitSql};`,
    dataValues,
  );
  const data = dataResult.rows.map(mapAssignmentRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.evaluation_assignments a ${whereClause};`,
    [employeeId],
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

/** Cuenta las evaluaciones accionables del colaborador (pendientes y vigentes). */
export const countPendingForEmployee = async (employeeId: number): Promise<number> => {
  if (!(await tableExists())) {
    return 0;
  }
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.evaluation_assignments
      WHERE employee_id = $1 AND status IN ('pending', 'in_progress', 'authorized_late') AND deadline_at > NOW();`,
    [employeeId],
  );
  return Number(result.rows[0]?.total ?? 0);
};

const throwAssignmentCoded = (code: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  throw error;
};

/** El colaborador (o RH a su nombre) solicita autorizacion extemporanea de una vencida. */
export const requestLateAuthorization = async (assignmentId: number, employeeId: number): Promise<void> => {
  const result = await pool.query(
    `SELECT employee_id, status FROM public.evaluation_assignments WHERE id = $1 LIMIT 1;`,
    [assignmentId],
  );
  if (result.rows.length === 0) {
    throwAssignmentCoded('EVAL_ASSIGNMENT_NOT_FOUND');
  }
  const row = result.rows[0];
  if (Number(row.employee_id) !== employeeId) {
    throwAssignmentCoded('EVAL_NOT_OWNER');
  }
  if (String(row.status) !== 'expired') {
    throwAssignmentCoded('EVAL_NOT_EXPIRED');
  }
  await pool.query(
    `UPDATE public.evaluation_assignments SET late_requested_at = NOW(), updated_at = NOW() WHERE id = $1;`,
    [assignmentId],
  );
};

/**
 * RH autoriza la realizacion extemporanea: reabre la ventana (mismo intento).
 * `reopenHours` permite fijar un plazo distinto (p. ej. 12 o 24h); si se omite,
 * se usa el window_hours del template (72h por defecto).
 */
export const authorizeLateAttempt = async (
  assignmentId: number,
  reopenHours?: number,
): Promise<EvaluationAssignmentRecord | null> => {
  const result = await pool.query(
    `SELECT a.status, t.window_hours
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
      WHERE a.id = $1 LIMIT 1;`,
    [assignmentId],
  );
  if (result.rows.length === 0) {
    throwAssignmentCoded('EVAL_ASSIGNMENT_NOT_FOUND');
  }
  if (String(result.rows[0].status) !== 'expired') {
    throwAssignmentCoded('EVAL_NOT_EXPIRED');
  }
  const windowHours =
    Number.isFinite(reopenHours) && (reopenHours as number) > 0
      ? Math.floor(reopenHours as number)
      : Number(result.rows[0].window_hours);
  await pool.query(
    `UPDATE public.evaluation_assignments
        SET status = 'authorized_late', available_at = NOW(),
            deadline_at = NOW() + ($2 || ' hours')::interval,
            reminder_sent_at = NULL, late_requested_at = NULL, updated_at = NOW()
      WHERE id = $1;`,
    [assignmentId, windowHours],
  );
  const refreshed = await pool.query(`${ASSIGNMENT_BASE_QUERY} WHERE a.id = $1 LIMIT 1;`, [assignmentId]);
  return refreshed.rows.length > 0 ? mapAssignmentRow(refreshed.rows[0]) : null;
};

/** Listado de evaluaciones vencidas (vista RH para autorizar extemporaneo). */
export const listExpiredAssignments = async (
  options: AssignmentListOptions = {},
): Promise<PaginatedResult<EvaluationAssignmentRecord>> => {
  await assertTable();
  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const whereClause = `WHERE a.status = 'expired'`;
  const limitSql = paginate ? 'LIMIT $1 OFFSET $2' : '';
  const dataResult = await pool.query(
    `${ASSIGNMENT_BASE_QUERY} ${whereClause}
      ORDER BY a.late_requested_at DESC NULLS LAST, a.deadline_at DESC ${limitSql};`,
    paginate ? [limit, offset] : [],
  );
  const data = dataResult.rows.map(mapAssignmentRow);
  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.evaluation_assignments a WHERE a.status = 'expired';`,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};
