import { registerAuditEvent } from './audit.service';
import { resolveFallbackUserId } from './rh-induction-closure.service';
import { describePhase7Evaluator, loadTransitionRows, openPhase7Evaluation, type OpenedPhase7Evaluation } from './rh-induction-transition.service';

// -----------------------------------------------------------------------------
// Arranque automatico de la Fase 7 (analogo a tryAutoStartPhase6).
//
// La Fase 7 no tiene inscripcion: es la evaluacion de competencia REH-REG-003
// INICIAL, en borrador, una por puesto y en el orden de la Fase 6. Se abre sola:
//   (a) cuando el colaborador acredita la Fase 6 de TODOS sus puestos (al
//       capturarse la practica del ultimo: cierre de la lista ANA-REG-060 o
//       captura manual de RH), la del primer puesto;
//   (b) cuando la REH-REG-003 INICIAL de un puesto queda autorizada, la del
//       siguiente puesto, hasta terminar.
//
// No hay logica propia: usa la misma fila de la bandeja de avance (misma regla
// evaluateTransition) y la misma apertura que RH (openPhase7Evaluation). Solo
// abre si la fila esta LISTA; si esta bloqueada (p. ej. puesto sin competencias
// en el catalogo) no hace nada y el caso queda visible en la bandeja para RH.
//
// Idempotente: una fila con evaluacion en proceso no esta LISTA, y el indice
// unico ux_rh_comp_eval_inicial_open rechaza la segunda de dos ejecuciones
// simultaneas (que se reporta como "ya abierta"). Nunca lanza: un fallo aqui no
// invalida el cierre de la lista ni la autorizacion que lo dispararon.
// -----------------------------------------------------------------------------

export type Phase7AutoStartTrigger = 'PHASE6_COMPLETED' | 'COMPETENCY_AUTHORIZED';

export type Phase7AutoStartStatus =
  /** Se abrio ahora la evaluacion del puesto. */
  | 'OPENED'
  /** Ya habia una evaluacion INICIAL en proceso (otra ejecucion o RH la abrieron antes). */
  | 'ALREADY_OPEN'
  /** Aun no toca: le faltan puestos de la Fase 6 o ya no tiene evaluaciones por abrir. */
  | 'NOT_DUE'
  /** Le toca, pero la bandeja lo marca bloqueado (motivo en `detail`); RH la abre al resolverlo. */
  | 'BLOCKED'
  /** Le tocaba y fallo la apertura (motivo en `detail`); queda LISTO en la bandeja de RH. */
  | 'FAILED';

export interface Phase7AutoStartOutcome {
  status: Phase7AutoStartStatus;
  evaluation_id: number | null;
  position_code: string | null;
  /** Solo OPENED: con que evaluador quedo. */
  opened: OpenedPhase7Evaluation | null;
  /** Motivo cuando no se abrio. */
  detail: string | null;
}

const outcome = (status: Phase7AutoStartStatus, patch: Partial<Phase7AutoStartOutcome> = {}): Phase7AutoStartOutcome => ({
  status,
  evaluation_id: null,
  position_code: null,
  opened: null,
  detail: null,
  ...patch,
});

/**
 * Abre, si ya le toca, la REH-REG-003 INICIAL del siguiente puesto del
 * colaborador. `actorUserId` es quien disparo el evento (queda como autor del
 * borrador); sin el se usa el usuario de respaldo del motor.
 */
