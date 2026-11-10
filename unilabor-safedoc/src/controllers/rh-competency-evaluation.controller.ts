import type { Response } from 'express';
import { getCompetencySuggestedSigners } from '../services/rh-competency-signers.service';
import { tryCreateLetterForEvaluation } from '../services/rh-assignment-letter.service';
import { assignCourseKnowledge, assignPhase5Knowledge, listKnowledgeCourseOptions, tryAssignPhase5Knowledge } from '../services/rh-competency-course-knowledge.service';
import type { AssignCourseKnowledgeInput } from '../schemas/rh-competency-evaluation.schema';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  createEvaluation,
  deleteDraftEvaluation,
  getEvaluationById,
  listEvaluations,
  replaceActions,
  replaceSectionItems,
  updateEvaluation,
} from '../services/rh-competency-evaluation.service';
import { authorizeEvaluation } from '../services/rh-competency-authorization.service';
import { EVALUATOR_IS_PHASE6_SUPERVISOR_CODE } from '../services/rh-competency-evaluator.rules';
import { proposePhase7Evaluator } from '../services/rh-competency-evaluator.service';
import { describePhase7AutoStart, tryAutoStartPhase7, type Phase7AutoStartOutcome } from '../services/rh-induction-phase7-auto.service';
import {
  assignKnowledgeQuiz,
  cancelKnowledgeQuiz,
  listApprovedBankQuestions,
} from '../services/rh-competency-knowledge.service';
import type { AssignKnowledgeQuizInput } from '../schemas/rh-competency-evaluation.schema';
import { issueCompetencyCertificate, tryIssueCompetencyCertificate } from '../services/rh-competency-certificate.service';

/**
 * Endpoints del modulo Evaluacion de competencia (REH-REG-003). Montados en
 * /api/rh/competency-evaluations, guard RH.COMPETENCY.MANAGE.
 */

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_COMP_EVAL_AUTH_NOT_PENDING: 409,
  RH_COMP_EVAL_SIGNATURE_FILE_MISSING: 409,
  RH_COMP_EVAL_EMPLOYEE_NOT_FOUND: 404,
  RH_COMP_EVAL_POSITION_NOT_FOUND: 404,
  RH_COMP_EVAL_NOT_FOUND: 404,
  RH_COMP_EVAL_ALREADY_CLOSED: 409,
  RH_COMP_EVAL_INCOMPLETE: 409,
  RH_COMP_EVAL_UNSCORED_ITEMS: 409,
  RH_COMP_EVAL_ACTIONS_REQUIRED: 409,
  RH_COMP_EVAL_INVALID_SIGNATURE: 400,
  ARCHIVE_DOCUMENT_TYPE_NOT_FOUND: 409,
  RH_COMP_EVAL_KNOWLEDGE_LOCKED: 409,
  RH_COMP_EVAL_KNOWLEDGE_PENDING: 409,
  RH_COMP_EVAL_KNOWLEDGE_ACTIVE: 409,
  RH_COMP_EVAL_KNOWLEDGE_BANK_INSUFFICIENT: 409,
  RH_COMP_EVAL_KNOWLEDGE_ASSIGN_FAILED: 500,
  RH_COMP_EVAL_KNOWLEDGE_NOT_ASSIGNED: 409,
  RH_COMP_EVAL_KNOWLEDGE_STARTED: 409,
  TRAINING_COURSE_NOT_FOUND: 404,
  RANDOM_COUNT_EXCEEDS_BANK: 409,
  RH_COMP_EVAL_NOT_CLOSED: 409,
  RH_COMP_EVAL_CERT_NOT_ELIGIBLE: 409,
  RH_COMP_EVAL_USER_NOT_FOUND: 409,
  RH_COMP_EVAL_COURSE_NOT_LINKED: 409,
  RH_COMP_EVAL_COURSE_NO_QUIZ: 409,
  RH_COMP_EVAL_COURSE_NO_ATTEMPT: 409,
  RH_COMP_EVAL_PHASE5_NOT_FOUND: 409,
  [EVALUATOR_IS_PHASE6_SUPERVISOR_CODE]: 409,
  RH_COMP_EVAL_EVALUATOR_NOT_FOUND: 409,
  RH_COMP_EVAL_EVALUATOR_REQUIRED: 409,
  RH_COMP_EVAL_INICIAL_ALREADY_OPEN: 409,
  RH_COMP_EVAL_IN_SIGNATURE: 409,
  RH_DOC_SIGNATURE_HAS_SIGNATURES: 409,
};

