// Recuperacion ante "chunk viejo": cada deploy hace rm -rf del dist y los
// bundles llevan hash en el nombre, asi que una pestana abierta antes del
// deploy que intenta cargar por primera vez una pagina lazy recibe 404 en el
// import() y React se desmonta completo (pantalla en blanco hasta un F5).
// Aqui se detecta ese caso y se recarga una sola vez para tomar el index.html
// nuevo; el candado en sessionStorage evita un bucle de recargas si el fallo
// persiste (p. ej. sin red).

const RELOAD_FLAG_KEY = 'safedoc:chunk-reload-at';
const RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /loading (css )?chunk [\w-]+ failed/i,
];

export const isChunkLoadError = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

const readReloadAt = (): number => {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_FLAG_KEY) ?? 0);
  } catch {
    return 0;
  }
};

const writeReloadAt = (value: number) => {
  try {
    window.sessionStorage.setItem(RELOAD_FLAG_KEY, String(value));
  } catch {
    // sessionStorage bloqueado: se intenta recargar igual, sin candado.
  }
};

/**
 * Recarga la pagina para tomar el bundle nuevo. Devuelve false si ya se
 * recargo hace menos de un minuto (el fallo no es por deploy) para que el
 * llamador muestre un mensaje en lugar de recargar en bucle.
 */
export const reloadForFreshBundle = (): boolean => {
  const now = Date.now();
  if (now - readReloadAt() < RELOAD_WINDOW_MS) {
    return false;
  }
  writeReloadAt(now);
  window.location.reload();
  return true;
};
