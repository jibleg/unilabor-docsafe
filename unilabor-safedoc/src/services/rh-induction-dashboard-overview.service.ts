import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import {
  DASHBOARD_LAST_PHASE,
  emptyStageCounts,
  loadPhaseRosterRows,
  ROSTER_LAST_PHASE,
} from './rh-induction-dashboard.service';
import type { InductionAlert, InductionRosterRow, InductionStage } from './rh-induction-dashboard.service';
import { competencyStage } from './rh-induction-phase7';
import { competencyRouteStage, loadInitialCompetencyRoutes, loadPositionPhaseCounts } from './rh-induction-position-summary';
import { getPositionReadiness } from './rh-induction-position-readiness.service';
import type { PositionReadinessRow } from './rh-induction-position-readiness.service';
import { summarizeTransitions } from './rh-induction-transition.service';
import type { TransitionState, TransitionTarget } from './rh-induction-transition.service';

// -----------------------------------------------------------------------------
// Panorama del tablero de Induccion: configuracion/reglas de cada fase (1-4
// institucionales, 5-6 por puesto), embudo de inscritos por etapa, alertas,
// bandeja de avance entre fases por puesto, Fase 7 (REH-REG-003) y KPIs.
// -----------------------------------------------------------------------------

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

/** Fases por puesto: cuantos puestos estan habilitados y listos para recibir colaboradores. */
export interface InductionPositionPhaseSummary {
  positions_enabled: number;
  positions_ready: number;
  /** Aprobaron la fase anterior y esperan entrar (listos + bloqueados). */
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
  position_summary: InductionPositionPhaseSummary | null;
}

export interface InductionPhase7Overview {
  /** Aprobaron la Fase 6 y aun no tienen evaluacion de competencia inicial. */
  waiting: number;
  waiting_ready: number;
  in_process: number;
  pending_authorization: number;
  approved: number;
  not_approved: number;
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
  transitions: Array<{ target: TransitionTarget } & Record<TransitionState, number>>;
}

const ALERT_KEYS: InductionAlert[] = [
  'LECTURA_VENCIDA',
  'LECTURA_POR_VENCER',
  'EVALUACION_TRUNCADA',
  'EVALUACION_VENCIDA',
  'EVALUACION_POR_VENCER',
  'NO_ACREDITADA',
  'EN_CALIFICACION',
  'SIN_CUESTIONARIO',
  'AVANCE_PENDIENTE',
  'SIN_CONSTANCIA',
  'DATOS_CONSTANCIA',
  'FIRMAS_PENDIENTES',
];

const emptyAlertCounts = (): Record<InductionAlert, number> =>
  ALERT_KEYS.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<InductionAlert, number>,
  );

const READING_STAGES: InductionStage[] = ['SIN_INICIAR', 'LEYENDO', 'LECTURA_VENCIDA', 'LECTURA_COMPLETA'];
const EVALUATION_STAGES: InductionStage[] = [
  'PRACTICA_PENDIENTE',
  'EVALUACION_DISPONIBLE',
  'EVALUACION_EN_CURSO',
  'EVALUACION_TRUNCADA',
  'EN_CALIFICACION',
];
const ATTENTION_ALERTS: InductionAlert[] = [
  'LECTURA_VENCIDA',
  'EVALUACION_TRUNCADA',
  'EVALUACION_VENCIDA',
  'NO_ACREDITADA',
  'SIN_CUESTIONARIO',
  'AVANCE_PENDIENTE',
];

interface PhaseConfigRow {
  phase_id: number;
  phase_number: number;
  scope: 'INSTITUTIONAL' | 'POSITION';
  name: string;
  published_at: string | null;
  documents_total: number;
  checklist_items_total: number;
  rules: InductionPhaseRules;
}