const mapError = (res: Response, error: any): Response | null => {
  const status = ERROR_STATUS[error?.code];
  if (!status) {
    return null;
  }
  return res.status(status).json({ message: error?.publicMessage || 'No se pudo completar la operacion.' });
};

const logAudit = async (userId: string | undefined, action: string, entityId: number, ipAddress: string | undefined) => {
  if (!userId) return;
  await registerAuditEvent({
    user_id: userId,
    action,
    ip_address: ipAddress ?? null,
    module_code: 'RH',
    entity_type: 'competency_evaluation',
    entity_id: entityId,
  });
};

export const createCompetencyEvaluationController = async (req: AuthRequest, res: Response) => {
  try {
    let evaluation = await createEvaluation({
      employeeId: Number(req.body.employee_id),
      positionId: Number(req.body.position_id),
      evaluationType: req.body.evaluation_type,
      evaluationDate: req.body.evaluation_date,
      evaluatorEmployeeId: req.body.evaluator_employee_id,
      evaluatorName: req.body.evaluator_name ?? undefined,
      referenceCourseId: req.body.reference_course_id ?? null,
      referenceCourseDate: req.body.reference_course_date ?? null,
      createdByUserId: req.user?.id ?? null,
    });
    await logAudit(req.user?.id, `RH_COMP_EVAL_CREATE:${evaluation.id}`, evaluation.id, req.ip);
    // INICIAL (Fase 7): la seccion 3 toma el cuestionario de la Fase 5 del puesto si existe.
    if (evaluation.evaluation_type === 'INICIAL' && (await tryAssignPhase5Knowledge(evaluation.id))) {
      evaluation = (await getEvaluationById(evaluation.id)) ?? evaluation;
    }
    return res.status(201).json({ message: 'Evaluacion creada como borrador.', evaluation });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error creando evaluacion de competencia:', error);
    return res.status(500).json({ message: 'No se pudo crear la evaluacion.' });
  }
};

export const listCompetencyEvaluationsController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listEvaluations({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      page: typeof req.query.page === 'string' ? Number(req.query.page) : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    });
    return res.json(result);
  } catch (error) {
    console.error('Error listando evaluaciones de competencia:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las evaluaciones.' });
  }
};

export const getCompetencyEvaluationController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const evaluation = await getEvaluationById(evaluationId);
    if (!evaluation) {
      return res.status(404).json({ message: 'La evaluacion indicada no existe.' });
    }
    return res.json({ evaluation });
  } catch (error) {
    console.error('Error consultando evaluacion de competencia:', error);
    return res.status(500).json({ message: 'No se pudo consultar la evaluacion.' });
  }
};

export const updateCompetencyEvaluationController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const evaluation = await updateEvaluation(evaluationId, {
      evaluationType: req.body.evaluation_type,
      evaluationDate: req.body.evaluation_date,
      evaluatorEmployeeId: req.body.evaluator_employee_id,
      evaluatorName: req.body.evaluator_name,
      referenceCourseId: req.body.reference_course_id,
      referenceCourseDate: req.body.reference_course_date,
    });
    await logAudit(req.user?.id, `RH_COMP_EVAL_UPDATE:${evaluationId}`, evaluationId, req.ip);
    return res.json({ message: 'Evaluacion actualizada.', evaluation });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error actualizando evaluacion de competencia:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la evaluacion.' });
  }
};

