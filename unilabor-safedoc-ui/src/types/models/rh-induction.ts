
// --- Induccion por puesto (REH-MAN-002 / ISO 15189 6.2) ---------------------

export type RhCompetencyCriticality = 'A' | 'M' | 'B';

export interface RhPositionCompetency {
  id: number;
  competency_text: string;
  criticality: RhCompetencyCriticality;
  sort_order: number;
}

export interface RhPositionDocument {
  id: number;
  document_id: string;
  title: string;
  code: string | null;
  sort_order: number;
}

export interface RhPosition {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  competencies: RhPositionCompetency[];
  documents: RhPositionDocument[];
  created_at: string;
  updated_at: string;
}

export interface RhEmployeePosition {
  id: number;
  employee_id: number;
  position_id: number;
  position_name: string;
  position_code: string;
  assigned_at: string;
  is_active: boolean;
  ended_at: string | null;
}

export interface RhInductionPhaseDocument {
  id: number;
  document_id: string;
  title: string;
  code: string | null;
  /** Tipo del expediente donde se archiva la copia firmada (null = no se archiva). */
  expedient_document_type_id: number | null;
  expedient_document_type_code: string | null;
  expedient_document_type_name: string | null;
  expedient_section_name: string | null;
  sort_order: number;
}

export interface RhInductionPhase {
  id: number;
  phase_number: number;
  name: string;
  responsible_label: string;
  responsible_name: string | null;
  responsible_phone: string | null;
  scope: 'INSTITUTIONAL' | 'POSITION';
  training_course_id: number | null;
  training_course_title: string | null;
  duration_hours: number | null;
  reading_time_limit_hours: number | null;
  /** null = borrador: los inscritos no ven documentos ni evaluación hasta "Publicar fase". */
  published_at: string | null;
  /** Interruptor "Completar checklist al aprobar": al acreditar la evaluación se marcan todos los contenidos. */
  auto_complete_checklist_on_pass: boolean;
  /** Interruptor "Avanzar automáticamente al aprobar": al acreditar esta fase se inscribe en la siguiente (1-3). */
  auto_advance_on_pass: boolean;
  /** Periodo de descanso (horas) antes de iniciar esta fase al avanzar desde la anterior; null = sin descanso. */
  advance_grace_hours: number | null;
  documents: RhInductionPhaseDocument[];
}

export interface RhInductionPhasePosition {
  id: number;
  position_id: number;
  position_name: string;
  position_code: string;
  training_course_id: number;
  course_code: string;
  has_published_template: boolean;
}

export interface RhInductionProgressItem {
  enrollment_id: number;
  phase_id: number;
  phase_number: number;
  phase_name: string;
  responsible_label: string;
  reading_total: number;
  reading_signed: number;
  /** Acuses vigentes sin firmar; en una fase aprobada = firmas reabiertas por RH. */
  reading_to_sign?: number;
  reading_to_sign_deadline_at?: string | null;
  reading_completed_at: string | null;
  reading_deadline_at: string | null;
  evaluation_assignment_id: number | null;
  evaluation_status: string | null;
  evaluation_percentage: number | null;
  supervisor_employee_id: number | null;
  supervisor_name: string | null;
  checklist_total: number;
  checklist_completed: number;
  /** false = la fase sigue en borrador (RH aún no la publica). */
  phase_published?: boolean;
  /** Descanso entre fases: cuándo se activan tus lecturas (null si ya arrancó o no aplica). */
  readings_start_at?: string | null;
  /** Fases por puesto (5-6): puesto de esta inscripción, su orden en la ruta y si está en cola. */
  position_id?: number | null;
  position_code?: string | null;
  position_name?: string | null;
  position_sequence?: number | null;
  queue_status?: InductionQueueStatus;
}

// --- Tablero de Inducción (Fases 1-4) ---------------------------------------

export type InductionStage =
  | 'EN_ESPERA_PUBLICACION'
  | 'EN_DESCANSO'
  | 'SIN_LECTURAS'
  | 'SIN_INICIAR'
  | 'LEYENDO'
  | 'LECTURA_VENCIDA'
  | 'LECTURA_COMPLETA'
  | 'EVALUACION_DISPONIBLE'
  | 'EVALUACION_EN_CURSO'
  | 'EVALUACION_TRUNCADA'
  | 'PRACTICA_PENDIENTE'
  | 'EN_CALIFICACION'
  | 'EVALUACION_VENCIDA'
  | 'COMPETENCIA_EN_PROCESO'
  | 'COMPETENCIA_POR_AUTORIZAR'
  | 'NO_ACREDITADA'
  /** Ruta por puesto: acreditó un puesto y el siguiente de la cola aún no puede activarse. */
  | 'SIGUIENTE_PUESTO'
  | 'APROBADA';

