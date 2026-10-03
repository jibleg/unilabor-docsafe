import pool from '../config/db';
import { toIsoDateTime } from '../utils/date-serialization';
import type { InductionStage } from './rh-induction-dashboard.service';

// -----------------------------------------------------------------------------
// Fase 7 de la Induccion: no tiene inscripcion; su instrumento es la
// evaluacion de competencia INICIAL (REH-REG-003). Aqui se lee su estado y se
// traduce a una etapa del tablero para verla junto a las Fases 1-6.
// -----------------------------------------------------------------------------

export const PHASE7_NUMBER = 7;

export interface CompetencySnapshot {
  evaluation_id: number;
  status: 'DRAFT' | 'CLOSED';
  evaluation_date: string | null;
  evaluator_name: string;
  final_pct: number | null;
  dictamen: string | null;
  authorization_result: string | null;
  closed_at: string | null;
}

/** Regla pura: etapa del tablero para la evaluacion de competencia inicial. */
export const competencyStage = (snapshot: CompetencySnapshot): InductionStage => {
  if (snapshot.status === 'DRAFT') return 'COMPETENCIA_EN_PROCESO';
  if (snapshot.dictamen === 'NO_COMPETENTE' || snapshot.authorization_result === 'NO_AUTORIZADO') return 'NO_ACREDITADA';
  if (snapshot.authorization_result === 'AUTORIZADO' || snapshot.authorization_result === 'AUTORIZADO_CON_SEGUIMIENTO') return 'APROBADA';
  return 'COMPETENCIA_POR_AUTORIZAR';
};

const dateOnly = (value: unknown): string | null =>
  value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : null;

export const mapCompetencySnapshot = (row: any): CompetencySnapshot => ({
  evaluation_id: Number(row.id),
  status: String(row.status) as 'DRAFT' | 'CLOSED',
  evaluation_date: dateOnly(row.evaluation_date),
  evaluator_name: String(row.evaluator_name ?? ''),
  final_pct: row.final_pct !== null && row.final_pct !== undefined ? Number(row.final_pct) : null,
  dictamen: row.dictamen ? String(row.dictamen) : null,
  authorization_result: row.authorization_result ? String(row.authorization_result) : null,
  closed_at: row.closed_at ? toIsoDateTime(row.closed_at) : null,
});

/** Evaluacion de competencia INICIAL mas reciente por colaborador (todos o los indicados). */
export const loadInitialCompetencies = async (employeeIds?: number[]): Promise<Map<number, CompetencySnapshot>> => {
  const result = await pool.query(
    `SELECT DISTINCT ON (employee_id) id, employee_id, status, evaluation_date, evaluator_name, final_pct, dictamen,
            authorization_result, closed_at
       FROM public.rh_competency_evaluations
      WHERE evaluation_type = 'INICIAL' ${employeeIds ? 'AND employee_id = ANY($1::bigint[])' : ''}
      ORDER BY employee_id, created_at DESC;`,
    employeeIds ? [employeeIds] : [],
  );
  return new Map(result.rows.map((row) => [Number(row.employee_id), mapCompetencySnapshot(row)]));
};