export const replaceCompetencySectionItemsController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const evaluation = await replaceSectionItems(evaluationId, req.body.section, req.body.items);
    return res.json({ message: 'Seccion guardada.', evaluation });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error guardando seccion de evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo guardar la seccion.' });
  }
};

export const replaceCompetencyActionsController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const evaluation = await replaceActions(evaluationId, req.body.actions);
    return res.json({ message: 'Plan de acciones guardado.', evaluation });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error guardando plan de acciones:', error);
    return res.status(500).json({ message: 'No se pudo guardar el plan de acciones.' });
  }
};

/** Que paso con el siguiente puesto de la ruta al autorizar (vacio si no habia nada que informar). */
const nextPositionMessage = (next: Phase7AutoStartOutcome | null): string => {
  if (!next || next.status === 'NOT_DUE' || next.status === 'ALREADY_OPEN') return '';
  return `Siguiente puesto: ${describePhase7AutoStart(next)}`;
};

export const authorizeCompetencyEvaluationController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida.' });
  }
  const decision = req.body.decision as 'AUTORIZADO' | 'AUTORIZADO_CON_SEGUIMIENTO' | 'NO_AUTORIZADO';
  const note = typeof req.body.note === 'string' && req.body.note.trim() ? String(req.body.note).trim() : null;
  try {
    const evaluation = await authorizeEvaluation({ evaluationId, decision, note, decidedByUserId: req.user.id });
    await logAudit(req.user.id, `RH_COMP_EVAL_AUTHORIZE:${evaluationId}:${decision}`, evaluationId, req.ip);
    // Constancia de competencia: nace al autorizar (best-effort, no deshace la autorizacion).
    const certificateDocumentId = decision === 'NO_AUTORIZADO' ? null : await tryIssueCompetencyCertificate(evaluationId, req.user.id);
    if (certificateDocumentId) {
      await logAudit(req.user.id, `RH_COMP_EVAL_CERTIFICATE_ISSUED:${evaluationId}:${certificateDocumentId}`, evaluationId, req.ip);
    }
    const finalEvaluation = certificateDocumentId ? (await getEvaluationById(evaluationId)) ?? evaluation : evaluation;
    // Fase 7: carta de asignacion de puesto REH-REG-008 en borrador (solo INICIAL autorizado; best-effort).
    const letter = decision === 'NO_AUTORIZADO' ? null : await tryCreateLetterForEvaluation(evaluationId, req.user.id);
    // Fase 7 encadenada: al autorizar la INICIAL de un puesto se abre sola la del siguiente
    // puesto de la ruta (best-effort, nunca lanza: no deshace la autorizacion).
    const nextPosition =
      decision !== 'NO_AUTORIZADO' && evaluation.evaluation_type === 'INICIAL'
        ? await tryAutoStartPhase7(evaluation.employee_id, req.user.id, 'COMPETENCY_AUTHORIZED')
        : null;
    const baseMessage =
      decision === 'NO_AUTORIZADO'
        ? 'Decision registrada: NO AUTORIZADO. El registro actualizado quedo en el expediente.'
        : certificateDocumentId
          ? 'Evaluacion autorizada; registro actualizado y constancia de competencia archivados en el expediente.'
          : 'Evaluacion autorizada; registro actualizado en el expediente.';
    return res.json({
      assignment_letter_id: letter?.id ?? null,
      next_evaluation_id: nextPosition?.status === 'OPENED' ? nextPosition.evaluation_id : null,
      message: `${baseMessage} ${nextPositionMessage(nextPosition)}`.trim(),
      evaluation: finalEvaluation,
    });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error autorizando evaluacion de competencia:', error);
    return res.status(500).json({ message: 'No se pudo registrar la autorizacion.' });
  }
};