export type InductionAlert =
  | 'LECTURA_VENCIDA'
  | 'LECTURA_POR_VENCER'
  | 'EVALUACION_TRUNCADA'
  | 'EVALUACION_VENCIDA'
  | 'EVALUACION_POR_VENCER'
  | 'NO_ACREDITADA'
  | 'EN_CALIFICACION'
  | 'SIN_CUESTIONARIO'
  | 'AVANCE_PENDIENTE'
  | 'SIN_CONSTANCIA'
  | 'DATOS_CONSTANCIA'
  | 'FIRMAS_PENDIENTES';

export type InductionAction =
  | 'REOPEN_READING'
  | 'EXTEND_READING'
  | 'REOPEN_SIGNATURES'
  | 'RESEND_NOTICE'
  | 'RESET_ATTEMPT'
  | 'AUTHORIZE_RETRY'
  | 'GRADE'
  | 'ADVANCE'
  | 'ISSUE_CERTIFICATE'
  | 'COMPLETE_DATA'
  | 'START_NOW'
  | 'CAPTURE_PRACTICAL'
  | 'UNENROLL';

export type InductionEnrollmentOrigin = 'MANUAL' | 'BULK' | 'AUTO_ADVANCE' | 'RECONCILE' | 'ADVANCE';

/** Fila del roster del tablero: superconjunto de RhInductionPhaseEnrollmentSummary. */
export interface InductionRosterRow extends RhInductionPhaseEnrollmentSummary {
  phase_id: number;
  phase_number: number;
  /** Fase 6 = evaluación práctica capturada por RH; el resto, cuestionario. */
  evaluation_mode: 'quiz' | 'practical';
  employee_email: string | null;
  area: string | null;
  branch_name: string | null;
  position_name: string | null;
  /** Solo en vistas agregadas: avance de la ruta por puesto. */
  positions_total?: number;
  positions_passed?: number;
  origin: InductionEnrollmentOrigin | string;
  enrolled_at: string;
  phase_published: boolean;
  /** Descanso entre fases: cuándo se activan las lecturas (null si ya arrancó o no aplica). */
  readings_start_at: string | null;
  reading_pages_total: number;
  reading_pages_seen: number;
  reading_active_seconds: number;
  reading_started_at: string | null;
  evaluation_assignment_id: number | null;
  evaluation_available_at: string | null;
  evaluation_deadline_at: string | null;
  evaluation_started_at: string | null;
  evaluation_submitted_at: string | null;
  evaluation_question_count: number;
  evaluation_response_count: number;
  attempt_time_limit_minutes: number | null;
  attempts_total: number;
  certificate_document_id: number | null;
  next_phase_id: number | null;
  next_phase_enrolled: boolean;
  next_phase_published: boolean | null;
  quiz_published: boolean;
  stage: InductionStage;
  alerts: InductionAlert[];
  actions: InductionAction[];
  elapsed_hours: number;
}

export interface InductionRosterPage {
  rows: InductionRosterRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  stage_counts: Record<InductionStage, number>;
}

export interface InductionPhaseRules {
  reading_time_limit_hours: number | null;
  duration_hours: number | null;
  auto_complete_checklist_on_pass: boolean;
  auto_advance_on_pass: boolean;
  advance_grace_hours: number | null;
  responsible_label: string;
  responsible_name: string | null;
  responsible_phone: string | null;
  quiz_template_id: number | null;
  quiz_title: string | null;
  quiz_published: boolean;
  evaluation_window_hours: number | null;
  attempt_time_limit_minutes: number | null;
  passing_score: number | null;
  selection_mode: string | null;
  random_count: number | null;
  question_bank_size: number;
  certificate_signatures: number;
}

export interface InductionPhaseReadiness {
  documents_ok: boolean;
  quiz_ok: boolean;
  duration_ok: boolean;
  signatures_ok: boolean;
  published: boolean;
  ready: boolean;
}

export interface InductionPositionPhaseSummary {
  positions_enabled: number;
  positions_ready: number;
  waiting: number;
  waiting_ready: number;
}

