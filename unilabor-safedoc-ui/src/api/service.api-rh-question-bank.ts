import api from './axios';
import { asRecord, getArrayFromPayload, getNumber, getString, unwrapPayload } from './service.shared';
import type {
  EvaluationQuestionOption,
  EvaluationQuestionType,
  QuestionBankBatch,
  QuestionBankCounts,
  QuestionBankItem,
  QuestionBankItemStatus,
} from '../types/models';

/**
 * Banco de preguntas generado por IA (Induccion, RH). Staging previo al
 * banco real de la evaluacion: ver QuestionBankPanel.tsx.
 */

const normalizeOption = (input: unknown): EvaluationQuestionOption => {
  const source = asRecord(input) ?? {};
  return {
    text: getString(source, ['text']),
    is_correct: Boolean(source.is_correct),
  };
};

const normalizeItem = (input: unknown): QuestionBankItem | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const id = getNumber(source, ['id']);
  if (!id) {
    return null;
  }
  const optionsRaw = Array.isArray(source.options) ? source.options : [];
  return {
    id,
    batch_id: getNumber(source, ['batch_id']),
    phase_id: getNumber(source, ['phase_id']),
    document_id: getString(source, ['document_id']) || null,
    type: (getString(source, ['type']) as EvaluationQuestionType) || 'single',
    text: getString(source, ['text']),
    points: getNumber(source, ['points'], 1),
    options: optionsRaw.map(normalizeOption),
    status: (getString(source, ['status']) as QuestionBankItemStatus) || 'PENDING_REVIEW',
    created_at: getString(source, ['created_at']),
  };
};

const normalizeBatch = (input: unknown): QuestionBankBatch | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const id = getNumber(source, ['id']);
  if (!id) {
    return null;
  }
  return {
    id,
    phase_id: getNumber(source, ['phase_id']),
    document_ids: Array.isArray(source.document_ids) ? source.document_ids.map(String) : [],
    model: getString(source, ['model']),
    status: (getString(source, ['status']) as QuestionBankBatch['status']) || 'running',
    error_message: getString(source, ['error_message']) || null,
    question_count: getNumber(source, ['question_count']),
    created_at: getString(source, ['created_at']),
  };
};

export const listQuestionBankItems = async (
  phaseId: number,
  status?: QuestionBankItemStatus,
): Promise<QuestionBankItem[]> => {
  const response = await api.get(`/rh/induction/phases/${phaseId}/question-bank`, {
    params: status ? { status } : undefined,
  });
  return getArrayFromPayload(response.data, ['items'])
    .map(normalizeItem)
    .filter((item): item is QuestionBankItem => item !== null);
};

export interface GenerateQuestionBankResult {
  batch_id: number;
  question_count: number;
}

export const generateQuestionBank = async (
  phaseId: number,
  documentIds: string[],
  counts: QuestionBankCounts,
): Promise<GenerateQuestionBankResult> => {
  const response = await api.post(`/rh/induction/phases/${phaseId}/question-bank/generate`, {
    document_ids: documentIds,
    counts,
  });
  const payload = asRecord(unwrapPayload(response.data)) ?? {};
  return {
    batch_id: getNumber(payload, ['batch_id']),
    question_count: getNumber(payload, ['question_count']),
  };
};

export interface ReviewQuestionBankItemPayload {
  status?: 'APPROVED' | 'REJECTED';
  text?: string;
  points?: number;
  options?: EvaluationQuestionOption[];
}

export const reviewQuestionBankItem = async (
  itemId: number,
  payload: ReviewQuestionBankItemPayload,
): Promise<QuestionBankItem | null> => {
  const response = await api.patch(`/rh/induction/question-bank/${itemId}`, payload);
  return normalizeItem(asRecord(unwrapPayload(response.data))?.item);
};

export const deleteQuestionBankItem = async (itemId: number): Promise<void> => {
  await api.delete(`/rh/induction/question-bank/${itemId}`);
};

export const listQuestionBankBatches = async (phaseId: number): Promise<QuestionBankBatch[]> => {
  const response = await api.get(`/rh/induction/phases/${phaseId}/question-bank/batches`);
  return getArrayFromPayload(response.data, ['batches'])
    .map(normalizeBatch)
    .filter((batch): batch is QuestionBankBatch => batch !== null);
};
