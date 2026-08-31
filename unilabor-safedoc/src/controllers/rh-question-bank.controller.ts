import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  deleteQuestionBankItem,
  generateQuestions,
  listQuestionBankBatches,
  listQuestionBankItems,
  reviewQuestionBankItem,
  type QuestionCounts,
} from '../services/rh-question-bank.service';

/**
 * Endpoints del banco de preguntas generado por IA (Induccion, RH). Montados
 * en rh-induction.routes.ts bajo /induction/phases/:phaseId/question-bank,
 * protegidos con el mismo permiso RH.INDUCTION.MANAGE de las demas rutas de
 * fases de induccion.
 */

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  QUESTION_BANK_NOT_CONFIGURED: 409,
  QUESTION_BANK_PHASE_NOT_FOUND: 404,
  QUESTION_BANK_DOCUMENTS_NOT_FOUND: 400,
  QUESTION_BANK_FILE_MISSING: 409,
  QUESTION_BANK_TEXT_EMPTY: 409,
  QUESTION_BANK_INVALID_RESPONSE: 502,
  QUESTION_BANK_NO_VALID_QUESTIONS: 502,
};

const mapError = (res: Response, error: any): Response | null => {
  const status = ERROR_STATUS[error?.code];
  if (!status) {
    return null;
  }
  return res.status(status).json({ message: error?.publicMessage || 'No se pudo completar la operacion.' });
};

const logBankAudit = async (userId: string | undefined, action: string, phaseId: number, ipAddress: string | undefined) => {
  if (!userId) {
    return;
  }
  await registerAuditEvent({
    user_id: userId,
    action,
    ip_address: ipAddress ?? null,
    module_code: 'RH',
    entity_type: 'question_bank',
    entity_id: phaseId,
  });
};

export const generateQuestionBankController = async (req: AuthRequest, res: Response) => {
  const phaseId = parseId(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  try {
    const { document_ids: documentIds, counts } = req.body as {
      document_ids: string[];
      counts: QuestionCounts;
    };
    const result = await generateQuestions({
      phaseId,
      documentIds,
      counts,
      requestedByUserId: req.user?.id ?? null,
    });
    await logBankAudit(req.user?.id, `RH_QUESTION_BANK_GENERATE:${phaseId}:${result.batchId}`, phaseId, req.ip);
    return res.status(201).json({
      message: `Se generaron ${result.questionCount} preguntas candidatas.`,
      batch_id: result.batchId,
      question_count: result.questionCount,
    });
  } catch (error: any) {
    const mapped = mapError(res, error);
    if (mapped) return mapped;
    console.error('Error generando banco de preguntas IA:', error);
    return res.status(500).json({ message: 'No se pudo generar el banco de preguntas.' });
  }
};

export const listQuestionBankItemsController = async (req: AuthRequest, res: Response) => {
  const phaseId = parseId(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const items = await listQuestionBankItems(phaseId, status);
    return res.json({ items });
  } catch (error) {
    console.error('Error listando banco de preguntas IA:', error);
    return res.status(500).json({ message: 'No se pudo cargar el banco de preguntas.' });
  }
};

export const reviewQuestionBankItemController = async (req: AuthRequest, res: Response) => {
  const itemId = parseId(req.params.itemId);
  if (!itemId) {
    return res.status(400).json({ message: 'ID de pregunta invalido.' });
  }
  try {
    const item = await reviewQuestionBankItem(itemId, req.body, req.user?.id ?? null);
    if (!item) {
      return res.status(404).json({ message: 'La pregunta indicada no existe.' });
    }
    await logBankAudit(req.user?.id, `RH_QUESTION_BANK_REVIEW:${itemId}:${item.status}`, item.phase_id, req.ip);
    return res.json({ item });
  } catch (error) {
    console.error('Error actualizando pregunta del banco IA:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la pregunta.' });
  }
};

export const deleteQuestionBankItemController = async (req: AuthRequest, res: Response) => {
  const itemId = parseId(req.params.itemId);
  if (!itemId) {
    return res.status(400).json({ message: 'ID de pregunta invalido.' });
  }
  try {
    const deleted = await deleteQuestionBankItem(itemId);
    if (!deleted) {
      return res.status(404).json({ message: 'La pregunta indicada no existe.' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error eliminando pregunta del banco IA:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la pregunta.' });
  }
};

export const listQuestionBankBatchesController = async (req: AuthRequest, res: Response) => {
  const phaseId = parseId(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  try {
    const batches = await listQuestionBankBatches(phaseId);
    return res.json({ batches });
  } catch (error) {
    console.error('Error listando corridas del banco de preguntas IA:', error);
    return res.status(500).json({ message: 'No se pudo cargar el historial de generaciones.' });
  }
};
