// -----------------------------------------------------------------------------
// Motor de avance de lectura, compartido por los acuses de RH y la sala de
// lectura de Calidad.
//
// Es deliberadamente PURO: no toca la base de datos ni el reloj global. Toda la
// contabilidad la hace el SERVIDOR a partir de `last_progress_at`; el cliente
// solo reporta en que pagina esta, nunca cuantos segundos lleva. Si reportara
// segundos, bastaria un POST con un numero grande para saltarse el gate.
// -----------------------------------------------------------------------------

/** Cadencia con la que el visor emite latidos. */
export const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 4;

/**
 * Techo de credito por latido: si entre dos latidos pasa mas que esto (pestania
 * en segundo plano, equipo suspendido, red caida) se acredita solo este maximo,
 * asi que dejar el documento abierto toda la tarde no acumula lectura. Se
 * deriva de la cadencia para que ambos valores no se separen con el tiempo.
 */
export const DEFAULT_MAX_HEARTBEAT_CREDIT_SECONDS = DEFAULT_HEARTBEAT_INTERVAL_SECONDS * 3;

export interface CreditHeartbeatOptions {
  /** Reloj del servidor. Parametrizable solo para poder probarlo. */
  nowMs?: number;
  maxCreditSeconds?: number;
}

export interface ReadingProgressState {
  pages_total: number;
  min_seconds_per_page: number;
  current_page: number | null;
  current_page_seconds: number;
  active_seconds: number;
  pages_seen: number[];
  last_progress_at: Date | string | null;
}

export interface ReadingProgressResult {
  current_page: number;
  current_page_seconds: number;
  active_seconds: number;
  /** Paginas que YA calificaron, ordenadas. */
  pages_seen: number[];
  completed: boolean;
  status: 'in_progress' | 'read';
}

export const isValidPage = (page: unknown, pagesTotal: number): boolean =>
  Number.isInteger(page) && (page as number) >= 1 && (page as number) <= pagesTotal;

const toMillis = (value: Date | string | null): number | null => {
  if (!value) {
    return null;
  }
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

/**
 * Acredita un latido del visor: "el lector sigue viendo la pagina N".
 *
 * El credito es la diferencia real contra `last_progress_at`, acotada por
 * MAX_HEARTBEAT_CREDIT_SECONDS. Cambiar de pagina reinicia el contador de la
 * pagina actual, asi que parquearse en la pagina 1 no acumula nada para el
 * resto. Una pagina entra en `pages_seen` solo cuando acumulo la permanencia
 * minima, y cuando `pages_seen` cubre todas las paginas la lectura pasa a
 * 'read', que es lo unico que habilita firmar.
 */
export const creditReadingHeartbeat = (
  state: ReadingProgressState,
  page: number,
  options: CreditHeartbeatOptions = {},
): ReadingProgressResult => {
  const nowMs = options.nowMs ?? Date.now();
  const maxCreditSeconds = options.maxCreditSeconds ?? DEFAULT_MAX_HEARTBEAT_CREDIT_SECONDS;

  const samePage = state.current_page !== null && Number(state.current_page) === page;
  const lastProgressAt = toMillis(state.last_progress_at);

  const elapsedSeconds =
    samePage && lastProgressAt !== null
      ? Math.max(0, Math.min(Math.floor((nowMs - lastProgressAt) / 1000), maxCreditSeconds))
      : 0;

  const currentPageSeconds =
    (samePage ? Number(state.current_page_seconds) : 0) + elapsedSeconds;
  const activeSeconds = Number(state.active_seconds) + elapsedSeconds;

  const pagesSeen = Array.isArray(state.pages_seen) ? state.pages_seen.map(Number) : [];
  if (currentPageSeconds >= Number(state.min_seconds_per_page) && !pagesSeen.includes(page)) {
    pagesSeen.push(page);
  }

  const completed = pagesSeen.length >= Number(state.pages_total);

  return {
    current_page: page,
    current_page_seconds: currentPageSeconds,
    active_seconds: activeSeconds,
    pages_seen: pagesSeen.sort((a, b) => a - b),
    completed,
    status: completed ? 'read' : 'in_progress',
  };
};
