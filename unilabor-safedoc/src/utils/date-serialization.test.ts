import { describe, expect, it } from 'vitest';
import { toIsoDate, toIsoDateTime } from './date-serialization';

describe('toIsoDate', () => {
  it('serializa un objeto Date a YYYY-MM-DD usando componentes locales', () => {
    // node-pg entrega columnas `date` como Date a medianoche local.
    const localMidnight = new Date(2026, 5, 12, 0, 0, 0); // 12-jun-2026
    expect(toIsoDate(localMidnight)).toBe('2026-06-12');
  });

  it('rellena con ceros mes y dia de un solo digito', () => {
    expect(toIsoDate(new Date(2026, 0, 3, 0, 0, 0))).toBe('2026-01-03');
  });

  it('devuelve los strings ISO tal cual', () => {
    expect(toIsoDate('2026-06-12')).toBe('2026-06-12');
  });
});

describe('toIsoDateTime', () => {
  it('serializa un objeto Date a ISO 8601 completo', () => {
    const date = new Date('2026-06-12T18:44:17.020Z');
    expect(toIsoDateTime(date)).toBe('2026-06-12T18:44:17.020Z');
  });

  it('devuelve los strings tal cual', () => {
    expect(toIsoDateTime('2026-06-12T18:44:17.020Z')).toBe('2026-06-12T18:44:17.020Z');
  });
});
