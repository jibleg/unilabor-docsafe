export type EvaluationQuestionType = 'single' | 'multiple' | 'boolean' | 'open';
export type EvaluationSelectionMode = 'all' | 'random';
export type EvaluationTemplateStatus = 'draft' | 'published';
// 'quiz': cuestionario que contesta el colaborador. 'practical': capacitacion
// presencial cuya calificacion captura RH directamente (sin cuestionario).
export type EvaluationType = 'quiz' | 'practical';

export interface TrainingCourse {
  id: number;
  code: string;
  title: string;
  description: string | null;
  certificate_validity_months: number;
  is_active: boolean;
  template_count?: number;
  published_template_count?: number;
  created_at?: string;
  updated_at?: string;
}

/** Filtro rapido del catalogo de capacitaciones (GET /rh/trainings?kind=). */
export type TrainingCourseKind = 'induction' | 'general' | 'draft';

/** Contadores por filtro del catalogo, con la busqueda aplicada. */
export interface TrainingCourseSummary {
  total: number;
  induction: number;
  general: number;
  draft: number;
}

export interface EvaluationQuestionOption {
  id?: number;
  text: string;
  is_correct: boolean;
  sort_order?: number;
}

export interface EvaluationQuestion {
  id?: number;
  template_id?: number;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  sort_order?: number;
  /** Documento del SGC del que se tomó la pregunta (evaluación guiada); null = sin pista. */
  source_document_id?: string | null;
  source_document_code?: string | null;
  source_document_title?: string | null;
  options: EvaluationQuestionOption[];
}

export interface EvaluationTemplate {
  id: number;
  training_course_id: number;
  title: string;
  instructions: string | null;
  evaluation_type: EvaluationType;
  passing_score: number;
  window_hours: number;
  attempt_time_limit_minutes: number | null;
  selection_mode: EvaluationSelectionMode;
  random_count: number | null;
  status: EvaluationTemplateStatus;
  is_active: boolean;
  requires_manual_grading: boolean;
  question_count?: number;
  questions?: EvaluationQuestion[];
  created_at?: string;
  updated_at?: string;
}

// --- Banco de preguntas generado por IA (Induccion, RH) ---
// Staging previo a EvaluationQuestion: RH aprueba/edita aqui antes de que una
// pregunta se copie al arreglo real de la plantilla (ver QuestionBankPanel).
export type QuestionBankItemStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

/** Ambito del banco de preguntas IA: fase de Induccion o puesto (REH-REG-003). */
export type QuestionBankScope = { phaseId: number; positionId?: undefined } | { positionId: number; phaseId?: undefined };

export interface QuestionBankItem {
  id: number;
  batch_id: number;
  phase_id: number | null;
  position_id: number | null;
  document_id: string | null;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  options: EvaluationQuestionOption[];
  status: QuestionBankItemStatus;
  created_at: string;
}

export interface QuestionBankCounts {
  single: number;
  multiple: number;
  boolean: number;
  open: number;
}

export interface QuestionBankBatch {
  id: number;
  phase_id: number | null;
  position_id: number | null;
  document_ids: string[];
  model: string;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  question_count: number;
  created_at: string;
}

export type EvaluationAssignmentStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'grading'
  | 'passed'
  | 'failed'
  | 'expired'
  | 'authorized_late';

export interface EvaluationTakingOption {
  id: number;
  text: string;
  sort_order: number;
}

export interface EvaluationSourceDocument {
  id: string;
  code: string | null;
  title: string;
}

export interface EvaluationTakingQuestion {
  id: number;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  sort_order: number;
  /** Pista de apoyo (evaluación guiada): documento del que se tomó la pregunta. */
  source_document: EvaluationSourceDocument | null;
  options: EvaluationTakingOption[];
}

export interface EvaluationTakingView {
  assignment: {
    id: number;
    status: EvaluationAssignmentStatus;
    deadline_at: string;
    started_at: string | null;
    template_title: string;
    course_title: string;
    instructions: string | null;
    passing_score: number;
    window_hours: number;
    attempt_time_limit_minutes: number | null;
    attempt_deadline_at: string | null;
  };
  questions: EvaluationTakingQuestion[];
}

