import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { toIsoDateTime } from '../utils/date-serialization';
import { assignEvaluation } from './evaluation-assignment.service';
import {
  getEvaluationById,
  KNOWLEDGE_ACTIVE_STATUSES,
  syncKnowledgeFromAssignment,
  type CompetencyEvaluationRecord,
} from './rh-competency-evaluation.service';

// -----------------------------------------------------------------------------
// REH-REG-003, seccion 3 "Conocimiento" desde la CAPACITACION del puesto
// (Fase 7). Cada puesto tiene 0..N capacitaciones ligadas en el catalogo
// (rh_position_training_courses). Al evaluar, RH elige una de las
// capacitaciones del puesto evaluado y:
//   - 'new': se asigna al colaborador el cuestionario publicado del curso (con
//     las reglas del propio curso: ventana, minutos, minimo, sorteo), sin avisos;
//   - 'existing': se toma el ultimo intento que el colaborador ya presento (o
//     tiene en curso) de esa capacitacion.
// Las preguntas del intento (snapshot) se vuelcan a la seccion 3 con su
// respuesta correcta; la respuesta dada y el acierto se sincronizan al
// terminar (syncKnowledgeFromAssignment). A diferencia del banco del puesto, el
// cuestionario es de una capacitacion real: al acreditarlo el colaborador
// recibe su constancia de curso como en cualquier capacitacion.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

const HIDDEN_COURSE_PREFIXES = ['INDUCCION-FASE-', 'COMPETENCIA-'];

export interface PositionTrainingCourse {
  link_id: number;
  position_id: number;
  course_id: number;
  course_code: string;
  course_title: string;
  published_template_id: number | null;
  published_template_title: string | null;
  question_count: number;
  created_at: string;
}

export interface TrainingCourseOption {
  id: number;
  code: string;
  title: string;
  has_published_quiz: boolean;
}

