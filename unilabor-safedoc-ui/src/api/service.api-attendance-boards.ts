import api from './axios';
import type { DayResultCode } from '../components/attendance/shared/dayResult';

// Cliente de tableros de asistencia (docs/attendance-api/boards-exports.md).

export type LiveStatus = 'present' | 'left' | 'late' | 'upcoming' | 'missing' | 'incident' | 'rest' | 'no_schedule';

export interface LivePerson {
  employee_id: number;
  code: string;
  full_name: string;
  area: string | null;
  branch_id: number | null;
  branch_name: string | null;
  status: LiveStatus;
  expected_start: string | null;
  expected_end: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  late_minutes: number;
}

export interface LiveKpis {
  expected: number;
  present: number;
  late: number;
  missing: number;
  incident: number;
  pending_review: number;
}

export interface LiveAbsenceItem {
  incident_id: number;
  employee_id: number;
  full_name: string;
  type_code: string;
  type_name: string;
  start_date: string;
  end_date: string;
  days: number;
}

export interface LiveDevice {
  branch_id: number;
  branch_name: string;
  agent: { id: number; name: string; online: boolean; last_heartbeat_at: string | null } | null;
  terminals_total: number;
  terminals_online: number;
  last_event_at: string | null;
}

export interface LiveTrendDay {
  date: string;
  attendances: number;
  incidents: number;
  lates: number;
  absences: number;
}

export interface LiveRankingItem {
  employee_id: number;
  code: string;
  full_name: string;
  branch_name: string | null;
  index: number | null;
  lates: number;
  absences: number;
  streak: number;
}

export interface LiveBoard {
  date: string;
  is_today: boolean;
  kpis: LiveKpis;
  progress_percent: number;
  by_status: Array<{ status: LiveStatus; count: number }>;
  people: LivePerson[];
  absences_next_7_days: { total: number; items: LiveAbsenceItem[] };
  devices: LiveDevice[];
  trend_14_days: LiveTrendDay[];
  month_ranking: LiveRankingItem[];
  alerts: { without_schedule: number; without_device_number: number; pending_sync: number };
}

export type CommitmentPeriod =
  | 'day' | 'week' | 'fortnight' | 'month' | 'bimester' | 'quarter' | 'semester' | 'year' | 'custom';

export type CommitmentLevel = 'exemplary' | 'committed' | 'regular' | 'attention' | 'no_data';

export interface CommitmentQuery {
  period: CommitmentPeriod;
  anchor?: string;
  from?: string;
  to?: string;
  branch_id?: string;
  employee_id?: string;
}

export interface CommitmentRange {
  from: string;
  to: string;
  label: string;
}

export interface CommitmentWeights {
  attendance: number;
  punctuality: number;
  exits: number;
  exemplary: number;
  attention: number;
}

export interface CommitmentTeam {
  employees: number;
  expected: number;
  attendances: number;
  punctual: number;
  lates: number;
  late_minutes: number;
  absences: number;
  partial_absences: number;
  early_departures: number;
  missing_exit: number;
  complete_exits: number;
  present: number;
  incidents: number;
  hours: number;
  overtime_hours: number;
  pct_attendance: number | null;
  pct_punctuality: number | null;
  pct_exits: number | null;
  index: number | null;
  level: CommitmentLevel;
}

export interface CommitmentPersonSummary extends CommitmentTeam {
  current_streak: number;
  best_streak: number;
}

export interface CommitmentPerson {
  place: number;
  employee_id: number;
  code: string;
  full_name: string;
  area: string | null;
  branch_id: number | null;
  branch_name: string | null;
  index: number | null;
  level: CommitmentLevel;
  summary: CommitmentPersonSummary;
}

export interface CommitmentTrendBlock {
  date: string;
  label: string;
  attendances: number;
  lates: number;
  absences: number;
  incidents: number;
}

export interface CommitmentComparisonItem {
  person: number | null;
  team: number | null;
  difference: number | null;
}

export interface CommitmentDay {
  date: string;
  day_result: DayResultCode;
  expected_start: string | null;
  expected_end: string | null;
  clock_in: string | null;
  clock_out: string | null;
  late_minutes: number;
  early_departure_minutes: number;
  worked_hours: number | null;
  overtime_hours: number | null;
  is_late_accumulation_absence: boolean;
  has_pending_review: boolean;
  incident: unknown;
}

export interface CommitmentDetail {
  employee_id: number;
  full_name: string;
  code: string;
  summary: CommitmentPersonSummary;
  streak: { current: number; best: number };
  achievements: Array<{ code: string; label: string }>;
  comparison: {
    attendance: CommitmentComparisonItem;
    punctuality: CommitmentComparisonItem;
    exits: CommitmentComparisonItem;
  };
  days: CommitmentDay[];
  days_to_review: Array<{ date: string; day_result: DayResultCode; reason: 'pending_review' | 'missing_exit' }>;
}

export interface CommitmentBoard {
  period: CommitmentPeriod;
  from: string;
  to: string;
  label: string;
  closed_through: string | null;
  previous: CommitmentRange;
  next: CommitmentRange;
  weights: CommitmentWeights;
  team: CommitmentTeam;
  people: CommitmentPerson[];
  trend: { granularity: 'day' | 'week' | 'month'; blocks: CommitmentTrendBlock[] };
  recognitions: CommitmentPerson[];
  attention: CommitmentPerson[];
  detail: CommitmentDetail | null;
  employees: Array<{ id: number; code: string; full_name: string; branch_id: number | null }>;
  branches: Array<{ id: number; name: string }>;
}

export const getLiveBoard = async (params: { date?: string; branch_id?: string }): Promise<LiveBoard> => {
  const cleanParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value));
  const response = await api.get('/attendance/board/live', { params: cleanParams });
  return response.data as LiveBoard;
};

/** Quita los parametros vacios o que no aplican al periodo (from/to solo en custom). */
export const buildCommitmentParams = (query: CommitmentQuery): Record<string, string> => {
  const result: Record<string, string> = { period: query.period };
  if (query.period === 'custom') {
    if (query.from) result.from = query.from;
    if (query.to) result.to = query.to;
  } else if (query.anchor) {
    result.anchor = query.anchor;
  }
  if (query.branch_id) result.branch_id = query.branch_id;
  if (query.employee_id) result.employee_id = query.employee_id;
  return result;
};

export const getCommitmentBoard = async (query: CommitmentQuery): Promise<CommitmentBoard> => {
  const response = await api.get('/attendance/board/commitment', { params: buildCommitmentParams(query) });
  return response.data as CommitmentBoard;
};