export const tryAutoStartPhase7 = async (
  employeeId: number,
  actorUserId: string | null,
  trigger: Phase7AutoStartTrigger,
): Promise<Phase7AutoStartOutcome> => {
  let positionCode: string | null = null;
  try {
    const row = (await loadTransitionRows(7, [employeeId]))[0];
    if (!row) {
      return outcome('NOT_DUE');
    }
    positionCode = row.position_code;
    if (row.state === 'STARTED') {
      return outcome('ALREADY_OPEN', { evaluation_id: row.competency?.evaluation_id ?? null, position_code: positionCode });
    }
    if (row.state === 'BLOCKED') {
      const detail = row.blocks.map((block) => block.detail).join(' ');
      // Con puestos de la Fase 6 por acreditar todavia no es su momento: no es un caso para RH.
      const waitingPhase6 = row.blocks.some((block) => block.reason === 'PUESTOS_PENDIENTES');
      if (!waitingPhase6) {
        console.info(`Induccion Fase 7: no se abrio sola la REH-REG-003 del colaborador ${employeeId} (${positionCode ?? 'sin puesto'}): ${detail}`);
      }
      return outcome(waitingPhase6 ? 'NOT_DUE' : 'BLOCKED', { position_code: positionCode, detail });
    }
    const actor = actorUserId ?? (await resolveFallbackUserId());
    if (!actor) {
      return outcome('FAILED', { position_code: positionCode, detail: 'No hay un usuario activo que registre la apertura.' });
    }
    const opened = await openPhase7Evaluation(row, { actorUserId: actor });
    await registerAuditEvent({
      user_id: actor,
      action: `RH_INDUCTION_COMPETENCY_AUTO_STARTED:${opened.evaluation_id}`,
      module_code: 'RH',
      entity_type: 'competency_evaluation',
      entity_id: opened.evaluation_id,
      employee_id: employeeId,
      metadata: {
        to_phase_number: 7,
        source: 'AUTO_START',
        trigger,
        position_id: row.position_id,
        from_enrollment_id: row.previous_enrollment_id,
        evaluator_employee_id: opened.evaluator_employee_id,
        evaluator_origin: opened.evaluator_origin,
        coordinator_was_supervisor: opened.coordinator_was_supervisor,
      },
    });
    console.info(
      `Induccion Fase 7: se abrio sola la REH-REG-003 ${opened.evaluation_id} del colaborador ${employeeId} ` +
        `(puesto ${opened.position_code}, evaluador ${opened.evaluator_name || 'sin asignar'}, origen ${trigger}).`,
    );
    return outcome('OPENED', { evaluation_id: opened.evaluation_id, position_code: opened.position_code, opened });
  } catch (error: any) {
    // Dos ejecuciones a la vez: la otra gano el indice unico y ya la abrio.
    if (error?.code === 'RH_COMP_EVAL_INICIAL_ALREADY_OPEN') {
      return outcome('ALREADY_OPEN', { position_code: positionCode });
    }
    console.error(`No se pudo abrir automaticamente la Fase 7 (REH-REG-003) del colaborador ${employeeId}:`, error);
    return outcome('FAILED', { position_code: positionCode, detail: error?.publicMessage || 'Error inesperado al abrir la evaluacion.' });
  }
};

const BANDEJA = 'la bandeja de avance del tablero de Induccion';

/** Que paso con la Fase 7 tras el evento que la dispara (texto para quien cerro la lista o autorizo). Regla pura. */
export const describePhase7AutoStart = (result: Phase7AutoStartOutcome | null): string => {
  if (!result) return '';
  const position = result.position_code ? ` del puesto ${result.position_code}` : '';
  switch (result.status) {
    case 'OPENED':
      return `Se abrio sola su evaluacion de competencia REH-REG-003 (Fase 7)${position}, en borrador. ${result.opened ? describePhase7Evaluator(result.opened) : ''}`.trim();
    case 'ALREADY_OPEN':
      return `Ya tiene en proceso su evaluacion de competencia REH-REG-003 (Fase 7)${position}.`;
    case 'BLOCKED':
      return `No se pudo abrir sola su evaluacion de competencia (Fase 7): ${result.detail ?? 'el puesto no esta listo.'} RH puede abrirla desde ${BANDEJA} cuando se resuelva.`;
    case 'FAILED':
      return `No se pudo abrir sola su evaluacion de competencia (Fase 7)${position}: ${result.detail ?? 'error inesperado.'} RH puede abrirla desde ${BANDEJA}.`;
    case 'NOT_DUE':
      return result.detail ? `Su evaluacion de competencia (Fase 7) aun no se abre: ${result.detail}` : '';
  }
};
