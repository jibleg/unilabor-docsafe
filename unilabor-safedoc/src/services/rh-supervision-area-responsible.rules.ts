// -----------------------------------------------------------------------------
// Regla pura (sin BD, testeable) que decide quien firma como Responsable del
// Area. Es la UNICA regla: la usan la Fase 6 (lista ANA-REG-060) y la Fase 7
// (REH-REG-003 y carta REH-REG-008).
//
// El responsable por unidad es una excepcion opcional sobre el general:
//   1. UNIT       responsable propio de (unidad de la ficha del evaluado, area)
//   2. GENERAL    responsable general del area
//   3. ALTERNATE  suplente general del area
//   4. ninguno    queda vacio (la lista no se puede enviar a firma)
//
// Candidato valido = colaborador activo y distinto del evaluado (nadie avala su
// propia supervision). Un candidato SIN usuario de sistema NO se salta: se
// elige igual y el envio a firma lo reporta; saltarlo ocultaria el problema.
// -----------------------------------------------------------------------------

/** De que nivel salio el responsable de una lista (MANUAL = elegido en la lista de una supervision de area). */
export type AreaResponsibleSource = 'UNIT' | 'GENERAL' | 'ALTERNATE' | 'MANUAL';
export type ResolvedAreaResponsibleSource = Exclude<AreaResponsibleSource, 'MANUAL'>;

export interface AreaResponsibleCandidate {
  employee_id: number;
  name: string;
  is_active: boolean;
}

/** Configuracion de un area del proceso: general, suplente y responsables propios por unidad. */
export interface AreaSignatoryConfig<T extends AreaResponsibleCandidate = AreaResponsibleCandidate> {
  general: T | null;
  alternate: T | null;
  /** unit_id -> responsable propio de la unidad (sin entrada = hereda del general). */
  units: ReadonlyMap<number, T>;
}

export interface ResolvedAreaResponsible<T extends AreaResponsibleCandidate = AreaResponsibleCandidate> {
  candidate: T;
  source: ResolvedAreaResponsibleSource;
}

/**
 * Todos los candidatos validos de la cadena, en orden (unidad, general,
 * suplente). El primero es el responsable del area; los demas son el relevo
 * cuando una regla adicional descarta al primero (Fase 7: el evaluador
 * propuesto no puede ser el supervisor de la Fase 6).
 * @param area configuracion del area del proceso del puesto (undefined/null = puesto sin area: nadie responde)
 * @param unitId unidad de la ficha del evaluado (null = sin sucursal: salta el nivel UNIT)
 * @param evaluatedEmployeeId colaborador evaluado (null = sin evaluado concreto, p. ej. la vista de configuracion)
 */
export const listValidAreaResponsibles = <T extends AreaResponsibleCandidate>(
  area: AreaSignatoryConfig<T> | null | undefined,
  unitId: number | null,
  evaluatedEmployeeId: number | null,
): ResolvedAreaResponsible<T>[] => {
  if (!area) return [];
  const chain: Array<[ResolvedAreaResponsibleSource, T | null]> = [
    ['UNIT', unitId === null ? null : (area.units.get(unitId) ?? null)],
    ['GENERAL', area.general],
    ['ALTERNATE', area.alternate],
  ];
  const valid: ResolvedAreaResponsible<T>[] = [];
  for (const [source, candidate] of chain) {
    if (candidate && candidate.is_active && candidate.employee_id !== evaluatedEmployeeId) {
      valid.push({ candidate, source });
    }
  }
  return valid;
};

/** Elige al responsable del area para un evaluado: el primer candidato valido de la cadena. */
export const resolveAreaResponsible = <T extends AreaResponsibleCandidate>(
  area: AreaSignatoryConfig<T> | null | undefined,
  unitId: number | null,
  evaluatedEmployeeId: number | null,
): ResolvedAreaResponsible<T> | null => listValidAreaResponsibles(area, unitId, evaluatedEmployeeId)[0] ?? null;

/** Responsable que guarda una lista en borrador. */
export interface DraftAreaResponsible {
  employee_id: number | null;
  name: string;
  source: AreaResponsibleSource | null;
}

/**
 * Responsable que debe quedar en un borrador tras sincronizarlo.
 *   * Fase 6 (con inscripcion): siempre el resuelto. Si la configuracion no resuelve a
 *     nadie, se conserva el que RH eligio a mano para esa lista al enviarla a firma
 *     (MANUAL); sin eleccion manual queda vacio.
 *   * Supervision de area (sin inscripcion): se respeta el elegido a mano en la
 *     lista, y si la configuracion no resuelve a nadie se conserva lo que tenga.
 */
export const nextDraftAreaResponsible = (
  current: DraftAreaResponsible,
  hasEnrollment: boolean,
  resolved: ResolvedAreaResponsible | null,
): DraftAreaResponsible => {
  if (!hasEnrollment && (current.source === 'MANUAL' || !resolved)) {
    return current;
  }
  if (hasEnrollment && !resolved && current.source === 'MANUAL' && current.employee_id) {
    return current;
  }
  return resolved
    ? { employee_id: resolved.candidate.employee_id, name: resolved.candidate.name, source: resolved.source }
    : { employee_id: null, name: '', source: null };
};
