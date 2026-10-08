// -----------------------------------------------------------------------------
// Reglas puras de la ruta por puesto (Fases 5 y 6) — sin BD, testeables.
//
// Decision RH (2026-10-07): las fases por puesto se cursan por CADA puesto
// activo del colaborador, un puesto tras otro y sin descanso entre ellos; solo
// se avanza a la fase siguiente cuando TODOS los puestos aprobaron la anterior.
// -----------------------------------------------------------------------------

export type TrackQueueStatus = 'QUEUED' | 'ACTIVE' | 'CANCELLED';

export interface TrackEntry {
  enrollment_id: number;
  position_id: number;
  sequence: number;
  queue_status: TrackQueueStatus;
  /** La evaluacion de la inscripcion quedo acreditada (status 'passed'). */
  passed: boolean;
}

export interface TrackPosition {
  position_id: number;
  /** Fecha de asignacion del puesto al colaborador (ISO). */
  assigned_at: string;
  code: string;
}

export interface TrackChanges {
  /** Inscripciones no aprobadas cuyo puesto ya no esta activo: baja logica. */
  toCancel: number[];
  /** Puestos elegibles sin inscripcion vigente: se forman al final de la cola, en este orden. */
  toQueue: number[];
}

const isOpen = (entry: TrackEntry): boolean => entry.queue_status !== 'CANCELLED';

/** Orden natural de una ruta nueva: el puesto mas antiguo primero (empate: codigo). */
export const orderPositions = (positions: TrackPosition[]): TrackPosition[] =>
  [...positions].sort(
    (a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime() || a.code.localeCompare(b.code),
  );

/**
 * Que hay que cambiar para que la ruta refleje los puestos vigentes:
 * - se dan de baja (logica) las inscripciones NO aprobadas de puestos que ya no
 *   estan activos (las aprobadas se conservan: son evidencia y su constancia
 *   sigue vigente);
 * - se forman al final los puestos elegibles que no tienen inscripcion vigente.
 */
export const planTrackChanges = (entries: TrackEntry[], eligible: TrackPosition[]): TrackChanges => {
  const eligibleIds = new Set(eligible.map((position) => position.position_id));
  const toCancel = entries
    .filter((entry) => isOpen(entry) && !entry.passed && !eligibleIds.has(entry.position_id))
    .map((entry) => entry.enrollment_id);
  const covered = new Set(entries.filter(isOpen).map((entry) => entry.position_id));
  const toQueue = orderPositions(eligible)
    .filter((position) => !covered.has(position.position_id))
    .map((position) => position.position_id);
  return { toCancel, toQueue };
};

/** Hay un puesto en curso (activo y aun sin acreditar): el siguiente espera. */
export const hasPositionInProgress = (entries: TrackEntry[]): boolean =>
  entries.some((entry) => entry.queue_status === 'ACTIVE' && !entry.passed);

/** Puestos en cola en el orden en que deben activarse. */
export const queuedInOrder = (entries: TrackEntry[]): TrackEntry[] =>
  entries.filter((entry) => entry.queue_status === 'QUEUED').sort((a, b) => a.sequence - b.sequence);

/**
 * La fase esta completa para el colaborador cuando CADA puesto elegible tiene
 * una inscripcion vigente acreditada y no queda nada en cola ni en curso.
 */
export const isTrackComplete = (entries: TrackEntry[], eligible: TrackPosition[]): boolean => {
  if (eligible.length === 0) {
    return false;
  }
  const passedPositions = new Set(entries.filter((entry) => isOpen(entry) && entry.passed).map((entry) => entry.position_id));
  const pending = entries.some((entry) => isOpen(entry) && !entry.passed);
  return !pending && eligible.every((position) => passedPositions.has(position.position_id));
};

/** Siguiente numero de secuencia disponible en la ruta. */
export const nextSequence = (entries: TrackEntry[]): number =>
  entries.reduce((max, entry) => Math.max(max, entry.sequence), 0) + 1;