const loadPhaseConfigs = async (): Promise<PhaseConfigRow[]> => {
  const result = await pool.query(
    `SELECT p.id, p.phase_number, p.scope, p.name, p.published_at, p.reading_time_limit_hours, p.duration_hours,
            p.auto_complete_checklist_on_pass, p.auto_advance_on_pass, p.advance_grace_hours,
            p.responsible_label, p.responsible_name, p.responsible_phone, p.training_course_id,
            (SELECT COUNT(*)::int FROM public.rh_induction_phase_documents d WHERE d.phase_id = p.id) AS documents_total,
            (SELECT COUNT(*)::int FROM public.rh_induction_phase_checklist_items ci WHERE ci.phase_id = p.id) AS checklist_items_total,
            t.id AS quiz_template_id, t.title AS quiz_title, t.window_hours, t.attempt_time_limit_minutes,
            t.passing_score, t.selection_mode, t.random_count,
            (SELECT COUNT(*)::int FROM public.evaluation_questions q WHERE q.template_id = t.id AND q.is_active = TRUE) AS question_bank_size,
            (SELECT COUNT(*)::int FROM public.certificate_templates ct
               JOIN public.certificate_template_signatures cs ON cs.certificate_template_id = ct.id
              WHERE ct.training_course_id = p.training_course_id) AS certificate_signatures
       FROM public.rh_induction_phases p
       LEFT JOIN LATERAL (
         SELECT id, title, window_hours, attempt_time_limit_minutes, passing_score, selection_mode, random_count
           FROM public.evaluation_templates
          WHERE training_course_id = p.training_course_id AND status = 'published' AND is_active = TRUE
            AND evaluation_type = 'quiz'
          ORDER BY created_at DESC LIMIT 1
       ) t ON TRUE
      WHERE p.phase_number BETWEEN 1 AND ${ROSTER_LAST_PHASE}
      ORDER BY p.phase_number ASC;`,
  );
  return result.rows.map((row) => ({
    phase_id: Number(row.id),
    phase_number: Number(row.phase_number),
    scope: String(row.scope) === 'POSITION' ? 'POSITION' : 'INSTITUTIONAL',
    name: String(row.name),
    published_at: row.published_at ? toIsoDateTime(row.published_at) : null,
    documents_total: Number(row.documents_total ?? 0),
    checklist_items_total: Number(row.checklist_items_total ?? 0),
    rules: {
      reading_time_limit_hours: row.reading_time_limit_hours ? Number(row.reading_time_limit_hours) : null,
      duration_hours: row.duration_hours !== null && row.duration_hours !== undefined ? Number(row.duration_hours) : null,
      auto_complete_checklist_on_pass: Boolean(row.auto_complete_checklist_on_pass),
      auto_advance_on_pass: Boolean(row.auto_advance_on_pass),
      advance_grace_hours: row.advance_grace_hours ? Number(row.advance_grace_hours) : null,
      responsible_label: String(row.responsible_label),
      responsible_name: row.responsible_name ? String(row.responsible_name) : null,
      responsible_phone: row.responsible_phone ? String(row.responsible_phone) : null,
      quiz_template_id: row.quiz_template_id ? Number(row.quiz_template_id) : null,
      quiz_title: row.quiz_title ? String(row.quiz_title) : null,
      quiz_published: Boolean(row.quiz_template_id),
      evaluation_window_hours: row.window_hours ? Number(row.window_hours) : null,
      attempt_time_limit_minutes: row.attempt_time_limit_minutes ? Number(row.attempt_time_limit_minutes) : null,
      passing_score: row.passing_score !== null && row.passing_score !== undefined ? Number(row.passing_score) : null,
      selection_mode: row.selection_mode ? String(row.selection_mode) : null,
      random_count: row.random_count ? Number(row.random_count) : null,
      question_bank_size: Number(row.question_bank_size ?? 0),
      certificate_signatures: Number(row.certificate_signatures ?? 0),
    },
  }));
};

const average = (values: number[]): number | null =>
  values.length === 0 ? null : Math.round((values.reduce((acc, value) => acc + value, 0) / values.length) * 10) / 10;