export interface InductionPhaseOverview {
  phase_id: number;
  phase_number: number;
  scope: 'INSTITUTIONAL' | 'POSITION';
  name: string;
  published_at: string | null;
  documents_total: number;
  checklist_items_total: number;
  rules: InductionPhaseRules;
  readiness: InductionPhaseReadiness;
  enrolled: number;
  stage_counts: Record<InductionStage, number>;
  alert_counts: Record<InductionAlert, number>;
  pass_rate: number | null;
  average_percentage: number | null;
  average_hours_to_pass: number | null;
  reading_progress_pct: number;
  pending_advance: number;
  origin_counts: Record<string, number>;
  /** Solo fases por puesto (5-6): puestos habilitados/listos y quién espera entrar. */
  position_summary: InductionPositionPhaseSummary | null;
}

export interface InductionPhase7Overview {
  waiting: number;
  waiting_ready: number;
  in_process: number;
  pending_authorization: number;
  approved: number;
  not_approved: number;
}

export type InductionTransitionTarget = 5 | 6 | 7;
export type InductionTransitionState = 'READY' | 'BLOCKED' | 'STARTED';
export type InductionTransitionBlockReason =
  | 'SIN_USUARIO'
  | 'SIN_PUESTO'
  | 'FASE_EN_BORRADOR'
  | 'PUESTO_NO_HABILITADO'
  | 'PUESTO_SIN_DOCUMENTOS'
  | 'EVALUACION_NO_LISTA'
  | 'PUESTO_SIN_COMPETENCIAS'
  | 'PUESTOS_PENDIENTES';

export interface InductionTransitionBlock {
  reason: InductionTransitionBlockReason;
  detail: string;
}

export interface InductionCompetencySnapshot {
  evaluation_id: number;
  status: 'DRAFT' | 'CLOSED';
  evaluation_date: string | null;
  evaluator_name: string;
  final_pct: number | null;
  dictamen: string | null;
  authorization_result: string | null;
  closed_at: string | null;
}

export type InductionPositionEvaluationState = 'MISSING' | 'DRAFT' | 'NO_QUESTIONS' | 'READY';

/** Renglón de la bandeja de avance (aprobó la fase anterior y no está en la destino). */
export interface InductionTransitionRow {
  target: InductionTransitionTarget;
  state: InductionTransitionState;
  blocks: InductionTransitionBlock[];
  waiting_hours: number | null;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  user_linked: boolean;
  area: string | null;
  branch_name: string | null;
  position_id: number | null;
  position_code: string | null;
  position_name: string | null;
  previous_enrollment_id: number | null;
  previous_passed_at: string | null;
  previous_percentage: number | null;
  previous_certificate_document_id: number | null;
  target_course_id: number | null;
  documents_total: number;
  competencies_total: number;
  evaluation_state: InductionPositionEvaluationState;
  competency: InductionCompetencySnapshot | null;
  /** Ruta por puesto: estado de cada puesto del colaborador (el `position_*` de arriba es con el que inicia o sigue). */
  positions?: InductionTransitionPosition[];
  /** Puestos que aún no acreditan la fase anterior (bloquean el avance). */
  pending_positions?: string[];
}

export type InductionTransitionPositionStatus = 'LISTO' | 'BLOQUEADO' | 'APROBADO' | 'EN_CURSO' | 'EN_COLA' | 'PENDIENTE' | 'EN_EVALUACION';

export interface InductionTransitionPosition {
  position_id: number;
  position_code: string;
  position_name: string;
  status: InductionTransitionPositionStatus;
  detail: string | null;
}

export interface InductionTransitionPhase {
  phase_id: number;
  phase_number: number;
  name: string;
  published: boolean;
  advance_grace_hours: number | null;
}

export interface InductionTransitionQueue {
  phase: InductionTransitionPhase;
  rows: InductionTransitionRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  state_counts: Record<InductionTransitionState, number>;
  reason_counts: Record<InductionTransitionBlockReason, number>;
}

export interface InductionTransitionResult {
  employee_id: number;
  employee_name: string;
  ok: boolean;
  message: string;
  created_id: number | null;
  previous_enrollment_id: number | null;
}

export interface InductionPositionPhaseReadiness {
  enabled: boolean;
  course_id: number | null;
  evaluation_state: InductionPositionEvaluationState | null;
  question_count: number;
  certificate_signatures: number;
  waiting: number;
  ready: number;
  enrolled: number;
  ok: boolean;
}

/** Preparación de un puesto para recibir colaboradores en las Fases 5-7. */
export interface InductionPositionReadinessRow {
  position_id: number;
  position_code: string;
  position_name: string;
  employees_active: number;
  documents_total: number;
  competencies_total: number;
  phase5: InductionPositionPhaseReadiness;
  phase6: InductionPositionPhaseReadiness;
  phase7: { waiting: number; ready: number; started: number; ok: boolean };
}

