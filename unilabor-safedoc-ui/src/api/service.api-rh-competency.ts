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
  DocumentSignerStatus,
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
  /** Evaluador elegido de la lista de colaboradores (el servidor toma su nombre de la ficha). */
  evaluator_employee_id: number;
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
  evaluator_employee_id?: number;
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

/** Firmantes institucionales del REH-REG-003 (colaboradores que firmarán en su Buzón). */
export interface SendCompetencyToSignaturePayload {
  area_employee_id: number;
  rh_employee_id: number;
  director_employee_id: number;
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

/** Bloquea la evaluación y la manda al Buzón de firmas de sus cinco firmantes. */
export const sendCompetencyToSignature = async (
  id: number,
  payload: SendCompetencyToSignaturePayload,
): Promise<{ message: string; evaluation: RhCompetencyEvaluation }> => {
  const response = await api.post(`/rh/competency-evaluations/${id}/send-to-signature`, payload);
  const data = asRecord(unwrapPayload(response.data));
  return { message: String(data?.message ?? 'Enviada a firma.'), evaluation: data?.evaluation as RhCompetencyEvaluation };
};

/** Regresa la evaluación a borrador editable; las firmas recabadas se invalidan (no se borran). */
export const cancelCompetencySignature = async (id: number): Promise<{ message: string; evaluation: RhCompetencyEvaluation }> => {
  const response = await api.delete(`/rh/competency-evaluations/${id}/signature-request`);
  const data = asRecord(unwrapPayload(response.data));
  return { message: String(data?.message ?? 'Envío cancelado.'), evaluation: data?.evaluation as RhCompetencyEvaluation };
};

export const getCompetencySigners = async (id: number): Promise<DocumentSignerStatus[]> => {
  const response = await api.get(`/rh/competency-evaluations/${id}/signers`);
  return (asRecord(unwrapPayload(response.data))?.signers as DocumentSignerStatus[]) ?? [];
};

/** PDF del REH-REG-003 en firma (vista previa con las firmas ya recabadas) como URL de blob. */
export const getCompetencyPdfUrl = async (id: number): Promise<string> => {
  const response = await api.get(`/rh/competency-evaluations/${id}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(response.data as Blob);
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

export interface CompetencySuggestedSigners {
  area: string | null;
  area_employee_id: number | null;
  rh: string | null;
  rh_employee_id: number | null;
  director: string | null;
  director_employee_id: number | null;
}

/** Firmantes institucionales sugeridos (responsable del área del puesto, titular de CRH y de DG). */
export const getCompetencySuggestedSigners = async (id: number): Promise<CompetencySuggestedSigners> => {
  const response = await api.get(`/rh/competency-evaluations/${id}/suggested-signers`);
  const data = asRecord(unwrapPayload(response.data));
  return (
    (data?.signers as CompetencySuggestedSigners) ?? {
      area: null,
      area_employee_id: null,
      rh: null,
      rh_employee_id: null,
      director: null,
      director_employee_id: null,
    }
  );
};

export interface CompetencyProposedEvaluator {
  /** null = no hay coordinador del área disponible (o fue el supervisor de la Fase 6 y no hay relevo). */
  evaluator: { employee_id: number | null; name: string } | null;
  coordinator_was_supervisor: boolean;
}

/** Evaluador que el sistema propone para el borrador: el coordinador del área, nunca el supervisor de la Fase 6. */
export const getCompetencyProposedEvaluator = async (id: number): Promise<CompetencyProposedEvaluator> => {
  const response = await api.get(`/rh/competency-evaluations/${id}/proposed-evaluator`);
  const data = asRecord(unwrapPayload(response.data));
  return (data?.proposed as CompetencyProposedEvaluator) ?? { evaluator: null, coordinator_was_supervisor: false };
};

/** Sección 3 desde el cuestionario de la Fase 5 que el colaborador ya acreditó en el puesto (Fase 7). */
export const assignPhase5Knowledge = async (id: number): Promise<{ evaluation: RhCompetencyEvaluation; message: string }> => {
  const response = await api.post(`/rh/competency-evaluations/${id}/knowledge-phase5`);
  const data = asRecord(unwrapPayload(response.data));
  return { evaluation: data?.evaluation as RhCompetencyEvaluation, message: String(data?.message ?? '') };
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
