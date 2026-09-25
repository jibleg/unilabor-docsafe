import pool from '../config/db';
import { withTransaction } from '../utils/transaction';
import { assignEvaluation } from './evaluation-assignment.service';
import {
  createEvaluationTemplate,
  replaceTemplateQuestions,
  updateEvaluationTemplate,
  type QuestionInput,
} from './evaluation-template.service';
import {
  getEvaluationById,
  KNOWLEDGE_ACTIVE_STATUSES,
  type CompetencyEvaluationRecord,
} from './rh-competency-evaluation.service';
import { COMPETENCY_KNOWLEDGE_COURSE_PREFIX } from './rh-competency-knowledge.constants';

// -----------------------------------------------------------------------------
// REH-REG-003, seccion 3 "Conocimiento" (30 %): cuestionario que el colaborador
// contesta en el sistema, armado desde el banco de preguntas APROBADAS del
// PUESTO (generadas con IA a partir de sus documentos obligatorios).
//
// Mecanica de "Asignar cuestionario":
//   1. Se toman N preguntas aprobadas al azar (random) o las que eligio el
//      evaluador (fixed). Solo tipos autocalificables (single/multiple/boolean).
//   2. Cada puesto tiene un training_course oculto COMPETENCIA-{PUESTO}; para
//      cada evaluacion se crea una plantilla propia (quiz, modo 'all') con esas
//      preguntas, la ventana y los minutos por intento que indico el evaluador,
//      y se publica.
//   3. Se asigna al colaborador SIN correo ni SMS (RH avisa en persona). El
//      colaborador la ve en "Mis evaluaciones" como cualquier cuestionario.
//   4. La seccion 3 del registro se llena con las preguntas y su respuesta
//      correcta; la respuesta dada y el acierto se vuelcan cuando el
//      colaborador envia (rh-competency-evaluation.service.ts ->
//      syncKnowledgeFromAssignment). El cuestionario NO genera constancia.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface AssignKnowledgeQuizInput {
  evaluationId: number;
  mode: 'random' | 'fixed';
  count?: number | undefined;
  itemIds?: number[] | undefined;
  windowHours: number;
  attemptTimeLimitMinutes: number | null;
  actorUserId: string | null;
}

interface BankQuestion {
  id: number;
  type: 'single' | 'multiple' | 'boolean';
  text: string;
  document_id: string | null;
  options: { text: string; is_correct: boolean }[];
}

const mapBankRow = (row: any): BankQuestion => ({
  id: Number(row.id),
  type: String(row.type) as BankQuestion['type'],
  text: String(row.text),
  document_id: row.document_id ? String(row.document_id) : null,
  options: Array.isArray(row.options) ? row.options : [],
});

/** Preguntas aprobadas y autocalificables del banco del puesto (para la UI y para armar el cuestionario). */
export const listApprovedBankQuestions = async (positionId: number): Promise<BankQuestion[]> => {
  const result = await pool.query(
    `SELECT id, type, text, document_id, options
       FROM public.rh_question_bank_items
      WHERE position_id = $1 AND status = 'APPROVED' AND type IN ('single', 'multiple', 'boolean')
      ORDER BY created_at ASC, id ASC;`,
    [positionId],
  );
  return result.rows.map(mapBankRow);
};