export interface InductionProgramOverview {
  generated_at: string;
  employees_active: number;
  employees_in_program: number;
  employees_completed_1_4: number;
  employees_completed_1_7: number;
  employees_by_current_phase: Record<string, number>;
  totals: {
    enrollments: number;
    passed: number;
    in_reading: number;
    in_evaluation: number;
    needs_attention: number;
  };
  phases: InductionPhaseOverview[];
  phase7: InductionPhase7Overview;
  transitions: Array<{ target: InductionTransitionTarget } & Record<InductionTransitionState, number>>;
}

export type InductionTrackAccess = 'ENROLLED' | 'AVAILABLE' | 'LOCKED';

export interface InductionTrackPhase {
  phase_id: number;
  phase_number: number;
  phase_name: string;
  published: boolean;
  auto_advance_on_pass: boolean;
  reading_time_limit_hours: number | null;
  advance_grace_hours: number | null;
  evaluation_window_hours: number | null;
  attempt_time_limit_minutes: number | null;
  passing_score: number | null;
  documents_total: number;
  access: InductionTrackAccess;
  enrollment_id: number | null;
  readings_start_at: string | null;
  passed: boolean;
  passed_at: string | null;
}

export interface InductionReadingDocumentDetail {
  enrollment_id: number;
  document_id: string;
  document_code: string | null;
  title: string;
  acknowledgement_id: number | null;
  status: string | null;
  pages_total: number;
  pages_seen: number;
  active_seconds: number;
  current_page: number | null;
  started_at: string | null;
  read_completed_at: string | null;
  signed_at: string | null;
  deadline_at: string | null;
  last_progress_at: string | null;
}

export interface InductionAttemptDetail {
  assignment_id: number;
  /** Inscripción (puesto, en Fases 5-6) a la que pertenece el intento. */
  enrollment_id?: number;
  phase_number: number;
  template_id: number;
  template_title: string;
  is_current: boolean;
  status: string;
  attempt_no: number;
  available_at: string | null;
  deadline_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  question_count: number;
  response_count: number;
  certificate_document_id: number | null;
}

export interface InductionAuditEntry {
  id: number;
  action: string;
  occurred_at: string;
  actor_name: string | null;
  entity_type: string | null;
  entity_id: number | null;
  metadata: Record<string, unknown> | null;
}

export type InductionDirectoryStatus = 'ALL' | 'IN_PROGRESS' | 'STALLED' | 'COMPLETED' | 'ATTENTION';

export interface InductionDirectoryPhase {
  phase_number: number;
  /** null en la Fase 7 (evaluación de competencia, sin inscripción). */
  enrollment_id: number | null;
  stage: InductionStage;
  reading_signed: number;
  reading_total: number;
  evaluation_percentage: number | null;
  attempts_total: number;
  has_certificate: boolean;
  alerts: InductionAlert[];
  /** Fases por puesto (5-7): puestos de la ruta y cuántos van acreditados. */
  positions_total?: number;
  positions_passed?: number;
}

/** Renglón del directorio "Por colaborador" del Tablero de Inducción. */
export interface InductionDirectoryRow {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  position_name: string | null;
  branch_name: string | null;
  area: string | null;
  phases: InductionDirectoryPhase[];
  approved_count: number;
  current_phase_number: number;
  current_stage: InductionStage;
  attention_count: number;
  last_enrolled_at: string;
}

export interface InductionDirectoryPage {
  rows: InductionDirectoryRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  status_counts: Record<InductionDirectoryStatus, number>;
}

/** Fase por puesto (5-7) en la ruta del colaborador con su estado de avance. */
export interface InductionPositionTrackPhase {
  phase_id: number;
  phase_number: number;
  phase_name: string;
  published: boolean;
  enrollment_id: number | null;
  transition: { state: InductionTransitionState; blocks: InductionTransitionBlock[] } | null;
  competency: InductionCompetencySnapshot | null;
  /** Ruta por puesto: cada puesto con su lugar, estado y evaluación. */
  positions?: InductionPositionTrackEntry[];
}

export interface InductionPositionTrackEntry {
  position_id: number;
  position_code: string;
  position_name: string;
  sequence: number;
  /** Fases 5-6: estado en la ruta; Fase 7: null (no hay inscripción). */
  queue_status: InductionQueueStatus | null;
  enrollment_id: number | null;
  evaluation_status: string | null;
  passed: boolean;
  cancelled_reason: string | null;
  competency: InductionCompetencySnapshot | null;
}