export const deleteCompetencyEvaluationController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    await deleteDraftEvaluation(evaluationId);
    await logAudit(req.user?.id, `RH_COMP_EVAL_DELETE_DRAFT:${evaluationId}`, evaluationId, req.ip);
    return res.status(204).send();
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error eliminando borrador de evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el borrador.' });
  }
};

/** POST /rh/competency-evaluations/:id/knowledge-quiz - asigna el cuestionario de Conocimiento. */
export const assignKnowledgeQuizController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  const body = req.body as AssignKnowledgeQuizInput;
  try {
    const evaluation = await assignKnowledgeQuiz({
      evaluationId,
      mode: body.mode,
      count: body.count,
      itemIds: body.item_ids,
      windowHours: body.window_hours,
      attemptTimeLimitMinutes: body.attempt_time_limit_minutes ?? null,
      actorUserId: req.user?.id ?? null,
    });
    await logAudit(
      req.user?.id,
      `RH_COMP_EVAL_KNOWLEDGE_ASSIGNED:${evaluationId}:${evaluation.knowledge_quiz?.assignment_id ?? 0}:${body.mode}`,
      evaluationId,
      req.ip,
    );
    return res.status(201).json({
      message: `Cuestionario de Conocimiento asignado (${evaluation.knowledge_quiz?.question_count ?? 0} preguntas).`,
      evaluation,
    });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error asignando cuestionario de Conocimiento:', error);
    return res.status(500).json({ message: 'No se pudo asignar el cuestionario de Conocimiento.' });
  }
};

/** DELETE /rh/competency-evaluations/:id/knowledge-quiz - cancela un cuestionario nunca iniciado. */
export const cancelKnowledgeQuizController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const evaluation = await cancelKnowledgeQuiz(evaluationId, req.user?.id ?? null);
    await logAudit(req.user?.id, `RH_COMP_EVAL_KNOWLEDGE_CANCELLED:${evaluationId}`, evaluationId, req.ip);
    return res.json({ message: 'Cuestionario cancelado; la seccion Conocimiento vuelve a captura manual.', evaluation });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error cancelando cuestionario de Conocimiento:', error);
    return res.status(500).json({ message: 'No se pudo cancelar el cuestionario.' });
  }
};

/** GET /rh/competency-evaluations/positions/:positionId/question-bank/approved - banco aprobado del puesto. */
export const listApprovedPositionQuestionsController = async (req: AuthRequest, res: Response) => {
  const positionId = parseId(req.params.positionId);
  if (!positionId) {
    return res.status(400).json({ message: 'ID de puesto invalido.' });
  }
  try {
    return res.json({ items: await listApprovedBankQuestions(positionId) });
  } catch (error) {
    console.error('Error listando banco aprobado del puesto:', error);
    return res.status(500).json({ message: 'No se pudo cargar el banco de preguntas del puesto.' });
  }
};

/** POST /rh/competency-evaluations/:id/certificate - emite (o reemite con ?force=true) la constancia de competencia. */
export const issueCompetencyCertificateController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  const force = req.query.force === 'true' || req.body?.force === true;
  try {
    const evaluation = await issueCompetencyCertificate({ evaluationId, actorUserId: req.user?.id ?? null, force });
    await logAudit(
      req.user?.id,
      `RH_COMP_EVAL_CERTIFICATE_ISSUED:${evaluationId}:${evaluation.certificate_document_id ?? 0}`,
      evaluationId,
      req.ip,
    );
    return res.status(201).json({ message: 'Constancia de competencia archivada en el expediente.', evaluation });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error emitiendo constancia de competencia:', error);
    return res.status(500).json({ message: 'No se pudo emitir la constancia de competencia.' });
  }
};

/** GET /rh/competency-evaluations/:id/knowledge-courses - capacitaciones del puesto evaluado con el ultimo intento del colaborador. */
export const listKnowledgeCourseOptionsController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    return res.json({ courses: await listKnowledgeCourseOptions(evaluationId) });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error listando capacitaciones del puesto para Conocimiento:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las capacitaciones del puesto.' });
  }
};

