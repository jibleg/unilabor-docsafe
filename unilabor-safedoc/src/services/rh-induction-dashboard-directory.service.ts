import { loadProgramRosterRows, normalizeSearchText } from './rh-induction-dashboard.service';
import type { InductionAlert, InductionRosterRow, InductionStage } from './rh-induction-dashboard.service';
import { competencyStage, loadInitialCompetencies, PHASE7_NUMBER } from './rh-induction-phase7';
import type { CompetencySnapshot } from './rh-induction-phase7';
import {
  collapsePositionRows,
  competencyRouteStage,
  loadInitialCompetencyRoutes,
  loadPositionPhaseCounts,
} from './rh-induction-position-summary';

// -----------------------------------------------------------------------------
// Directorio "Por colaborador" del Tablero de Induccion: un renglon por
// colaborador inscrito en el programa con el estado de cada fase (1-6 por
// inscripcion, 7 por su evaluacion de competencia inicial), para buscarlo y
// abrir su resumen completo (vista 360).
// Se arma en memoria a partir del roster (decenas/cientos de colaboradores)
// para reutilizar la misma derivacion de etapa y alertas del roster por fase.
// -----------------------------------------------------------------------------

/**
 * IN_PROGRESS = cursando una fase sin aprobar; STALLED = aprobo su ultima fase y
 * aun no entra a la siguiente (lo que la bandeja de avance resuelve);
 * COMPLETED = concluyo las 7 fases; ATTENTION = con alertas que requieren a RH.
 */
export type DirectoryStatusFilter = 'ALL' | 'IN_PROGRESS' | 'STALLED' | 'COMPLETED' | 'ATTENTION';

/** Alertas que requieren intervencion de RH (las informativas no cuentan). */
const ATTENTION_ALERTS = new Set<InductionAlert>([
  'LECTURA_VENCIDA',
  'EVALUACION_TRUNCADA',
  'EVALUACION_VENCIDA',
  'NO_ACREDITADA',
  'SIN_CUESTIONARIO',
  'AVANCE_PENDIENTE',
  'FIRMAS_PENDIENTES',
]);

export interface DirectoryPhaseStatus {
  phase_number: number;
  /** null en la Fase 7 (no hay inscripcion; es la evaluacion de competencia). */
  enrollment_id: number | null;
  stage: InductionStage;
  reading_signed: number;
  reading_total: number;
  evaluation_percentage: number | null;
  attempts_total: number;
  has_certificate: boolean;
  alerts: InductionAlert[];
  /** Fases por puesto (5-7): puestos de la ruta y cuantos van acreditados. */
  positions_total?: number;
  positions_passed?: number;
}

export interface DirectoryEmployeeRow {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  position_name: string | null;
  branch_name: string | null;
  area: string | null;
  phases: DirectoryPhaseStatus[];
  approved_count: number;
  /** Fase mas avanzada en la que esta inscrito y su etapa. */
  current_phase_number: number;
  current_stage: InductionStage;
  attention_count: number;
  last_enrolled_at: string;
}

export interface DirectoryQuery {
  search?: string | undefined;
  status: DirectoryStatusFilter;
  page: number;
  limit: number;
}

export interface DirectoryPage {
  rows: DirectoryEmployeeRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  status_counts: Record<DirectoryStatusFilter, number>;
}

const toPhaseStatus = (row: InductionRosterRow): DirectoryPhaseStatus => ({
  phase_number: row.phase_number,
  enrollment_id: row.enrollment_id,
  stage: row.stage,
  reading_signed: row.reading_signed,
  reading_total: row.reading_total,
  evaluation_percentage: row.evaluation_percentage,
  attempts_total: row.attempts_total,
  has_certificate: row.certificate_document_id !== null,
  alerts: row.alerts,
  ...(row.positions_total !== undefined ? { positions_total: row.positions_total, positions_passed: row.positions_passed ?? 0 } : {}),
});

