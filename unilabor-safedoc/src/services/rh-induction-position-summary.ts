import pool from '../config/db';
import type { InductionRosterRow, InductionStage } from './rh-induction-dashboard.service';
import { competencyStage, mapCompetencySnapshot, type CompetencySnapshot } from './rh-induction-phase7';

// -----------------------------------------------------------------------------
// Resumen de la ruta por puesto para el Tablero (directorio, panorama, 360).
// En las Fases 5-6 un colaborador tiene una inscripcion por puesto; el tablero
// muestra UNA celda por fase con el puesto en curso y el avance "N de M".
// En la Fase 7, un REH-REG-003 INICIAL por puesto.
// -----------------------------------------------------------------------------

export interface PositionPhaseCount {
  total: number;
  passed: number;
  queued: number;
}

const key = (employeeId: number, phaseNumber: number): string => `${employeeId}:${phaseNumber}`;

/** Inscripciones vigentes por (colaborador, fase por puesto): total, acreditadas y en cola. */
export const loadPositionPhaseCounts = async (employeeIds?: number[]): Promise<Map<string, PositionPhaseCount>> => {
  const result = await pool.query(
    `SELECT e.employee_id, p.phase_number, COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ea.status = 'passed')::int AS passed,
            COUNT(*) FILTER (WHERE e.queue_status = 'QUEUED')::int AS queued
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.scope = 'POSITION'
       LEFT JOIN public.evaluation_assignments ea ON ea.id = e.evaluation_assignment_id
      WHERE e.queue_status <> 'CANCELLED' AND e.position_id IS NOT NULL
        ${employeeIds ? 'AND e.employee_id = ANY($1::bigint[])' : ''}
      GROUP BY e.employee_id, p.phase_number;`,
    employeeIds ? [employeeIds] : [],
  );
  return new Map(
    result.rows.map((row) => [
      key(Number(row.employee_id), Number(row.phase_number)),
      { total: Number(row.total), passed: Number(row.passed), queued: Number(row.queued) },
    ]),
  );
};

/**
 * Regla pura: deja UNA fila por (colaborador, fase por puesto) — la del puesto
 * en curso (o la ultima acreditada) — con el avance de sus puestos. Si acredito
 * todos los activos pero aun hay puestos en cola, la etapa es SIGUIENTE_PUESTO
 * (la fase no esta aprobada mientras falten puestos).
 */
export const collapsePositionRows = (rows: InductionRosterRow[], counts: Map<string, PositionPhaseCount>): InductionRosterRow[] => {
  const result: InductionRosterRow[] = [];
  const grouped = new Map<string, InductionRosterRow[]>();
  for (const row of rows) {
    if (row.position_sequence === null) {
      result.push(row);
      continue;
    }
    const k = key(row.employee_id, row.phase_number);
    grouped.set(k, [...(grouped.get(k) ?? []), row]);
  }
  for (const [k, list] of grouped) {
    const ordered = [...list].sort((a, b) => (a.position_sequence ?? 0) - (b.position_sequence ?? 0));
    const current = ordered.find((row) => row.stage !== 'APROBADA') ?? ordered[ordered.length - 1]!;
    const count = counts.get(k) ?? { total: ordered.length, passed: ordered.filter((row) => row.stage === 'APROBADA').length, queued: 0 };
    const allPassed = count.passed >= count.total;
    const stage: InductionStage = current.stage === 'APROBADA' && !allPassed ? 'SIGUIENTE_PUESTO' : current.stage;
    result.push({ ...current, stage, positions_total: count.total, positions_passed: count.passed });
  }
  return result;
};

export interface CompetencyRouteEntry extends CompetencySnapshot {
  position_id: number;
}

/** REH-REG-003 INICIAL mas reciente por (colaborador, puesto). */
export const loadInitialCompetencyRoutes = async (employeeIds?: number[]): Promise<Map<number, CompetencyRouteEntry[]>> => {
  const result = await pool.query(
    `SELECT DISTINCT ON (employee_id, position_id) id, employee_id, position_id, status, evaluation_date, evaluator_name,
            final_pct, dictamen, authorization_result, closed_at
       FROM public.rh_competency_evaluations
      WHERE evaluation_type = 'INICIAL' ${employeeIds ? 'AND employee_id = ANY($1::bigint[])' : ''}
      ORDER BY employee_id, position_id, created_at DESC;`,
    employeeIds ? [employeeIds] : [],
  );
  const routes = new Map<number, CompetencyRouteEntry[]>();
  for (const row of result.rows) {
    const employeeId = Number(row.employee_id);
    routes.set(employeeId, [...(routes.get(employeeId) ?? []), { ...mapCompetencySnapshot(row), position_id: Number(row.position_id) }]);
  }
  return routes;
};

/**
 * Regla pura: etapa de la Fase 7 de un colaborador con su ruta de competencia
 * por puesto. `positionsRequired` = puestos que acreditaron la Fase 6.
 */
export const competencyRouteStage = (entries: CompetencyRouteEntry[], positionsRequired: number): InductionStage => {
  const stages = entries.map((entry) => competencyStage(entry));
  const inProcess = stages.find((stage) => stage !== 'APROBADA');
  if (inProcess) return inProcess;
  const approved = stages.filter((stage) => stage === 'APROBADA').length;
  return approved >= Math.max(1, positionsRequired) ? 'APROBADA' : 'SIGUIENTE_PUESTO';
};