/** POST /rh/competency-evaluations/:id/knowledge-course {course_id, mode} - seccion 3 desde la capacitacion del puesto. */
/** GET /rh/competency-evaluations/:id/suggested-signers — firmantes institucionales sugeridos para el cierre. */
export const getCompetencySuggestedSignersController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const signers = await getCompetencySuggestedSigners(evaluationId);
    if (!signers) return res.status(404).json({ message: 'La evaluacion indicada no existe.' });
    return res.json({ signers });
  } catch (error) {
    console.error('Error sugiriendo firmantes del REH-REG-003:', error);
    return res.status(500).json({ message: 'No se pudieron sugerir los firmantes.' });
  }
};

/**
 * GET /rh/competency-evaluations/:id/proposed-evaluator — evaluador que el sistema propone para el
 * borrador: el coordinador del area del puesto, descartando al supervisor de la Fase 6 (solo INICIAL).
 */
export const getCompetencyProposedEvaluatorController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const evaluation = await getEvaluationById(evaluationId);
    if (!evaluation) return res.status(404).json({ message: 'La evaluacion indicada no existe.' });
    if (evaluation.evaluation_type !== 'INICIAL') {
      const signers = await getCompetencySuggestedSigners(evaluationId);
      const evaluator = signers?.area_employee_id ? { employee_id: signers.area_employee_id, name: signers.area ?? '' } : null;
      return res.json({ proposed: { evaluator, source: null, coordinator_was_supervisor: false } });
    }
    return res.json({ proposed: await proposePhase7Evaluator(evaluation.employee_id, evaluation.position_id) });
  } catch (error) {
    console.error('Error proponiendo evaluador del REH-REG-003:', error);
    return res.status(500).json({ message: 'No se pudo proponer al evaluador.' });
  }
};

/** POST /rh/competency-evaluations/:id/knowledge-phase5 — Conocimiento desde el cuestionario de la Fase 5 del puesto. */
export const assignPhase5KnowledgeController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const evaluation = await assignPhase5Knowledge(evaluationId);
    await logAudit(req.user?.id, `RH_COMP_EVAL_KNOWLEDGE_PHASE5:${evaluationId}:${evaluation.knowledge_quiz?.assignment_id ?? 0}`, evaluationId, req.ip);
    return res.status(201).json({
      message: `Seccion 3 llenada con el cuestionario de la Fase 5 del puesto (${evaluation.knowledge_quiz?.question_count ?? 0} preguntas).`,
      evaluation,
    });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error tomando el Conocimiento de la Fase 5:', error);
    return res.status(500).json({ message: 'No se pudo tomar el cuestionario de la Fase 5.' });
  }
};

export const assignCourseKnowledgeController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  const body = req.body as AssignCourseKnowledgeInput;
  try {
    const evaluation = await assignCourseKnowledge({
      evaluationId,
      courseId: body.course_id,
      mode: body.mode,
      actorUserId: req.user?.id ?? null,
    });
    await logAudit(
      req.user?.id,
      `RH_COMP_EVAL_KNOWLEDGE_COURSE:${evaluationId}:${body.course_id}:${evaluation.knowledge_quiz?.assignment_id ?? 0}:${body.mode}`,
      evaluationId,
      req.ip,
    );
    const answered = ['passed', 'failed'].includes(evaluation.knowledge_quiz?.status ?? '');
    return res.status(201).json({
      message: answered
        ? `Seccion 3 llenada con la evaluacion ya presentada de la capacitacion (${evaluation.knowledge_quiz?.question_count ?? 0} preguntas).`
        : `Evaluacion de la capacitacion asignada al colaborador (${evaluation.knowledge_quiz?.question_count ?? 0} preguntas); la seccion 3 se llenara al contestarla.`,
      evaluation,
    });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error ligando la capacitacion a Conocimiento:', error);
    return res.status(500).json({ message: 'No se pudo ligar la capacitacion a la seccion 3.' });
  }
};
