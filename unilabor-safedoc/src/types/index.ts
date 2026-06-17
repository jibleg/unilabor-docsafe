// src/types/index.ts
import { Request } from 'express';

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type ModuleCode = 'QUALITY' | 'RH' | 'HELPDESK';

export interface ModuleAccess {
  code: ModuleCode;
  name: string;
  description?: string | null;
  icon?: string | null;
  role: UserRole;
  is_active: boolean;
  sort_order?: number;
}

export interface LinkableUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  modules: ModuleAccess[];
}

export interface EmployeeRecord {
  id: number;
  employee_code: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  area: string | null;
  position: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  linked_user?: LinkableUser | null;
}

// --- Modulo de Evaluaciones de capacitacion y constancias (ISO 15189) ---

export type EvaluationQuestionType = 'single' | 'multiple' | 'boolean' | 'open';
export type EvaluationSelectionMode = 'all' | 'random';
export type EvaluationTemplateStatus = 'draft' | 'published';

export interface TrainingCourseRecord {
  id: number;
  code: string;
  title: string;
  description: string | null;
  certificate_validity_months: number;
  is_active: boolean;
  template_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface EvaluationQuestionOptionRecord {
  id: number;
  question_id: number;
  text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface EvaluationQuestionRecord {
  id: number;
  template_id: number;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  sort_order: number;
  options: EvaluationQuestionOptionRecord[];
}

export interface EvaluationTemplateRecord {
  id: number;
  training_course_id: number;
  title: string;
  instructions: string | null;
  passing_score: number;
  window_hours: number;
  selection_mode: EvaluationSelectionMode;
  random_count: number | null;
  status: EvaluationTemplateStatus;
  is_active: boolean;
  requires_manual_grading: boolean;
  question_count?: number;
  questions?: EvaluationQuestionRecord[];
  created_at?: string;
  updated_at?: string;
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

export interface EvaluationAssignmentRecord {
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
  // Datos unidos (lectura)
  template_title?: string;
  course_id?: number;
  course_title?: string;
  passing_score?: number;
  window_hours?: number;
  question_count?: number;
  employee_name?: string;
  employee_code?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AssignmentResultSummary {
  created: number;
  skipped: number;
}

// Vista del colaborador para responder (sin exponer cual opcion es correcta).
export interface EvaluationTakingOption {
  id: number;
  text: string;
  sort_order: number;
}

export interface EvaluationTakingQuestion {
  id: number;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  sort_order: number;
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

export interface OpenAnswerGradeInput {
  question_id: number;
  points_awarded: number;
}

export interface CertificateSignatureRecord {
  id?: number;
  signatory_name: string;
  role: string | null;
  signature_image_path: string | null;
  sort_order: number;
}

export interface CertificateTemplateRecord {
  id: number | null;
  training_course_id: number;
  title_text: string;
  body_text: string;
  logo_path: string | null;
  orientation: 'landscape' | 'portrait';
  signatures: CertificateSignatureRecord[];
}

export interface EmployeeSummary {
  total: number;
  active: number;
  linked_users: number;
  unlinked_users: number;
}

export interface DocumentSectionRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system_defined: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentTypeRecord {
  id: number;
  section_id: number;
  code: string | null;
  name: string;
  description: string | null;
  is_required: boolean;
  is_sensitive: boolean;
  has_expiry: boolean;
  is_system_defined: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  section?: DocumentSectionRecord | null;
}

export interface EmployeeDocumentRecord {
  id: number;
  employee_id: number;
  document_type_id: number;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_user_id: string;
  issue_date: string | null;
  expiry_date: string | null;
  status: 'active' | 'inactive' | 'superseded';
  version: number;
  is_current: boolean;
  replaces_document_id: number | null;
  created_at?: string;
  updated_at?: string;
  document_type?: DocumentTypeRecord | null;
  uploaded_by_name?: string | null;
  is_sensitive?: boolean;
  has_expiry?: boolean;
  expiry_status?: 'uploaded' | 'valid' | 'expiring' | 'expired';
}

export interface EmployeeExpedientSummary {
  total_types: number;
  required_types: number;
  uploaded_types: number;
  missing_types: number;
  completion_percent: number;
  expiring_count: number;
  expired_count: number;
}

export interface EmployeeExpedientTypeItem {
  document_type: DocumentTypeRecord;
  current_document: EmployeeDocumentRecord | null;
  status: 'missing' | 'uploaded' | 'valid' | 'expiring' | 'expired';
}

export interface EmployeeExpedientSection {
  section: DocumentSectionRecord;
  items: EmployeeExpedientTypeItem[];
}

export interface EmployeeDocumentAccessTypeItem {
  document_type: DocumentTypeRecord;
  is_enabled: boolean;
}

export interface EmployeeDocumentAccessSection {
  section: DocumentSectionRecord;
  is_enabled: boolean;
  document_types: EmployeeDocumentAccessTypeItem[];
}

export interface EmployeeDocumentAccessMatrix {
  employee_id: number;
  sections: EmployeeDocumentAccessSection[];
  enabled_section_ids: number[];
  enabled_document_type_ids: number[];
}

export type EmployeeAlertState = 'missing' | 'expiring' | 'expired';

export interface EmployeeAlertRecord {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  employee_email: string;
  area: string | null;
  position: string | null;
  state: EmployeeAlertState;
  section_id: number;
  section_name: string;
  document_type_id: number;
  document_type_name: string;
  document_id?: number;
  expiry_date?: string | null;
  days_remaining?: number | null;
}

export interface EmployeeAlertsSummary {
  missing: number;
  expiring: number;
  expired: number;
  total: number;
}

export interface AuditLogRecord {
  accessed_at: string;
  module_code: ModuleCode;
  action: string;
  ip_address: string | null;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  document: string | null;
  document_id: number | null;
  employee_id: number | null;
  employee_code: string | null;
  employee_name: string | null;
  document_type_id: number | null;
  document_type_name: string | null;
  entity_type: string | null;
  entity_id: number | null;
}

export interface JWTPayload {
  id: string;
  role: UserRole;
  mustChangePassword: boolean;
}

// Esta es la interfaz que te está pidiendo el controlador
export interface AuthRequest extends Request {
  user?: JWTPayload;
}