const pickQuestions = async (positionId: number, input: AssignKnowledgeQuizInput): Promise<BankQuestion[]> => {
  if (input.mode === 'random') {
    const count = input.count ?? 0;
    const result = await pool.query(
      `SELECT id, type, text, document_id, options
         FROM public.rh_question_bank_items
        WHERE position_id = $1 AND status = 'APPROVED' AND type IN ('single', 'multiple', 'boolean')
        ORDER BY random()
        LIMIT $2;`,
      [positionId, count],
    );
    if (result.rows.length < count) {
      throwCoded(
        'RH_COMP_EVAL_KNOWLEDGE_BANK_INSUFFICIENT',
        `El banco del puesto solo tiene ${result.rows.length} pregunta(s) aprobada(s); pediste ${count}. Genera y aprueba mas preguntas o reduce la cantidad.`,
      );
    }
    return result.rows.map(mapBankRow);
  }
  const ids = [...new Set((input.itemIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  const result = await pool.query(
    `SELECT id, type, text, document_id, options
       FROM public.rh_question_bank_items
      WHERE position_id = $1 AND status = 'APPROVED' AND type IN ('single', 'multiple', 'boolean') AND id = ANY($2::bigint[])
      ORDER BY array_position($2::bigint[], id);`,
    [positionId, ids],
  );
  if (result.rows.length !== ids.length) {
    throwCoded(
      'RH_COMP_EVAL_KNOWLEDGE_BANK_INSUFFICIENT',
      'Alguna de las preguntas elegidas ya no esta aprobada en el banco del puesto. Recarga la lista y vuelve a elegir.',
    );
  }
  return result.rows.map(mapBankRow);
};

/** Curso oculto del puesto que sostiene los cuestionarios de Conocimiento. Idempotente. */
const ensureKnowledgeCourse = async (positionId: number): Promise<{ courseId: number; positionName: string }> => {
  const position = await pool.query(`SELECT code, name FROM public.rh_positions WHERE id = $1 LIMIT 1;`, [positionId]);
  if (position.rows.length === 0) {
    return throwCoded('RH_COMP_EVAL_POSITION_NOT_FOUND', 'El puesto de la evaluacion ya no existe.');
  }
  const positionCode = String(position.rows[0].code).trim().toUpperCase();
  const positionName = String(position.rows[0].name);
  const courseCode = `${COMPETENCY_KNOWLEDGE_COURSE_PREFIX}${positionCode}`;
  const inserted = await pool.query(
    `INSERT INTO public.training_courses (code, title, description, certificate_validity_months)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT DO NOTHING
     RETURNING id;`,
    [
      courseCode,
      `Evaluacion de competencia - Conocimiento - ${positionName}`,
      `Cuestionarios de la seccion 3 (Conocimiento) del REH-REG-003 para el puesto ${positionName}. Sin constancia: el resultado se sella en la evaluacion de competencia.`,
    ],
  );
  if (inserted.rows.length > 0) {
    return { courseId: Number(inserted.rows[0].id), positionName };
  }
  const found = await pool.query(`SELECT id FROM public.training_courses WHERE code = $1 LIMIT 1;`, [courseCode]);
  return { courseId: Number(found.rows[0].id), positionName };
};

const correctAnswerText = (question: BankQuestion): string =>
  question.options
    .filter((option) => option.is_correct)
    .map((option) => option.text)
    .join(' | ');

export const assignKnowledgeQuiz = async (input: AssignKnowledgeQuizInput): Promise<CompetencyEvaluationRecord> => {
  const evaluation = await getEvaluationById(input.evaluationId);
  if (!evaluation) {
    return throwCoded('RH_COMP_EVAL_NOT_FOUND', 'La evaluacion indicada no existe.');
  }
  if (evaluation.status !== 'DRAFT') {
    return throwCoded('RH_COMP_EVAL_ALREADY_CLOSED', 'La evaluacion ya esta cerrada; no se puede modificar.');
  }
  if (evaluation.knowledge_quiz && KNOWLEDGE_ACTIVE_STATUSES.includes(evaluation.knowledge_quiz.status)) {
    return throwCoded(
      'RH_COMP_EVAL_KNOWLEDGE_ACTIVE',
      'El colaborador ya tiene un cuestionario de Conocimiento vigente. Espera a que lo conteste o cancelalo antes de asignar otro.',
    );
  }
  if (evaluation.knowledge_quiz && evaluation.knowledge_quiz.status === 'passed') {
    return throwCoded(
      'RH_COMP_EVAL_KNOWLEDGE_ACTIVE',
      'El colaborador ya contesto y acredito el cuestionario de Conocimiento; ese resultado es la evidencia de la seccion 3.',
    );
  }

  const questions = await pickQuestions(evaluation.position_id, input);
  if (questions.length === 0) {
    return throwCoded('RH_COMP_EVAL_KNOWLEDGE_BANK_INSUFFICIENT', 'No hay preguntas para asignar.');
  }

  const { courseId, positionName } = await ensureKnowledgeCourse(evaluation.position_id);

  const template = await createEvaluationTemplate(
    courseId,
    {
      title: `REH-REG-003 Conocimiento - ${evaluation.employee_name} - ${evaluation.evaluation_date}`,
      instructions: `Seccion 3 (Conocimiento) de tu evaluacion de competencia como ${positionName}. Contesta con base en los documentos obligatorios de tu puesto.`,
      evaluation_type: 'quiz',
      passing_score: 70,
      window_hours: input.windowHours,
      attempt_time_limit_minutes: input.attemptTimeLimitMinutes,
      selection_mode: 'all',
      status: 'draft',
    },
    input.actorUserId,
  );

  const questionInputs: QuestionInput[] = questions.map((question, index) => ({
    type: question.type,
    text: question.text,
    points: 1,
    sort_order: index,
    source_document_id: question.document_id,
    options: question.options.map((option, optionIndex) => ({
      text: option.text,
      is_correct: option.is_correct,
      sort_order: optionIndex,
    })),
  }));
  await replaceTemplateQuestions(template.id, questionInputs);
  await updateEvaluationTemplate(template.id, { title: template.title, status: 'published' });

  await assignEvaluation(template.id, [evaluation.employee_id], input.actorUserId, { notify: false });
  const assignmentResult = await pool.query(
    `SELECT id FROM public.evaluation_assignments
      WHERE template_id = $1 AND employee_id = $2
      ORDER BY created_at DESC LIMIT 1;`,
    [template.id, evaluation.employee_id],
  );
  const assignmentId = assignmentResult.rows[0]?.id ? Number(assignmentResult.rows[0].id) : null;
  if (!assignmentId) {
    return throwCoded('RH_COMP_EVAL_KNOWLEDGE_ASSIGN_FAILED', 'No se pudo crear el cuestionario para el colaborador.');
  }

  // Preguntas reales de la plantilla (en el mismo orden) para ligar cada item.
  const templateQuestions = await pool.query(
    `SELECT id FROM public.evaluation_questions WHERE template_id = $1 AND is_active = TRUE ORDER BY sort_order ASC, id ASC;`,
    [template.id],
  );
  const questionIds = templateQuestions.rows.map((row) => Number(row.id));

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.rh_competency_evaluations
          SET knowledge_assignment_id = $2, knowledge_selection_mode = $3, knowledge_synced_at = NULL, updated_at = NOW()
        WHERE id = $1;`,
      [evaluation.id, assignmentId, input.mode],
    );
    await client.query(
      `DELETE FROM public.rh_competency_evaluation_items WHERE evaluation_id = $1 AND section = 'CONOCIMIENTO';`,
      [evaluation.id],
    );
    for (const [index, question] of questions.entries()) {
      await client.query(
        `INSERT INTO public.rh_competency_evaluation_items
           (evaluation_id, section, question_id, item_text, criticality, expected_answer, sort_order)
         VALUES ($1, 'CONOCIMIENTO', $2, $3, 'M', $4, $5);`,
        [evaluation.id, questionIds[index] ?? null, question.text, correctAnswerText(question), index],
      );
    }
  });

  return (await getEvaluationById(evaluation.id)) as CompetencyEvaluationRecord;
};

/**
 * Cancela un cuestionario que el colaborador NUNCA inicio (pending sin
 * started_at ni respuestas): se elimina con su snapshot (no es evidencia), se
 * desliga y la seccion 3 vuelve a captura manual. Si ya se inicio/contesto, no.
 */
export const cancelKnowledgeQuiz = async (
  evaluationId: number,
  actorUserId: string | null,
): Promise<CompetencyEvaluationRecord> => {
  const evaluation = await getEvaluationById(evaluationId);
  if (!evaluation) {
    return throwCoded('RH_COMP_EVAL_NOT_FOUND', 'La evaluacion indicada no existe.');
  }
  if (evaluation.status !== 'DRAFT') {
    return throwCoded('RH_COMP_EVAL_ALREADY_CLOSED', 'La evaluacion ya esta cerrada; no se puede modificar.');
  }
  if (!evaluation.knowledge_quiz) {
    return throwCoded('RH_COMP_EVAL_KNOWLEDGE_NOT_ASSIGNED', 'Esta evaluacion no tiene cuestionario asignado.');
  }
  const assignmentId = evaluation.knowledge_quiz.assignment_id;

  await withTransaction(async (client) => {
    const assignment = await client.query(
      `SELECT a.status, a.started_at,
              EXISTS (SELECT 1 FROM public.evaluation_responses r WHERE r.assignment_id = a.id) AS has_responses
         FROM public.evaluation_assignments a WHERE a.id = $1 FOR UPDATE OF a;`,
      [assignmentId],
    );
    const row = assignment.rows[0];
    const untouched =
      !row || (['pending', 'expired'].includes(String(row.status)) && !row.started_at && !row.has_responses);
    if (!untouched) {
      throwCoded(
        'RH_COMP_EVAL_KNOWLEDGE_STARTED',
        'El colaborador ya inicio o contesto el cuestionario; no se puede cancelar. Cierra la evaluacion con ese resultado.',
      );
    }
    await client.query(
      `UPDATE public.rh_competency_evaluations
          SET knowledge_assignment_id = NULL, knowledge_selection_mode = NULL, knowledge_synced_at = NULL, updated_at = NOW()
        WHERE id = $1;`,
      [evaluationId],
    );
    await client.query(
      `UPDATE public.rh_competency_evaluation_items SET question_id = NULL WHERE evaluation_id = $1 AND section = 'CONOCIMIENTO';`,
      [evaluationId],
    );
    if (row) {
      await client.query(`UPDATE public.notification_log SET assignment_id = NULL WHERE assignment_id = $1;`, [assignmentId]);
      await client.query(`DELETE FROM public.evaluation_assignment_questions WHERE assignment_id = $1;`, [assignmentId]);
      await client.query(`DELETE FROM public.evaluation_assignments WHERE id = $1;`, [assignmentId]);
    }
  });

  void actorUserId;
  return (await getEvaluationById(evaluationId)) as CompetencyEvaluationRecord;
};
