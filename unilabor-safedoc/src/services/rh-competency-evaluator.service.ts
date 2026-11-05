import pool from '../config/db';
import {
  EVALUATOR_IS_PHASE6_SUPERVISOR_CODE,
  EVALUATOR_IS_PHASE6_SUPERVISOR_MESSAGE,
  findPhase6SupervisorConflict,
  pickProposedEvaluator,
  type PersonIdentity,
} from './rh-competency-evaluator.rules';
import type { ResolvedAreaResponsibleSource } from './rh-supervision-area-responsible.rules';
import { listAreaResponsiblesFor } from './rh-supervision-area-responsible.service';

// -----------------------------------------------------------------------------
// Evaluador del REH-REG-003: quien es, a quien propone el sistema y la regla
// "no puede ser el supervisor de la Fase 6" (solo evaluaciones INICIAL, que son
// la Fase 7). La decision la toma la regla pura de rh-competency-evaluator.rules.ts;
// aqui solo se cargan los datos.
// -----------------------------------------------------------------------------

const throwCoded = (code: string, publicMessage: string): never => {
  const error = new Error(code) as Error & { code: string; publicMessage: string };
  error.code = code;
  error.publicMessage = publicMessage;
  throw error;
};

/**
 * Quienes supervisaron al colaborador en ese puesto durante la Fase 6: el
 * supervisor asignado a su inscripcion vigente y el de cada lista ANA-REG-060
 * cerrada de la Fase 6 (puede haber mas de una y con distinto supervisor). Las
 * listas antiguas sin colaborador ligado aportan solo el nombre.
 */
export const loadPhase6Supervisors = async (employeeId: number, positionId: number): Promise<PersonIdentity[]> => {
  const result = await pool.query(
    `SELECT e.supervisor_employee_id AS employee_id, sup.full_name AS name
       FROM public.rh_induction_enrollments e
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
       JOIN public.employees sup ON sup.id = e.supervisor_employee_id
      WHERE e.employee_id = $1 AND e.position_id = $2 AND e.queue_status <> 'CANCELLED'
     UNION
     SELECT c.supervisor_employee_id, COALESCE(sup.full_name, c.supervisor_name)
       FROM public.rh_supervision_checklists c
       JOIN public.rh_induction_enrollments e ON e.id = c.enrollment_id
       JOIN public.rh_induction_phases p ON p.id = e.phase_id AND p.phase_number = 6
       LEFT JOIN public.employees sup ON sup.id = c.supervisor_employee_id
      WHERE c.employee_id = $1 AND c.position_id = $2 AND c.status = 'CLOSED';`,
    [employeeId, positionId],
  );
  return result.rows.map((row) => ({
    employee_id: row.employee_id ? Number(row.employee_id) : null,
    name: String(row.name ?? ''),
  }));
};

export interface EvaluatorInput {
  /** Colaborador elegido de la lista (su nombre se toma de la ficha). */
  employeeId?: number | null | undefined;
  /** Nombre en texto libre (solo cuando no se indica colaborador). */
  name?: string | null | undefined;
}

/** Hay un evaluador indicado (colaborador o nombre)? */
export const hasEvaluatorInput = (input: EvaluatorInput): boolean => typeof input.employeeId === 'number' || Boolean(input.name?.trim());

/**
 * Identidad del evaluador a guardar. Con colaborador, el nombre sale SIEMPRE de
 * su ficha (no del cliente): asi el nombre impreso y el colaborador comparado
 * son la misma persona. Sin colaborador queda el nombre capturado.
 */
export const resolveEvaluatorIdentity = async (input: EvaluatorInput): Promise<PersonIdentity> => {
  if (typeof input.employeeId !== 'number') {
    return { employee_id: null, name: input.name?.trim() ?? '' };
  }
  const result = await pool.query(`SELECT id, full_name FROM public.employees WHERE id = $1 AND is_active = TRUE LIMIT 1;`, [input.employeeId]);
  if (result.rows.length === 0) {
    return throwCoded('RH_COMP_EVAL_EVALUATOR_NOT_FOUND', 'El evaluador elegido no existe o esta dado de baja.');
  }
  return { employee_id: Number(result.rows[0].id), name: String(result.rows[0].full_name) };
};

export interface EvaluatorCheck {
  evaluationType: string;
  employeeId: number;
  positionId: number;
  evaluator: PersonIdentity;
}

/** Lanza si el evaluador de una evaluacion INICIAL fue el supervisor de la Fase 6 de ese colaborador y puesto. */
export const assertEvaluatorAllowed = async (check: EvaluatorCheck): Promise<void> => {
  if (check.evaluationType !== 'INICIAL' || (check.evaluator.employee_id === null && !check.evaluator.name.trim())) {
    return;
  }
  const supervisors = await loadPhase6Supervisors(check.employeeId, check.positionId);
  if (findPhase6SupervisorConflict(check.evaluator, supervisors)) {
    throwCoded(EVALUATOR_IS_PHASE6_SUPERVISOR_CODE, EVALUATOR_IS_PHASE6_SUPERVISOR_MESSAGE);
  }
};

export interface ProposedEvaluator {
  /** Null = nadie disponible en la cadena del area: la evaluacion queda sin evaluador. */
  evaluator: PersonIdentity | null;
  /** Nivel de la cadena del que salio (unidad, general o suplente). */
  source: ResolvedAreaResponsibleSource | null;
  /** El coordinador del area que correspondia fue el supervisor de la Fase 6 y se tomo al siguiente (o a nadie). */
  coordinator_was_supervisor: boolean;
}

/** Evaluador que el sistema propone para la REH-REG-003 INICIAL de un colaborador en un puesto. */
export const proposePhase7Evaluator = async (employeeId: number, positionId: number): Promise<ProposedEvaluator> => {
  const [chain, supervisors] = await Promise.all([listAreaResponsiblesFor(positionId, employeeId), loadPhase6Supervisors(employeeId, positionId)]);
  const chosen = pickProposedEvaluator(chain, supervisors);
  return {
    evaluator: chosen ? { employee_id: chosen.candidate.employee_id, name: chosen.candidate.name } : null,
    source: chosen?.source ?? null,
    coordinator_was_supervisor: chain.length > 0 && chosen?.candidate.employee_id !== chain[0]!.candidate.employee_id,
  };
};