export interface InductionEmployee360 {
  employee: {
    id: number;
    full_name: string;
    employee_code: string;
    email: string | null;
    phone: string | null;
    area: string | null;
    branch_name: string | null;
    position_id: number | null;
    position_name: string | null;
    is_active: boolean;
    user_linked: boolean;
  };
  track: InductionTrackPhase[];
  position_track: InductionPositionTrackPhase[];
  enrollments: InductionRosterRow[];
  documents: InductionReadingDocumentDetail[];
  attempts: InductionAttemptDetail[];
  audit: InductionAuditEntry[];
}

export interface RhInductionPhaseEnrollmentSummary {
  enrollment_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  reading_total: number;
  reading_signed: number;
  reading_completed_at: string | null;
  reading_deadline_at: string | null;
  evaluation_status: string | null;
  evaluation_percentage: number | null;
  /** Numero de intento del cuestionario vigente (>1 cuando RH autorizo reintentos). */
  evaluation_attempt_no: number | null;
  supervisor_employee_id: number | null;
  supervisor_name: string | null;
  checklist_total: number;
  checklist_completed: number;
  missing_branch: boolean;
  missing_position: boolean;
  /** Fases por puesto (5-6): puesto de esta inscripción, su orden en la ruta y si está en cola. */
  position_id?: number | null;
  position_code?: string | null;
  position_sequence?: number | null;
  queue_status?: InductionQueueStatus;
}

/** Ruta por puesto (Fases 5-6): QUEUED = en cola, ACTIVE = iniciada, CANCELLED = baja lógica del puesto. */
export type InductionQueueStatus = 'QUEUED' | 'ACTIVE' | 'CANCELLED';

export interface RhInductionChecklistItem {
  id: number;
  phase_id: number;
  item_text: string;
  sort_order: number;
}

export interface RhInductionChecklistProgressItem {
  checklist_item_id: number;
  item_text: string;
  sort_order: number;
  completed_at: string | null;
}

export interface RhInductionEffectivenessReview {
  id: number;
  employee_id: number;
  review_date: string;
  method: string;
  result_percentage: number | null;
  performs_as_expected: boolean | null;
  evidence_notes: string | null;
  reviewed_by_user_id: string | null;
  created_at: string;
}

export type RhInductionPhaseRowStatus = 'PENDIENTE' | 'EN_PROCESO' | 'APROBADA' | 'NO_APROBADA' | 'NO_DISPONIBLE';

export interface RhInductionMasterRecordPhaseRow {
  phase_number: number;
  name: string;
  responsible_label: string;
  supervisor_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  score_percentage: number | null;
  status: RhInductionPhaseRowStatus;
  checklist_total: number;
  checklist_completed: number;
  collaborator_signature_note: string;
  responsible_signature_note: string;
}

export type RhInductionVerdict = 'SIN_INICIAR' | 'EN_PROCESO' | 'NO_APROBADA' | 'COMPLETA_1_A_4' | 'COMPLETA_7_FASES';

export type RhInductionClosureVerdict = 'APROBADA_INSTITUCIONAL' | 'APROBADA_COMPLETA' | 'NO_APROBADA';

/** Cierre formal vigente del REH-REG-005 (evidencia archivada en el expediente). */
export interface RhInductionClosure {
  id: number;
  employee_id: number;
  verdict: RhInductionClosureVerdict;
  verdict_label: string;
  closing_notes: string | null;
  rh_signatory_name: string;
  area_signatory_name: string;
  document_id: number | null;
  created_at: string;
}

export interface RhInductionMasterRecord {
  employee: {
    id: number;
    full_name: string;
    employee_code: string;
    area: string | null;
    position: string | null;
    active_positions: string[];
  };
  started_at: string | null;
  finished_at: string | null;
  phases: RhInductionMasterRecordPhaseRow[];
  summary: {
    approved_count: number;
    not_approved_count: number;
    pending_count: number;
    average_score: number | null;
    verdict: RhInductionVerdict;
    what_next: string;
  };
  effectiveness_reviews: RhInductionEffectivenessReview[];
  closure?: RhInductionClosure | null;
}

// --- Evaluacion de competencia (REH-REG-003) --------------------------------

/** Generación de "preguntas propias del puesto" (cuestionario de la Fase 5), en segundo plano. */
export interface PositionQuizRegeneration {
  batch_id: number;
  position_id: number;
  status: 'running' | 'completed' | 'failed';
  question_count: number;
  documents: number;
  error_message: string | null;
  created_at: string;
}