const PUBLISHED_QUIZ_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT t.id, t.title,
           (SELECT COUNT(*)::int FROM public.evaluation_questions q WHERE q.template_id = t.id AND q.is_active = TRUE) AS question_count
      FROM public.evaluation_templates t
     WHERE t.training_course_id = c.id AND t.status = 'published' AND t.is_active = TRUE AND t.evaluation_type = 'quiz'
     ORDER BY t.created_at DESC LIMIT 1
  ) q ON TRUE`;

export const listPositionTrainingCourses = async (positionId: number): Promise<PositionTrainingCourse[]> => {
  const result = await pool.query(
    `SELECT l.id AS link_id, l.position_id, l.created_at, c.id AS course_id, c.code, c.title,
            q.id AS template_id, q.title AS template_title, q.question_count
       FROM public.rh_position_training_courses l
       JOIN public.training_courses c ON c.id = l.training_course_id
       ${PUBLISHED_QUIZ_LATERAL}
      WHERE l.position_id = $1
      ORDER BY c.title ASC;`,
    [positionId],
  );
  return result.rows.map((row) => ({
    link_id: Number(row.link_id),
    position_id: Number(row.position_id),
    course_id: Number(row.course_id),
    course_code: String(row.code),
    course_title: String(row.title),
    published_template_id: row.template_id ? Number(row.template_id) : null,
    published_template_title: row.template_title ? String(row.template_title) : null,
    question_count: Number(row.question_count ?? 0),
    created_at: toIsoDateTime(row.created_at),
  }));
};

/** Capacitaciones que se pueden ligar a un puesto (excluye las internas de Induccion/Competencia). */
export const listLinkableTrainingCourses = async (): Promise<TrainingCourseOption[]> => {
  const result = await pool.query(
    `SELECT c.id, c.code, c.title, q.id AS template_id
       FROM public.training_courses c
       ${PUBLISHED_QUIZ_LATERAL}
      WHERE c.is_active = TRUE AND NOT (c.code LIKE ANY($1::text[]))
      ORDER BY c.title ASC;`,
    [HIDDEN_COURSE_PREFIXES.map((prefix) => `${prefix}%`)],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    title: String(row.title),
    has_published_quiz: Boolean(row.template_id),
  }));
};

export const linkTrainingCourseToPosition = async (
  positionId: number,
  courseId: number,
  actorUserId: string | null,
): Promise<PositionTrainingCourse[]> => {
  const course = await pool.query(`SELECT code FROM public.training_courses WHERE id = $1 AND is_active = TRUE LIMIT 1;`, [courseId]);
  if (course.rows.length === 0) {
    throwCoded('RH_POSITION_COURSE_NOT_FOUND', 'La capacitacion no existe o esta inactiva.');
  }
  if (HIDDEN_COURSE_PREFIXES.some((prefix) => String(course.rows[0].code).startsWith(prefix))) {
    throwCoded('RH_POSITION_COURSE_NOT_ALLOWED', 'Las capacitaciones internas de Induccion o de Competencia no se ligan a puestos.');
  }
  const position = await pool.query(`SELECT 1 FROM public.rh_positions WHERE id = $1 LIMIT 1;`, [positionId]);
  if (position.rows.length === 0) {
    throwCoded('RH_POSITION_NOT_FOUND', 'El puesto no existe.');
  }
  await pool.query(
    `INSERT INTO public.rh_position_training_courses (position_id, training_course_id, created_by_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (position_id, training_course_id) DO NOTHING;`,
    [positionId, courseId, actorUserId],
  );
  return listPositionTrainingCourses(positionId);
};

export const unlinkTrainingCourseFromPosition = async (linkId: number): Promise<number | null> => {
  const result = await pool.query(
    `DELETE FROM public.rh_position_training_courses WHERE id = $1 RETURNING position_id;`,
    [linkId],
  );
  return result.rows.length > 0 ? Number(result.rows[0].position_id) : null;
};

// -----------------------------------------------------------------------------
// Opciones para la seccion 3 de una evaluacion
// -----------------------------------------------------------------------------

export interface CourseAttemptSummary {
  assignment_id: number;
  status: string;
  attempt_no: number;
  percentage: number | null;
  submitted_at: string | null;
  deadline_at: string | null;
  question_count: number;
}

export interface KnowledgeCourseOption extends PositionTrainingCourse {
  /** Ultimo intento del colaborador en esta capacitacion (si existe). */
  last_attempt: CourseAttemptSummary | null;
}

const USABLE_EXISTING_STATUSES = ['passed', 'failed', 'grading', 'submitted', 'pending', 'in_progress', 'authorized_late'];

const loadLastAttempt = async (employeeId: number, courseId: number): Promise<CourseAttemptSummary | null> => {
  const result = await pool.query(
    `SELECT a.id, a.status, a.attempt_no, a.percentage, a.submitted_at, a.deadline_at,
            (SELECT COUNT(*)::int FROM public.evaluation_assignment_questions aq WHERE aq.assignment_id = a.id) AS question_count
       FROM public.evaluation_assignments a
       JOIN public.evaluation_templates t ON t.id = a.template_id
      WHERE a.employee_id = $1 AND t.training_course_id = $2 AND t.evaluation_type = 'quiz'
        AND a.status = ANY($3::text[])
      ORDER BY a.created_at DESC LIMIT 1;`,
    [employeeId, courseId, USABLE_EXISTING_STATUSES],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    assignment_id: Number(row.id),
    status: String(row.status),
    attempt_no: Number(row.attempt_no ?? 1),
    percentage: row.percentage !== null && row.percentage !== undefined ? Number(row.percentage) : null,
    submitted_at: row.submitted_at ? toIsoDateTime(row.submitted_at) : null,
    deadline_at: row.deadline_at ? toIsoDateTime(row.deadline_at) : null,
    question_count: Number(row.question_count ?? 0),
  };
};

export const listKnowledgeCourseOptions = async (evaluationId: number): Promise<KnowledgeCourseOption[]> => {
  const evaluation = await getEvaluationById(evaluationId);
  if (!evaluation) {
    return throwCoded('RH_COMP_EVAL_NOT_FOUND', 'La evaluacion indicada no existe.');
  }
  const courses = await listPositionTrainingCourses(evaluation.position_id);
  const options: KnowledgeCourseOption[] = [];
  for (const course of courses) {
    options.push({ ...course, last_attempt: await loadLastAttempt(evaluation.employee_id, course.course_id) });
  }
  return options;
};

// -----------------------------------------------------------------------------
// Ligar la capacitacion a la seccion 3
// -----------------------------------------------------------------------------

export interface AssignCourseKnowledgeInput {
  evaluationId: number;
  courseId: number;
  mode: 'new' | 'existing';
  actorUserId: string | null;
}

const assertEditable = (evaluation: CompetencyEvaluationRecord): void => {
  if (evaluation.status !== 'DRAFT') {
    throwCoded('RH_COMP_EVAL_ALREADY_CLOSED', 'La evaluacion ya esta cerrada; no se puede modificar.');
  }
  if (evaluation.knowledge_quiz && KNOWLEDGE_ACTIVE_STATUSES.includes(evaluation.knowledge_quiz.status)) {
    throwCoded(
      'RH_COMP_EVAL_KNOWLEDGE_ACTIVE',
      'La seccion 3 ya tiene un cuestionario vigente. Espera a que el colaborador lo conteste o desligalo antes de elegir otro.',
    );
  }
  if (evaluation.knowledge_quiz && evaluation.knowledge_quiz.status === 'passed') {
    throwCoded(
      'RH_COMP_EVAL_KNOWLEDGE_ACTIVE',
      'La seccion 3 ya tiene un cuestionario acreditado; ese resultado es la evidencia de Conocimiento.',
    );
  }
};

/** Resuelve el intento a usar: el ultimo existente o uno nuevo del cuestionario publicado del curso. */
const resolveAssignment = async (
  evaluation: CompetencyEvaluationRecord,
  courseId: number,
  mode: 'new' | 'existing',
  actorUserId: string | null,
): Promise<number> => {
  if (mode === 'existing') {
    const last = await loadLastAttempt(evaluation.employee_id, courseId);
    if (!last) {
      return throwCoded(
        'RH_COMP_EVAL_COURSE_NO_ATTEMPT',
        'El colaborador no ha presentado la evaluacion de esta capacitacion. Asignale una nueva.',
      );
    }
    return last.assignment_id;
  }
  const template = await pool.query(
    `SELECT id FROM public.evaluation_templates
      WHERE training_course_id = $1 AND status = 'published' AND is_active = TRUE AND evaluation_type = 'quiz'
      ORDER BY created_at DESC LIMIT 1;`,
    [courseId],
  );
  if (template.rows.length === 0) {
    return throwCoded(
      'RH_COMP_EVAL_COURSE_NO_QUIZ',
      'La capacitacion no tiene un cuestionario publicado. Publicalo en Capacitaciones antes de asignarlo.',
    );
  }
  const templateId = Number(template.rows[0].id);
  // assignEvaluation es idempotente: si ya hay un intento vivo de esa plantilla lo reutiliza.
  await assignEvaluation(templateId, [evaluation.employee_id], actorUserId, { notify: false });
  const assignment = await pool.query(
    `SELECT id FROM public.evaluation_assignments
      WHERE template_id = $1 AND employee_id = $2
        AND status IN ('pending', 'in_progress', 'authorized_late', 'submitted', 'grading')
      ORDER BY created_at DESC LIMIT 1;`,
    [templateId, evaluation.employee_id],
  );
  if (assignment.rows.length === 0) {
    return throwCoded('RH_COMP_EVAL_KNOWLEDGE_ASSIGN_FAILED', 'No se pudo asignar la evaluacion de la capacitacion al colaborador.');
  }
  return Number(assignment.rows[0].id);
};

export const assignCourseKnowledge = async (input: AssignCourseKnowledgeInput): Promise<CompetencyEvaluationRecord> => {
  const evaluation = await getEvaluationById(input.evaluationId);
  if (!evaluation) {
    return throwCoded('RH_COMP_EVAL_NOT_FOUND', 'La evaluacion indicada no existe.');
  }
  assertEditable(evaluation);
  const linked = await pool.query(
    `SELECT 1 FROM public.rh_position_training_courses WHERE position_id = $1 AND training_course_id = $2 LIMIT 1;`,
    [evaluation.position_id, input.courseId],
  );
  if (linked.rows.length === 0) {
    return throwCoded(
      'RH_COMP_EVAL_COURSE_NOT_LINKED',
      'Esa capacitacion no esta ligada al puesto evaluado. Ligala primero en Puestos (induccion).',
    );
  }

  const assignmentId = await resolveAssignment(evaluation, input.courseId, input.mode, input.actorUserId);

  // Preguntas del intento (snapshot) con su respuesta correcta.
  const questions = await pool.query(
    `SELECT q.id, q.type, q.text,
            COALESCE((SELECT string_agg(o.text, ' | ' ORDER BY o.sort_order, o.id)
                        FROM public.evaluation_question_options o
                       WHERE o.question_id = q.id AND o.is_correct = TRUE), '') AS correct_text
       FROM public.evaluation_assignment_questions aq
       JOIN public.evaluation_questions q ON q.id = aq.question_id
      WHERE aq.assignment_id = $1
      ORDER BY aq.sort_order ASC, aq.id ASC;`,
    [assignmentId],
  );
  if (questions.rows.length === 0) {
    return throwCoded('RH_COMP_EVAL_KNOWLEDGE_ASSIGN_FAILED', 'La evaluacion de la capacitacion no tiene preguntas.');
  }
  const referenceDate = await pool.query(
    `SELECT COALESCE(submitted_at, available_at, created_at)::date AS d FROM public.evaluation_assignments WHERE id = $1;`,
    [assignmentId],
  );

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.rh_competency_evaluations
          SET knowledge_assignment_id = $2, knowledge_selection_mode = 'course', knowledge_synced_at = NULL,
              reference_course_id = $3, reference_course_date = $4, updated_at = NOW()
        WHERE id = $1;`,
      [evaluation.id, assignmentId, input.courseId, referenceDate.rows[0]?.d ?? null],
    );
    await client.query(`DELETE FROM public.rh_competency_evaluation_items WHERE evaluation_id = $1 AND section = 'CONOCIMIENTO';`, [
      evaluation.id,
    ]);
    for (const [index, row] of questions.rows.entries()) {
      const expected = String(row.type) === 'open' ? 'Respuesta abierta (calificada por RH)' : String(row.correct_text ?? '');
      await client.query(
        `INSERT INTO public.rh_competency_evaluation_items
           (evaluation_id, section, question_id, item_text, criticality, expected_answer, sort_order)
         VALUES ($1, 'CONOCIMIENTO', $2, $3, 'M', $4, $5);`,
        [evaluation.id, Number(row.id), String(row.text), expected, index],
      );
    }
  });

  // Si el intento ya estaba contestado (modo 'existing'), se vuelca de inmediato.
  await syncKnowledgeFromAssignment(evaluation.id, assignmentId);
  return (await getEvaluationById(evaluation.id)) as CompetencyEvaluationRecord;
};
