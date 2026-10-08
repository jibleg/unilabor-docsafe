import type { RhCompetencyEvaluation } from './models';

/** Tipos del Tablero de evaluación de competencia (REH-REG-003). */

export type CompetencyStanding =
  | 'SIN_EVALUACION'
  | 'EN_CAPTURA'
  | 'PENDIENTE_AUTORIZACION'
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDA'
  | 'NO_COMPETENTE';

export interface CompetencyDashboardEvaluation {
  id: number;
  employee_id: number;
  position_id: number;
  position_name: string;
  evaluation_type: string;
  evaluation_date: string;
  evaluator_name: string;
  status: 'DRAFT' | 'CLOSED';
  competency_pct: number | null;
  performance_pct: number | null;
  knowledge_pct: number | null;
  final_pct: number | null;
  veto_applied: boolean;
  dictamen: string | null;
  authorization_result: string | null;
  authorized_at: string | null;
  authorized_by_name: string | null;
  valid_until: string | null;
  reference_course_title: string | null;
  knowledge_status: string | null;
  items_total: number;
  items_scored: number;
  actions_count: number;
  document_id: number | null;
  certificate_document_id: number | null;
  closed_at: string | null;
  created_at: string;
}

export interface CompetencyDashboardEmployee {
  employee_id: number;
  full_name: string;
  employee_code: string;
  area: string | null;
  branch_name: string | null;
  positions: Array<{ id: number; name: string }>;
  standing: CompetencyStanding;
  has_draft: boolean;
  evaluations_count: number;
  current_evaluation_id: number | null;
  valid_until: string | null;
  days_to_expiry: number | null;
  /** Competencia por puesto (cada puesto activo lleva su propio REH-REG-003); el estado general es el peor. */
  position_standings?: CompetencyPositionStanding[];
}

export interface CompetencyPositionStanding {
  position_id: number;
  position_name: string;
  standing: CompetencyStanding;
  current_evaluation_id: number | null;
  valid_until: string | null;
  days_to_expiry: number | null;
}

export interface CompetencyDashboard {
  today: string;
  expiry_warning_days: number;
  employees: CompetencyDashboardEmployee[];
  evaluations: CompetencyDashboardEvaluation[];
}

export interface CompetencyTraceEvent {
  id: number;
  evaluation_id: number;
  action: string;
  detail: string | null;
  user_name: string | null;
  occurred_at: string;
}

export interface CompetencySupportDocument {
  id: number;
  evaluation_id: number;
  kind: 'RECORD' | 'CERTIFICATE';
  title: string;
  document_type_name: string;
  version: number;
  is_current: boolean;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface CompetencyEmployeeDetail {
  employee_id: number;
  evaluations: RhCompetencyEvaluation[];
  trace: CompetencyTraceEvent[];
  documents: CompetencySupportDocument[];
}
