import api from './axios';
import {
  asRecord,
  buildPageParams,
  extractPagination,
  getArrayFromPayload,
  unwrapPayload,
  type PageQuery,
  type PageResult,
} from './service.shared';
import type {
  RhCompetencyCriticality,
  RhCompetencyEvaluation,
  RhCompetencyEvaluationType,
  RhCompetencySection,
  KnowledgeCourseOption,
} from '../types/models';

/** API del modulo Evaluacion de competencia (REH-REG-003). */

export interface CreateCompetencyEvaluationPayload {
  employee_id: number;
  position_id: number;
  evaluation_type: RhCompetencyEvaluationType;
  evaluation_date: string;
  evaluator_name: string;
  reference_course_id?: number | null;
  reference_course_date?: string | null;
}

export const createCompetencyEvaluation = async (
  payload: CreateCompetencyEvaluationPayload,
): Promise<RhCompetencyEvaluation> => {
  const response = await api.post('/rh/competency-evaluations', payload);
  const data = asRecord(unwrapPayload(response.data));
  return data?.evaluation as RhCompetencyEvaluation;
};

export interface CompetencyEvaluationListQuery extends PageQuery {
  status?: string;
}

export const listCompetencyEvaluations = async (
  query: CompetencyEvaluationListQuery = {},
): Promise<PageResult<RhCompetencyEvaluation>> => {
  const params: Record<string, string | number> = buildPageParams(query);
  if (query.status) {
    params.status = query.status;
  }
  const response = await api.get('/rh/competency-evaluations', { params });
  const data = getArrayFromPayload(response.data, ['data']) as RhCompetencyEvaluation[];
  return { data, pagination: extractPagination(response.data, data.length) };
};

export const getCompetencyEvaluation = async (id: number): Promise<RhCompetencyEvaluation | null> => {
  const response = await api.get(`/rh/competency-evaluations/${id}`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.evaluation as RhCompetencyEvaluation) ?? null;
};

export interface UpdateCompetencyEvaluationPayload {
  evaluation_type?: RhCompetencyEvaluationType;
  evaluation_date?: string;
  evaluator_name?: string;
  reference_course_id?: number | null;
  reference_course_date?: string | null;
}

export const updateCompetencyEvaluation = async (
  id: number,
  payload: UpdateCompetencyEvaluationPayload,
): Promise<RhCompetencyEvaluation> => {
  const response = await api.patch(`/rh/competency-evaluations/${id}`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return data?.evaluation as RhCompetencyEvaluation;
};

export interface CompetencySectionItemPayload {
  item_text: string;
  criticality: RhCompetencyCriticality;
  method?: string | null;
  score?: number | null;
  expected_answer?: string | null;
  given_answer?: string | null;
  is_correct?: boolean | null;
  observations?: string | null;
}

export const replaceCompetencySectionItems = async (
  id: number,
  section: RhCompetencySection,
  items: CompetencySectionItemPayload[],
): Promise<RhCompetencyEvaluation> => {
  const response = await api.put(`/rh/competency-evaluations/${id}/items`, { section, items });
  const data = asRecord(unwrapPayload(response.data));
  return data?.evaluation as RhCompetencyEvaluation;
};

export interface CompetencyActionPayload {
  improvement_area: string;
  required_action: string;
  responsible?: string | null;
  due_date?: string | null;
  follow_up?: string | null;
}

export const replaceCompetencyActions = async (
  id: number,
  actions: CompetencyActionPayload[],
): Promise<RhCompetencyEvaluation> => {
  const response = await api.put(`/rh/competency-evaluations/${id}/actions`, { actions });
  const data = asRecord(unwrapPayload(response.data));
  return data?.evaluation as RhCompetencyEvaluation;
};

export interface CloseCompetencyEvaluationPayload {
  collaborator_signature: string;
  evaluator_signature: string;
  area_signature: string;
  rh_signature: string;
  director_signature: string;
  area_signatory_name: string;
  rh_signatory_name: string;
  director_signatory_name: string;
}

export type CompetencyAuthorizationDecision = 'AUTORIZADO' | 'AUTORIZADO_CON_SEGUIMIENTO' | 'NO_AUTORIZADO';

/** Autorización del REH-REG-003 (RH o Dirección General; permiso RH.COMPETENCY.AUTHORIZE). */
export const authorizeCompetencyEvaluation = async (
  id: number,
  payload: { decision: CompetencyAuthorizationDecision; note?: string | null },
): Promise<{ message: string; evaluation: RhCompetencyEvaluation }> => {
  const response = await api.post(`/rh/competency-evaluations/${id}/authorize`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return { message: String(data?.message ?? 'Autorización registrada.'), evaluation: data?.evaluation as RhCompetencyEvaluation };
};

export const closeCompetencyEvaluation = async (
  id: number,
  payload: CloseCompetencyEvaluationPayload,
): Promise<RhCompetencyEvaluation> => {
  const response = await api.post(`/rh/competency-evaluations/${id}/close`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return data?.evaluation as RhCompetencyEvaluation;
};

export const deleteCompetencyEvaluationDraft = async (id: number): Promise<void> => {
  await api.delete(`/rh/competency-evaluations/${id}`);
};

export interface AssignKnowledgeQuizPayload {
  mode: 'random' | 'fixed';
  count?: number;
  item_ids?: number[];
  window_hours: number;
  attempt_time_limit_minutes?: number | null;
}

/** Asigna al colaborador el cuestionario de Conocimiento (seccion 3) desde el banco del puesto. */
export const assignKnowledgeQuiz = async (
  id: number,
  payload: AssignKnowledgeQuizPayload,
): Promise<RhCompetencyEvaluation> => {
  const response = await api.post(`/rh/competency-evaluations/${id}/knowledge-quiz`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return data?.evaluation as RhCompetencyEvaluation;
};

/** Cancela un cuestionario de Conocimiento que el colaborador nunca inicio. */
export const cancelKnowledgeQuiz = async (id: number): Promise<RhCompetencyEvaluation> => {
  const response = await api.delete(`/rh/competency-evaluations/${id}/knowledge-quiz`);
  const data = asRecord(unwrapPayload(response.data));
  return data?.evaluation as RhCompetencyEvaluation;
};

/** Emite (o reemite con force) la constancia de competencia de una evaluación cerrada y la archiva en el expediente. */
export const issueCompetencyCertificate = async (id: number, force = false): Promise<RhCompetencyEvaluation> => {
  const response = await api.post(`/rh/competency-evaluations/${id}/certificate`, { force });
  const data = asRecord(unwrapPayload(response.data));
  return data?.evaluation as RhCompetencyEvaluation;
};

/** Capacitaciones ligadas al puesto evaluado, con el último intento del colaborador en cada una. */
export const listKnowledgeCourseOptions = async (id: number): Promise<KnowledgeCourseOption[]> => {
  const response = await api.get(`/rh/competency-evaluations/${id}/knowledge-courses`);
  return (asRecord(unwrapPayload(response.data))?.courses as KnowledgeCourseOption[]) ?? [];
};

/** Sección 3 desde la capacitación del puesto: 'new' asigna su cuestionario, 'existing' usa el último intento. */
export const assignCourseKnowledge = async (
  id: number,
  courseId: number,
  mode: 'new' | 'existing',
): Promise<{ evaluation: RhCompetencyEvaluation; message: string }> => {
  const response = await api.post(`/rh/competency-evaluations/${id}/knowledge-course`, { course_id: courseId, mode });
  const data = asRecord(unwrapPayload(response.data));
  return { evaluation: data?.evaluation as RhCompetencyEvaluation, message: String(data?.message ?? '') };
};
