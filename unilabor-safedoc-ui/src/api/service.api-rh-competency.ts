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