const positionSummary = (phaseNumber: number, positions: PositionReadinessRow[]): InductionPositionPhaseSummary => {
  const key = phaseNumber === 5 ? 'phase5' : 'phase6';
  return positions.reduce(
    (acc, position) => {
      const phase = position[key];
      if (phase.enabled) acc.positions_enabled += 1;
      if (phase.ok) acc.positions_ready += 1;
      acc.waiting += phase.waiting;
      acc.waiting_ready += phase.ready;
      return acc;
    },
    { positions_enabled: 0, positions_ready: 0, waiting: 0, waiting_ready: 0 },
  );
};

export const buildPhaseOverview = (
  config: PhaseConfigRow,
  rows: InductionRosterRow[],
  positions: PositionReadinessRow[] = [],
): InductionPhaseOverview => {
  const stageCounts = emptyStageCounts();
  const alertCounts = emptyAlertCounts();
  const originCounts: Record<string, number> = {};
  let pagesSeen = 0;
  let pagesTotal = 0;
  const percentages: number[] = [];
  const hoursToPass: number[] = [];
  let passed = 0;
  let evaluated = 0;
  let pendingAdvance = 0;
  for (const row of rows) {
    stageCounts[row.stage] += 1;
    for (const alert of row.alerts) {
      alertCounts[alert] += 1;
    }
    originCounts[row.origin] = (originCounts[row.origin] ?? 0) + 1;
    pagesSeen += Math.min(row.reading_pages_seen, row.reading_pages_total);
    pagesTotal += row.reading_pages_total;
    if (row.stage === 'APROBADA') {
      passed += 1;
      evaluated += 1;
      hoursToPass.push(row.elapsed_hours);
      if (row.evaluation_percentage !== null) percentages.push(row.evaluation_percentage);
      if (row.next_phase_id && !row.next_phase_enrolled) pendingAdvance += 1;
    } else if (row.stage === 'NO_ACREDITADA') {
      evaluated += 1;
      if (row.evaluation_percentage !== null) percentages.push(row.evaluation_percentage);
    }
  }
  const byPosition = config.scope === 'POSITION' ? positionSummary(config.phase_number, positions) : null;
  // En las fases por puesto los documentos, la evaluacion y las firmas son de
  // cada puesto: la fase esta lista cuando al menos un puesto lo esta.
  const readiness: InductionPhaseReadiness = byPosition
    ? {
        documents_ok: byPosition.positions_ready > 0,
        quiz_ok: byPosition.positions_ready > 0,
        duration_ok: config.rules.duration_hours !== null && config.rules.duration_hours > 0,
        signatures_ok: byPosition.positions_ready > 0,
        published: Boolean(config.published_at),
        ready: false,
      }
    : {
        documents_ok: config.documents_total > 0,
        quiz_ok: config.rules.quiz_published,
        duration_ok: config.rules.duration_hours !== null && config.rules.duration_hours > 0,
        signatures_ok: config.rules.certificate_signatures >= 3,
        published: Boolean(config.published_at),
        ready: false,
      };
  readiness.ready = readiness.documents_ok && readiness.quiz_ok && readiness.duration_ok && readiness.signatures_ok;
  return {
    ...config,
    readiness,
    enrolled: rows.length,
    stage_counts: stageCounts,
    alert_counts: alertCounts,
    pass_rate: evaluated > 0 ? Math.round((passed / evaluated) * 1000) / 10 : null,
    average_percentage: average(percentages),
    average_hours_to_pass: average(hoursToPass),
    reading_progress_pct: pagesTotal > 0 ? Math.round((pagesSeen / pagesTotal) * 1000) / 10 : 0,
    pending_advance: pendingAdvance,
    origin_counts: originCounts,
    position_summary: byPosition,
  };
};

