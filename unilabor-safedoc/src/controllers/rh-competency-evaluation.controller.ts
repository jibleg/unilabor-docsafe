import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  closeEvaluation,
  createEvaluation,
  deleteDraftEvaluation,
  getEvaluationById,
  listEvaluations,
  replaceActions,
  replaceSectionItems,
  updateEvaluation,
} from '../services/rh-competency-evaluation.service';
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
    const evaluation = await createEvaluation({
      employeeId: Number(req.body.employee_id),
      positionId: Number(req.body.position_id),
      evaluationType: req.body.evaluation_type,
      evaluationDate: req.body.evaluation_date,
      evaluatorName: req.body.evaluator_name,
      referenceCourseId: req.body.reference_course_id ?? null,
      referenceCourseDate: req.body.reference_course_date ?? null,
      createdByUserId: req.user?.id ?? null,
    });
    await logAudit(req.user?.id, `RH_COMP_EVAL_CREATE:${evaluation.id}`, evaluation.id, req.ip);
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
      evaluatorName: req.body.evaluator_name,
      referenceCourseId: req.body.reference_course_id,
      referenceCourseDate: req.body.reference_course_date,
    });
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

export const closeCompetencyEvaluationController = async (req: AuthRequest, res: Response) => {
  const evaluationId = parseId(req.params.id);
  if (!evaluationId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const evaluation = await closeEvaluation({
      evaluationId,
      collaboratorSignature: req.body.collaborator_signature,
      evaluatorSignature: req.body.evaluator_signature,
      areaSignature: req.body.area_signature,
      rhSignature: req.body.rh_signature,
      directorSignature: req.body.director_signature,
      areaSignatoryName: req.body.area_signatory_name,
      rhSignatoryName: req.body.rh_signatory_name,
      directorSignatoryName: req.body.director_signatory_name,
      closedByUserId: req.user?.id ?? null,
    });
    await logAudit(req.user?.id, `RH_COMP_EVAL_CLOSE:${evaluationId}:${evaluation.results.dictamen}`, evaluationId, req.ip);
    // Constancia de competencia (dictamen competente): best-effort, nunca deshace el cierre.
    const certificateDocumentId = await tryIssueCompetencyCertificate(evaluationId, req.user?.id ?? null);
    if (certificateDocumentId) {
      await logAudit(req.user?.id, `RH_COMP_EVAL_CERTIFICATE_ISSUED:${evaluationId}:${certificateDocumentId}`, evaluationId, req.ip);
    }
    const finalEvaluation = certificateDocumentId ? (await getEvaluationById(evaluationId)) ?? evaluation : evaluation;
    return res.json({
      message: certificateDocumentId
        ? 'Evaluacion cerrada; registro y constancia de competencia archivados en el expediente.'
        : 'Evaluacion cerrada y archivada en el expediente.',
      evaluation: finalEvaluation,
    });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error cerrando evaluacion de competencia:', error);
    return res.status(500).json({ message: 'No se pudo cerrar la evaluacion.' });
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
