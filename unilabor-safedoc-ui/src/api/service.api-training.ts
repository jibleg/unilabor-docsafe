import api from './axios';
import {
  asRecord,
  buildPageParams,
  extractPagination,
  getArrayFromPayload,
  getBoolean,
  getNumber,
  getString,
  unwrapPayload,
  type PageQuery,
  type PageResult,
} from './service.shared';
import type {
  EvaluationQuestion,
  EvaluationQuestionOption,
  EvaluationQuestionType,
  EvaluationSelectionMode,
  EvaluationTemplate,
  EvaluationTemplateStatus,
  TrainingCourse,
} from '../types/models';

/**
 * Capa de API del modulo de Evaluaciones de capacitacion (ISO 15189).
 * Cubre capacitaciones, plantillas de evaluacion y banco de preguntas.
 */

export interface TrainingCoursePayload {
  code?: string | null;
  title: string;
  description?: string | null;
  certificate_validity_months?: number;
  is_active?: boolean;
}

export interface EvaluationTemplatePayload {
  title: string;
  instructions?: string | null;
  passing_score?: number;
  window_hours?: number;
  selection_mode?: EvaluationSelectionMode;
  random_count?: number | null;
  status?: EvaluationTemplateStatus;
  is_active?: boolean;
}

export interface TemplateDetail {
  course: TrainingCourse;
  templates: EvaluationTemplate[];
}

// --- Normalizadores ---

const normalizeCourse = (input: unknown): TrainingCourse | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const id = getNumber(source, ['id']);
  const title = getString(source, ['title']);
  if (!id || !title) {
    return null;
  }
  return {
    id,
    code: getString(source, ['code']),
    title,
    description: getString(source, ['description']) || null,
    certificate_validity_months: getNumber(source, ['certificate_validity_months']) ?? 12,
    is_active: getBoolean(source, ['is_active'], true),
    template_count: getNumber(source, ['template_count']) ?? 0,
    created_at: getString(source, ['created_at']),
    updated_at: getString(source, ['updated_at']),
  };
};

const normalizeOption = (input: unknown): EvaluationQuestionOption | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const text = getString(source, ['text']);
  if (!text) {
    return null;
  }
  return {
    id: getNumber(source, ['id']) ?? undefined,
    text,
    is_correct: getBoolean(source, ['is_correct'], false),
    sort_order: getNumber(source, ['sort_order']) ?? undefined,
  };
};

const normalizeQuestion = (input: unknown): EvaluationQuestion | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const text = getString(source, ['text']);
  const type = getString(source, ['type']) as EvaluationQuestionType;
  if (!text || !type) {
    return null;
  }
  const options = Array.isArray(source.options)
    ? source.options.map(normalizeOption).filter((option): option is EvaluationQuestionOption => option !== null)
    : [];
  return {
    id: getNumber(source, ['id']) ?? undefined,
    template_id: getNumber(source, ['template_id']) ?? undefined,
    type,
    text,
    points: getNumber(source, ['points']) ?? 1,
    sort_order: getNumber(source, ['sort_order']) ?? undefined,
    options,
  };
};

const normalizeTemplate = (input: unknown): EvaluationTemplate | null => {
  const source = asRecord(input);
  if (!source) {
    return null;
  }
  const id = getNumber(source, ['id']);
  const title = getString(source, ['title']);
  if (!id || !title) {
    return null;
  }
  const questions = Array.isArray(source.questions)
    ? source.questions.map(normalizeQuestion).filter((question): question is EvaluationQuestion => question !== null)
    : undefined;
  return {
    id,
    training_course_id: getNumber(source, ['training_course_id']) ?? 0,
    title,
    instructions: getString(source, ['instructions']) || null,
    passing_score: getNumber(source, ['passing_score']) ?? 80,
    window_hours: getNumber(source, ['window_hours']) ?? 72,
    selection_mode: (getString(source, ['selection_mode']) as EvaluationSelectionMode) || 'all',
    random_count: getNumber(source, ['random_count']) ?? null,
    status: (getString(source, ['status']) as EvaluationTemplateStatus) || 'draft',
    is_active: getBoolean(source, ['is_active'], true),
    requires_manual_grading: getBoolean(source, ['requires_manual_grading'], false),
    question_count: getNumber(source, ['question_count']) ?? undefined,
    questions,
    created_at: getString(source, ['created_at']),
    updated_at: getString(source, ['updated_at']),
  };
};

// --- Capacitaciones ---

export const listTrainingCoursesPaginated = async (
  query: PageQuery = {},
): Promise<PageResult<TrainingCourse>> => {
  const response = await api.get('/rh/trainings', { params: buildPageParams(query) });
  const data = getArrayFromPayload(response.data, ['data', 'courses', 'items'])
    .map(normalizeCourse)
    .filter((course): course is TrainingCourse => course !== null);
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const getTrainingCourse = async (courseId: number): Promise<TemplateDetail | null> => {
  const response = await api.get(`/rh/trainings/${courseId}`);
  const payload = asRecord(unwrapPayload(response.data));
  const course = normalizeCourse(payload?.course);
  if (!course) {
    return null;
  }
  const templates = Array.isArray(payload?.templates)
    ? payload.templates.map(normalizeTemplate).filter((template): template is EvaluationTemplate => template !== null)
    : [];
  return { course, templates };
};

export const createTrainingCourse = async (payload: TrainingCoursePayload): Promise<TrainingCourse | null> => {
  const response = await api.post('/rh/trainings', payload);
  return normalizeCourse(asRecord(unwrapPayload(response.data))?.course);
};

export const updateTrainingCourse = async (
  courseId: number,
  payload: Partial<TrainingCoursePayload>,
): Promise<TrainingCourse | null> => {
  const response = await api.patch(`/rh/trainings/${courseId}`, payload);
  return normalizeCourse(asRecord(unwrapPayload(response.data))?.course);
};

export const deleteTrainingCourse = async (courseId: number): Promise<void> => {
  await api.delete(`/rh/trainings/${courseId}`);
};

// --- Plantillas de evaluacion ---

export const getEvaluationTemplate = async (templateId: number): Promise<EvaluationTemplate | null> => {
  const response = await api.get(`/rh/trainings/templates/${templateId}`);
  return normalizeTemplate(asRecord(unwrapPayload(response.data))?.template);
};

export const createEvaluationTemplate = async (
  courseId: number,
  payload: EvaluationTemplatePayload,
): Promise<EvaluationTemplate | null> => {
  const response = await api.post(`/rh/trainings/${courseId}/templates`, payload);
  return normalizeTemplate(asRecord(unwrapPayload(response.data))?.template);
};

export const updateEvaluationTemplate = async (
  templateId: number,
  payload: Partial<EvaluationTemplatePayload>,
): Promise<EvaluationTemplate | null> => {
  const response = await api.patch(`/rh/trainings/templates/${templateId}`, payload);
  return normalizeTemplate(asRecord(unwrapPayload(response.data))?.template);
};

export const deleteEvaluationTemplate = async (templateId: number): Promise<void> => {
  await api.delete(`/rh/trainings/templates/${templateId}`);
};

export const replaceTemplateQuestions = async (
  templateId: number,
  questions: EvaluationQuestion[],
): Promise<EvaluationTemplate | null> => {
  const response = await api.put(`/rh/trainings/templates/${templateId}/questions`, { questions });
  return normalizeTemplate(asRecord(unwrapPayload(response.data))?.template);
};