export interface EvaluationSubmitResult {
  assignment_id: number;
  status: EvaluationAssignmentStatus;
  score: number;
  max_score: number;
  percentage: number | null;
  passing_score: number;
  passed: boolean;
  requires_manual_grading: boolean;
  certificate_document_id?: number | null;
}

export interface CourseEvaluationSummary {
  course_id: number;
  course_title: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  in_progress: number;
  grading: number;
  expired: number;
  authorized_late: number;
  compliance_pct: number;
}

export interface EvaluationDashboard {
  totals: {
    total: number;
    passed: number;
    failed: number;
    in_progress: number;
    pending: number;
    grading: number;
    expired: number;
    compliance_pct: number;
  };
  courses: CourseEvaluationSummary[];
}

export interface TraceabilityRow {
  assignment_id: number;
  employee_name: string;
  employee_code: string;
  course_title: string;
  template_title: string;
  status: EvaluationAssignmentStatus;
  percentage: number | null;
  passing_score: number;
  deadline_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  certificate_issue_date: string | null;
  certificate_expiry_date: string | null;
}

/** Colaborador con al menos una evaluacion, para el filtro de trazabilidad. */
export interface TraceabilityEmployee {
  id: number;
  full_name: string;
  employee_code: string;
  is_active: boolean;
}

export interface NotificationLogEntry {
  id: number;
  channel: 'email' | 'sms';
  recipient: string;
  subject: string | null;
  body: string | null;
  template: string;
  assignment_id: number | null;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  sent_at: string;
  employee_name: string | null;
  course_title: string | null;
}

export interface CertificateSignature {
  id?: number;
  signatory_name: string;
  role: string | null;
  signature_image_path: string | null;
  sort_order?: number;
}

export interface CertificateTemplate {
  id: number | null;
  training_course_id: number;
  title_text: string;
  body_text: string;
  logo_path: string | null;
  orientation: 'landscape' | 'portrait';
  show_folio: boolean;
  signatures: CertificateSignature[];
}

export interface OpenAnswerToGrade {
  question_id: number;
  text: string;
  points: number;
  text_answer: string | null;
  points_awarded: number;
}

export interface EvaluationGradingDetail {
  assignment: {
    id: number;
    status: EvaluationAssignmentStatus;
    employee_name: string;
    employee_code: string;
    course_title: string;
    template_title: string;
    passing_score: number;
    objective_score: number;
    max_score: number;
  };
  open_answers: OpenAnswerToGrade[];
}

export interface EvaluationResponseOption {
  id: number;
  text: string;
  is_correct: boolean;
  selected: boolean;
}

export interface EvaluationQuestionResponse {
  question_id: number;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  points_awarded: number;
  is_correct: boolean;
  answered: boolean;
  text_answer: string | null;
  options: EvaluationResponseOption[];
}

export interface EvaluationResponsesDetail {
  assignment: {
    id: number;
    employee_name: string;
    employee_code: string;
    course_title: string;
    template_title: string;
    status: EvaluationAssignmentStatus;
    score: number | null;
    max_score: number | null;
    percentage: number | null;
    passing_score: number;
    submitted_at: string | null;
    graded_at: string | null;
  };
  questions: EvaluationQuestionResponse[];
}

export interface EvaluationAssignment {
  id: number;
  template_id: number;
  employee_id: number;
  status: EvaluationAssignmentStatus;
  available_at: string;
  deadline_at: string;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  attempt_no: number;
  template_title?: string;
  course_id?: number;
  course_title?: string;
  passing_score?: number;
  window_hours?: number;
  question_count?: number;
  employee_name?: string;
  employee_code?: string;
  certificate_document_id?: number | null;
  late_requested_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// --- RH: acuse de lectura y firma autografa (RH-ACK) -------------------------
