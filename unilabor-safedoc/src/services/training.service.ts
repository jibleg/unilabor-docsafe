import crypto from 'crypto';
import type { PoolClient } from 'pg';
import pool from '../config/db';
import type { TrainingCourseRecord } from '../types';
import {
  PaginatedResult,
  PaginationInput,
  buildIlikeSearch,
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../utils/pagination';

/**
 * Capacitaciones (training_courses): entidad ancla de las evaluaciones de
 * capacitacion exigidas por ISO 15189:2022. CRUD + lectura. Las plantillas y el
 * banco de preguntas viven en evaluation-template.service.ts.
 */

export interface TrainingCoursePayload {
  code?: string | null;
  title: string;
  description?: string | null;
  certificate_validity_months?: number | null;
}

const DEFAULT_VALIDITY_MONTHS = 12;

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const tableExists = async (): Promise<boolean> => {
  const result = await pool.query(`SELECT to_regclass('public.training_courses') IS NOT NULL AS exists;`);
  return Boolean(result.rows[0]?.exists);
};

const assertTable = async () => {
  if (!(await tableExists())) {
    const error = new Error('TRAINING_TABLES_NOT_AVAILABLE');
    (error as any).code = 'TRAINING_TABLES_NOT_AVAILABLE';
    throw error;
  }
};

const mapCourseRow = (row: any): TrainingCourseRecord => {
  const course: TrainingCourseRecord = {
    id: Number(row.id),
    code: String(row.code),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    certificate_validity_months: Number(row.certificate_validity_months),
    is_active: Boolean(row.is_active),
  };
  if (row.template_count !== undefined) {
    course.template_count = Number(row.template_count);
  }
  if (row.created_at) {
    course.created_at = String(row.created_at);
  }
  if (row.updated_at) {
    course.updated_at = String(row.updated_at);
  }
  return course;
};

const ensureUniqueCode = async (client: PoolClient, code: string, courseId?: number) => {
  const result = await client.query(
    `SELECT id FROM public.training_courses
      WHERE LOWER(code) = LOWER($1) AND ($2::bigint IS NULL OR id <> $2::bigint) LIMIT 1;`,
    [code, courseId ?? null],
  );
  if (result.rows.length > 0) {
    const error = new Error('TRAINING_CODE_ALREADY_EXISTS');
    (error as any).code = 'TRAINING_CODE_ALREADY_EXISTS';
    throw error;
  }
};

const generateCourseCode = async (client: PoolClient): Promise<string> => {
  const result = await client.query(
    `SELECT nextval(pg_get_serial_sequence('public.training_courses', 'id')) AS next_id;`,
  );
  const nextId = Number(result.rows[0]?.next_id ?? 0);
  if (Number.isFinite(nextId) && nextId > 0) {
    return `CAP-${String(nextId).padStart(5, '0')}`;
  }
  return `CAP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

const COURSE_SEARCH_COLUMNS = ['c.code', 'c.title', 'c.description'];

export interface TrainingCourseListOptions extends PaginationInput {
  search?: string | undefined;
  includeInactive?: boolean;
}

const buildCourseBaseQuery = () => `
  SELECT
    c.id, c.code, c.title, c.description, c.certificate_validity_months,
    c.is_active, c.created_at, c.updated_at,
    COUNT(t.id)::int AS template_count
  FROM public.training_courses c
  LEFT JOIN public.evaluation_templates t
    ON t.training_course_id = c.id AND t.is_active = TRUE
`;

export const listTrainingCourses = async (
  options: TrainingCourseListOptions = {},
): Promise<PaginatedResult<TrainingCourseRecord>> => {
  await assertTable();

  const paginate = isPaginationRequested(options);
  const { page, limit, offset } = resolvePagination(options);
  const search = buildIlikeSearch(COURSE_SEARCH_COLUMNS, options.search, 0);
  const conditions = [options.includeInactive ? '' : 'c.is_active = TRUE', search.clause].filter(Boolean);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const limitSql = paginate
    ? `LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`
    : '';
  const dataValues = paginate ? [...search.values, limit, offset] : search.values;

  const dataResult = await pool.query(
    `${buildCourseBaseQuery()} ${whereClause}
     GROUP BY c.id
     ORDER BY c.title ASC, c.created_at DESC ${limitSql};`,
    dataValues,
  );
  const data = dataResult.rows.map(mapCourseRow);

  if (!paginate) {
    return buildPaginatedResult(data, data.length, 1, data.length || 1);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.training_courses c ${whereClause};`,
    search.values,
  );
  return buildPaginatedResult(data, countResult.rows[0]?.total, page, limit);
};

export const getTrainingCourseById = async (courseId: number): Promise<TrainingCourseRecord | null> => {
  await assertTable();
  const result = await pool.query(
    `${buildCourseBaseQuery()} WHERE c.id = $1 GROUP BY c.id LIMIT 1;`,
    [courseId],
  );
  return result.rows.length > 0 ? mapCourseRow(result.rows[0]) : null;
};

export const createTrainingCourse = async (
  payload: TrainingCoursePayload,
  createdByUserId: string | null,
): Promise<TrainingCourseRecord> => {
  await assertTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const requestedCode = normalizeOptionalText(payload.code);
    const code = requestedCode ?? (await generateCourseCode(client));
    await ensureUniqueCode(client, code);

    const validity =
      typeof payload.certificate_validity_months === 'number'
        ? payload.certificate_validity_months
        : DEFAULT_VALIDITY_MONTHS;

    const insertResult = await client.query(
      `INSERT INTO public.training_courses (code, title, description, certificate_validity_months, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id;`,
      [code, payload.title.trim(), normalizeOptionalText(payload.description), validity, createdByUserId],
    );

    await client.query('COMMIT');
    const created = await getTrainingCourseById(Number(insertResult.rows[0]?.id));
    if (!created) {
      const error = new Error('TRAINING_CREATION_FAILED');
      (error as any).code = 'TRAINING_CREATION_FAILED';
      throw error;
    }
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateTrainingCourse = async (
  courseId: number,
  payload: Partial<TrainingCoursePayload> & { is_active?: boolean },
): Promise<TrainingCourseRecord | null> => {
  await assertTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT * FROM public.training_courses WHERE id = $1 LIMIT 1;`,
      [courseId],
    );
    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const current = currentResult.rows[0];

    const resolvedCode =
      payload.code !== undefined ? normalizeOptionalText(payload.code) ?? String(current.code) : String(current.code);
    if (resolvedCode.toLowerCase() !== String(current.code).toLowerCase()) {
      await ensureUniqueCode(client, resolvedCode, courseId);
    }

    await client.query(
      `UPDATE public.training_courses
        SET code = $1, title = $2, description = $3, certificate_validity_months = $4, is_active = $5, updated_at = NOW()
        WHERE id = $6;`,
      [
        resolvedCode,
        payload.title !== undefined ? payload.title.trim() : String(current.title),
        payload.description !== undefined ? normalizeOptionalText(payload.description) : current.description,
        payload.certificate_validity_months !== undefined && payload.certificate_validity_months !== null
          ? payload.certificate_validity_months
          : Number(current.certificate_validity_months),
        payload.is_active !== undefined ? payload.is_active : Boolean(current.is_active),
        courseId,
      ],
    );

    await client.query('COMMIT');
    return getTrainingCourseById(courseId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateTrainingCourse = async (courseId: number): Promise<TrainingCourseRecord | null> => {
  await assertTable();
  const result = await pool.query(
    `UPDATE public.training_courses SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id;`,
    [courseId],
  );
  return result.rows.length > 0 ? getTrainingCourseById(courseId) : null;
};