export const groupRosterByEmployee = (
  rows: InductionRosterRow[],
  competencies: Map<number, CompetencySnapshot> = new Map(),
  /** Ruta de competencia por puesto: etapa agregada y avance de la Fase 7 por colaborador. */
  phase7Routes: Map<number, { stage: InductionStage; total: number; passed: number }> = new Map(),
): DirectoryEmployeeRow[] => {
  const byEmployee = new Map<number, InductionRosterRow[]>();
  for (const row of rows) {
    const list = byEmployee.get(row.employee_id) ?? [];
    list.push(row);
    byEmployee.set(row.employee_id, list);
  }
  return [...byEmployee.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.phase_number - b.phase_number);
    const first = sorted[0] as InductionRosterRow;
    const phases = sorted.map(toPhaseStatus);
    const competency = competencies.get(first.employee_id);
    if (competency) {
      const route = phase7Routes.get(first.employee_id);
      phases.push(
        route
          ? { ...toPhase7Status(competency), stage: route.stage, positions_total: route.total, positions_passed: route.passed }
          : toPhase7Status(competency),
      );
    }
    const current = phases[phases.length - 1] as DirectoryPhaseStatus;
    return {
      employee_id: first.employee_id,
      employee_name: first.employee_name,
      employee_code: first.employee_code,
      position_name: first.position_name,
      branch_name: first.branch_name,
      area: first.area,
      phases,
      approved_count: phases.filter((phase) => phase.stage === 'APROBADA').length,
      current_phase_number: current.phase_number,
      current_stage: current.stage,
      attention_count: sorted.reduce((acc, row) => acc + row.alerts.filter((alert) => ATTENTION_ALERTS.has(alert)).length, 0),
      last_enrolled_at: sorted.reduce((acc, row) => (row.enrolled_at > acc ? row.enrolled_at : acc), first.enrolled_at),
    };
  });
};

const toPhase7Status = (competency: CompetencySnapshot): DirectoryPhaseStatus => ({
  phase_number: PHASE7_NUMBER,
  enrollment_id: null,
  stage: competencyStage(competency),
  reading_signed: 0,
  reading_total: 0,
  evaluation_percentage: competency.final_pct,
  attempts_total: 1,
  has_certificate: false,
  alerts: [],
});

const isCompleted = (row: DirectoryEmployeeRow): boolean => row.current_phase_number === PHASE7_NUMBER && row.current_stage === 'APROBADA';
const isStalled = (row: DirectoryEmployeeRow): boolean => row.current_stage === 'APROBADA' && row.current_phase_number < PHASE7_NUMBER;

const matchesStatus = (row: DirectoryEmployeeRow, status: DirectoryStatusFilter): boolean => {
  if (status === 'COMPLETED') return isCompleted(row);
  if (status === 'STALLED') return isStalled(row);
  if (status === 'IN_PROGRESS') return row.current_stage !== 'APROBADA';
  if (status === 'ATTENTION') return row.attention_count > 0;
  return true;
};

export const filterDirectory = (all: DirectoryEmployeeRow[], query: DirectoryQuery): DirectoryPage => {
  const search = query.search ? normalizeSearchText(query.search) : '';
  const searched = search
    ? all.filter((row) =>
        normalizeSearchText([row.employee_name, row.employee_code, row.position_name ?? '', row.branch_name ?? '', row.area ?? ''].join(' ')).includes(
          search,
        ),
      )
    : all;
  const statusCounts: Record<DirectoryStatusFilter, number> = {
    ALL: searched.length,
    IN_PROGRESS: searched.filter((row) => matchesStatus(row, 'IN_PROGRESS')).length,
    STALLED: searched.filter((row) => matchesStatus(row, 'STALLED')).length,
    COMPLETED: searched.filter((row) => matchesStatus(row, 'COMPLETED')).length,
    ATTENTION: searched.filter((row) => matchesStatus(row, 'ATTENTION')).length,
  };
  const filtered = searched.filter((row) => matchesStatus(row, query.status));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const offset = (page - 1) * query.limit;
  return {
    rows: filtered.slice(offset, offset + query.limit),
    total,
    page,
    limit: query.limit,
    total_pages: totalPages,
    status_counts: statusCounts,
  };
};

export const queryInductionDirectory = async (query: DirectoryQuery): Promise<DirectoryPage> => {
  const [rows, competencies, counts, routes] = await Promise.all([
    loadProgramRosterRows(),
    loadInitialCompetencies(),
    loadPositionPhaseCounts(),
    loadInitialCompetencyRoutes(),
  ]);
  // Fase 7 por puesto: se exige un REH-REG-003 autorizado por cada puesto que acredito la Fase 6.
  const phase7Routes = new Map<number, { stage: InductionStage; total: number; passed: number }>();
  for (const [employeeId, entries] of routes) {
    const required = counts.get(`${employeeId}:6`)?.passed ?? entries.length;
    const stage = competencyRouteStage(entries, required);
    const passed = entries.filter((entry) => competencyStage(entry) === 'APROBADA').length;
    phase7Routes.set(employeeId, { stage, total: Math.max(required, entries.length), passed });
  }
  return filterDirectory(groupRosterByEmployee(collapsePositionRows(rows, counts), competencies, phase7Routes), query);
};
