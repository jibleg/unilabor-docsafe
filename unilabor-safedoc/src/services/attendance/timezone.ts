import type { DateString, LocalMs } from './engine/time';
import { localMsToDate } from './engine/time';

/**
 * Conversion entre instantes reales (Date / timestamptz) y la "hora local de
 * pared" que usa el motor (LocalMs), segun una zona IANA configurable.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
};

/** Instante real -> hora local de pared en la zona (LocalMs). */
export const instantToLocalMs = (instant: Date, timeZone: string): LocalMs => {
  const parts = getFormatter(timeZone).formatToParts(instant);
  const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return (
    Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second')) +
    instant.getMilliseconds()
  );
};

/** Hora local de pared (LocalMs) -> instante real en la zona. */
export const localMsToInstant = (localMs: LocalMs, timeZone: string): Date => {
  // Primer intento: tratar la hora local como UTC y corregir por el desfase de la zona.
  let guess = new Date(localMs);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const offset = instantToLocalMs(guess, timeZone) - guess.getTime();
    guess = new Date(localMs - offset);
  }
  return guess;
};

/** Fecha calendario local ('YYYY-MM-DD') de un instante en la zona. */
export const instantToLocalDate = (instant: Date, timeZone: string): DateString =>
  localMsToDate(instantToLocalMs(instant, timeZone));

export const todayInZone = (timeZone: string, now: Date = new Date()): DateString =>
  instantToLocalDate(now, timeZone);
