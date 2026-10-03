import pool from '../config/db';

// -----------------------------------------------------------------------------
// Estado de la evaluacion del curso de un puesto en las fases por puesto:
// Fase 5 se evalua con cuestionario (quiz) y Fase 6 con evaluacion practica
// capturada por RH. Es la pieza que evita el "limbo": nadie entra a la fase si
// su puesto no tiene la evaluacion lista para presentarla.
// -----------------------------------------------------------------------------

export type PositionEvaluationMode = 'quiz' | 'practical';

/** MISSING = no existe; DRAFT = en borrador; NO_QUESTIONS = cuestionario publicado sin preguntas; READY = lista. */
export type PositionEvaluationState = 'MISSING' | 'DRAFT' | 'NO_QUESTIONS' | 'READY';

/** Modo de evaluacion de una fase por puesto (la Fase 6 es practica supervisada). */
export const evaluationModeForPhase = (phaseNumber: number): PositionEvaluationMode => (phaseNumber === 6 ? 'practical' : 'quiz');

export interface CourseEvaluationSnapshot {
  template_id: number | null;
  status: string | null;
  question_count: number;
}

/** Regla pura (testeable): estado a partir de la plantilla mas reciente del curso. */
export const resolvePositionEvaluationState = (
  snapshot: CourseEvaluationSnapshot,
  mode: PositionEvaluationMode,
): PositionEvaluationState => {
  if (!snapshot.template_id) return 'MISSING';
  if (snapshot.status !== 'published') return 'DRAFT';
  if (mode === 'quiz' && snapshot.question_count === 0) return 'NO_QUESTIONS';
  return 'READY';
};

export const POSITION_EVALUATION_STATE_LABEL: Record<PositionEvaluationState, string> = {
  MISSING: 'sin evaluacion creada',
  DRAFT: 'en borrador',
  NO_QUESTIONS: 'publicado sin preguntas',
  READY: 'publicado',
};

/**
 * Fragmento SQL reutilizable: plantilla activa mas reciente del curso para el
 * modo (prefiere la publicada) con su numero de preguntas activas.
 * `courseExpr` y `modeExpr` son expresiones SQL (columna, parametro o literal).
 */
export const courseEvaluationLateral = (courseExpr: string, modeExpr: string, alias: string): string => `
  LEFT JOIN LATERAL (
    SELECT t.id AS template_id, t.status,
           (SELECT COUNT(*)::int FROM public.evaluation_questions q WHERE q.template_id = t.id AND q.is_active = TRUE) AS question_count
      FROM public.evaluation_templates t
     WHERE t.training_course_id = ${courseExpr} AND t.is_active = TRUE AND t.evaluation_type = ${modeExpr}
     ORDER BY (t.status = 'published') DESC, t.created_at DESC
     LIMIT 1
  ) ${alias} ON TRUE`;

export const loadCourseEvaluationState = async (
  courseId: number,
  mode: PositionEvaluationMode,
): Promise<PositionEvaluationState> => {
  const result = await pool.query(
    `SELECT ev.template_id, ev.status, ev.question_count
       FROM (SELECT $1::bigint AS course_id) c
       ${courseEvaluationLateral('c.course_id', '$2', 'ev')};`,
    [courseId, mode],
  );
  const row = result.rows[0] ?? {};
  return resolvePositionEvaluationState(
    {
      template_id: row.template_id ? Number(row.template_id) : null,
      status: row.status ? String(row.status) : null,
      question_count: Number(row.question_count ?? 0),
    },
    mode,
  );
};
