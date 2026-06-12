/**
 * Serializacion de fechas para respuestas de API.
 *
 * node-pg parsea las columnas `date` a objetos `Date` (medianoche local) y las
 * `timestamptz` tambien a `Date`. Usar `String(value)` sobre ellas produce el
 * formato locale del runtime ("Fri Jun 12 2026 00:00:00 GMT-0600 ...") que rompe
 * el formateo ISO que espera el frontend (p. ej. `value.slice(0, 10)`). Estos
 * helpers garantizan salida ISO consistente.
 */

/** Columnas `date` -> `YYYY-MM-DD` (usa componentes locales para evitar el desfase de zona horaria). */
export const toIsoDate = (value: unknown): string => {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value);
};

/** Columnas `timestamp` / `timestamptz` -> ISO 8601 completo. */
export const toIsoDateTime = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
};
