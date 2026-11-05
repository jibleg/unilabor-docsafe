import type { AreaResponsibleCandidate, ResolvedAreaResponsible } from './rh-supervision-area-responsible.rules';

// -----------------------------------------------------------------------------
// Regla pura (sin BD, testeable) del evaluador del REH-REG-003 INICIAL (Fase 7):
//
//   "El evaluador no puede ser el supervisor de la Fase 6, pero si puede ser el
//    coordinador del area."
//
// Quien superviso a ESE colaborador en ESE puesto durante la Fase 6 ya emitio
// su juicio en la lista ANA-REG-060; la evaluacion de competencia la aplica
// otra persona. La regla es la misma al abrir la evaluacion sola, cuando RH
// elige al evaluador desde la bandeja y cuando lo cambia en el borrador.
//
// Comparacion de personas: por colaborador (employee_id) cuando ambos lados lo
// tienen. Si alguno no lo tiene (evaluaciones anteriores a evaluator_employee_id
// o un evaluador capturado como texto), se compara el nombre normalizado, sin
// acentos, mayusculas ni espacios de mas. Es un respaldo: no detecta a la misma
// persona escrita distinto (p. ej. con titulo "Q.F.B.").
// -----------------------------------------------------------------------------

export const EVALUATOR_IS_PHASE6_SUPERVISOR_CODE = 'RH_COMP_EVAL_EVALUATOR_IS_PHASE6_SUPERVISOR';
export const EVALUATOR_IS_PHASE6_SUPERVISOR_MESSAGE =
  'El supervisor de la Fase 6 de este puesto no puede ser el evaluador de la Fase 7; elige al coordinador del area u otra persona.';

/** Una persona tal como quedo registrada: colaborador (si se conoce) y nombre. */
export interface PersonIdentity {
  employee_id: number | null;
  name: string;
}

const COMBINING_MARKS = /[̀-ͯ]/g;

export const normalizePersonName = (value: string): string =>
  value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Son la misma persona? Por colaborador si ambos lo tienen; si no, por nombre normalizado (no vacio). */
export const isSamePerson = (a: PersonIdentity, b: PersonIdentity): boolean => {
  if (a.employee_id !== null && b.employee_id !== null) {
    return a.employee_id === b.employee_id;
  }
  const name = normalizePersonName(a.name);
  return name !== '' && name === normalizePersonName(b.name);
};

/** El supervisor de la Fase 6 con el que choca el evaluador (null = evaluador permitido). */
export const findPhase6SupervisorConflict = (evaluator: PersonIdentity, phase6Supervisors: readonly PersonIdentity[]): PersonIdentity | null =>
  phase6Supervisors.find((supervisor) => isSamePerson(evaluator, supervisor)) ?? null;

/**
 * Evaluador que el sistema propone al abrir la evaluacion: el coordinador del
 * area (primer candidato valido de la cadena unidad -> general -> suplente). Si
 * ese fue el supervisor de la Fase 6 del puesto, se toma el siguiente de la
 * cadena. Null = nadie disponible: la evaluacion se abre sin evaluador y RH lo asigna.
 */
export const pickProposedEvaluator = <T extends AreaResponsibleCandidate>(
  areaResponsibles: readonly ResolvedAreaResponsible<T>[],
  phase6Supervisors: readonly PersonIdentity[],
): ResolvedAreaResponsible<T> | null =>
  areaResponsibles.find(
    ({ candidate }) => !findPhase6SupervisorConflict({ employee_id: candidate.employee_id, name: candidate.name }, phase6Supervisors),
  ) ?? null;
