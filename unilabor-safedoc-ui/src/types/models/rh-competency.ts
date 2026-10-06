import type { RhCompetencyCriticality } from './rh-induction';

export type RhCompetencySection = 'COMPETENCIA' | 'DESEMPENO' | 'CONOCIMIENTO';
export type RhCompetencyEvaluationType = 'INICIAL' | 'PERIODICA' | 'REEVALUACION' | 'CAMBIO_PUESTO' | 'POST_CAPACITACION';
export type RhCompetencyDictamen =
  | 'COMPETENTE_Y_AUTORIZADO'
  | 'COMPETENTE_CON_OBSERVACIONES'
  | 'COMPETENTE_BAJO_SUPERVISION'
  | 'NO_COMPETENTE';

export interface RhCompetencyEvaluationItem {
  id?: number;
  section: RhCompetencySection;
  /** Pregunta real del cuestionario de Conocimiento (solo cuando la seccion 3 viene del cuestionario). */
  question_id?: number | null;
  item_text: string;
  criticality: RhCompetencyCriticality;
  method: string | null;
  score: number | null;
  expected_answer: string | null;
  given_answer: string | null;
  is_correct: boolean | null;
  observations: string | null;
  sort_order: number;
}

export interface RhCompetencyEvaluationAction {
  id?: number;
  improvement_area: string;
  required_action: string;
  responsible: string | null;
  due_date: string | null;
  follow_up: string | null;
  sort_order: number;
}

export interface RhCompetencyEvaluationResults {
  competency_pct: number | null;
  performance_pct: number | null;
  knowledge_pct: number | null;
  final_pct: number | null;
  veto_applied: boolean;
  dictamen: RhCompetencyDictamen | null;
  authorization_result: string | null;
}

/** Cuestionario de Conocimiento (seccion 3) asignado al colaborador en el sistema. */
export interface RhCompetencyKnowledgeQuiz {
  assignment_id: number;
  status: string;
  /** 'course' = evaluación de una capacitación del puesto; 'random'/'fixed' = banco IA del puesto. */
  selection_mode: 'random' | 'fixed' | 'course' | null;
  question_count: number;
  deadline_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  percentage: number | null;
  synced_at: string | null;
}

export interface RhCompetencyEvaluation {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  position_id: number;
  position_name: string;
  evaluation_type: RhCompetencyEvaluationType;
  evaluation_date: string;
  evaluator_name: string;
  reference_course_id: number | null;
  reference_course_title: string | null;
  reference_course_date: string | null;
  status: 'DRAFT' | 'CLOSED';
  results: RhCompetencyEvaluationResults;
  authorized_at: string | null;
  valid_until: string | null;
  /** Quién ejecutó la autorización (RH o Dirección General) y su nota. */
  authorized_by_name?: string | null;
  authorization_note?: string | null;
  area_signatory_name: string | null;
  rh_signatory_name: string | null;
  director_signatory_name: string | null;
  document_id: number | null;
  /** Constancia de competencia archivada en el expediente (null si no se emitió). */
  certificate_document_id?: number | null;
  closed_at: string | null;
  created_at: string;
  knowledge_quiz?: RhCompetencyKnowledgeQuiz | null;
  items?: RhCompetencyEvaluationItem[];
  actions?: RhCompetencyEvaluationAction[];
}

// --- Capacitaciones del puesto (Fase 7) como fuente de la sección 3 del REH-REG-003 ---
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
  last_attempt: CourseAttemptSummary | null;
}