export const getInductionProgramOverview = async (): Promise<InductionProgramOverview> => {
  const [configs, positions, transitions, competencies] = await Promise.all([
    loadPhaseConfigs(),
    getPositionReadiness(),
    summarizeTransitions(),
    loadInitialCompetencyRoutes(),
  ]);
  const positionCounts = await loadPositionPhaseCounts();
  const phases: InductionPhaseOverview[] = [];
  const employeesInProgram = new Set<number>();
  const currentPhaseByEmployee = new Map<number, number>();
  const passedPhasesByEmployee = new Map<number, Set<number>>();
  const totals = { enrollments: 0, passed: 0, in_reading: 0, in_evaluation: 0, needs_attention: 0 };

  for (const config of configs) {
    const rows = await loadPhaseRosterRows(config.phase_id);
    phases.push(buildPhaseOverview(config, rows, positions));
    for (const row of rows) {
      totals.enrollments += 1;
      employeesInProgram.add(row.employee_id);
      const current = currentPhaseByEmployee.get(row.employee_id) ?? 0;
      if (row.phase_number > current) currentPhaseByEmployee.set(row.employee_id, row.phase_number);
      if (row.stage === 'APROBADA') {
        totals.passed += 1;
        const set = passedPhasesByEmployee.get(row.employee_id) ?? new Set<number>();
        set.add(row.phase_number);
        passedPhasesByEmployee.set(row.employee_id, set);
      }
      if (READING_STAGES.includes(row.stage)) totals.in_reading += 1;
      if (EVALUATION_STAGES.includes(row.stage)) totals.in_evaluation += 1;
      if (row.alerts.some((alert) => ATTENTION_ALERTS.includes(alert))) totals.needs_attention += 1;
    }
  }

  const employeesByCurrentPhase: Record<string, number> = {};
  for (const phaseNumber of currentPhaseByEmployee.values()) {
    const key = String(phaseNumber);
    employeesByCurrentPhase[key] = (employeesByCurrentPhase[key] ?? 0) + 1;
  }
  let completed = 0;
  for (const set of passedPhasesByEmployee.values()) {
    if ([1, 2, 3, DASHBOARD_LAST_PHASE].every((phase) => set.has(phase))) completed += 1;
  }
  const phase7Waiting = transitions.find((item) => item.target === 7);
  const phase7: InductionPhase7Overview = {
    waiting: (phase7Waiting?.READY ?? 0) + (phase7Waiting?.BLOCKED ?? 0),
    waiting_ready: phase7Waiting?.READY ?? 0,
    in_process: 0,
    pending_authorization: 0,
    approved: 0,
    not_approved: 0,
  };
  // Fase 7 por puesto: cada REH-REG-003 INICIAL cuenta por su puesto; un colaborador
  // concluye 1-7 cuando tiene autorizada la competencia de TODOS sus puestos de la Fase 6.
  let completedAllPositions = 0;
  for (const [employeeId, entries] of competencies) {
    const required = positionCounts.get(`${employeeId}:6`)?.passed ?? entries.length;
    if (competencyRouteStage(entries, required) === 'APROBADA') completedAllPositions += 1;
  }
  for (const competency of [...competencies.values()].flat()) {
    const stage = competencyStage(competency);
    if (stage === 'COMPETENCIA_EN_PROCESO') phase7.in_process += 1;
    else if (stage === 'COMPETENCIA_POR_AUTORIZAR') phase7.pending_authorization += 1;
    else if (stage === 'APROBADA') phase7.approved += 1;
    else phase7.not_approved += 1;
  }
  const activeEmployees = await pool.query(`SELECT COUNT(*)::int AS total FROM public.employees WHERE is_active = TRUE;`);

  return {
    generated_at: new Date().toISOString(),
    employees_active: Number(activeEmployees.rows[0]?.total ?? 0),
    employees_in_program: employeesInProgram.size,
    employees_completed_1_4: completed,
    employees_completed_1_7: completedAllPositions,
    employees_by_current_phase: employeesByCurrentPhase,
    totals,
    phases,
    phase7,
    transitions,
  };
};
