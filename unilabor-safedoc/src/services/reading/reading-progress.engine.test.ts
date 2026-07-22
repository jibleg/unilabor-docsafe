import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_HEARTBEAT_CREDIT_SECONDS,
  creditReadingHeartbeat,
  isValidPage,
  type ReadingProgressState,
} from './reading-progress.engine';

const NOW = 1_800_000_000_000;
const secondsAgo = (seconds: number): Date => new Date(NOW - seconds * 1000);

const state = (overrides: Partial<ReadingProgressState> = {}): ReadingProgressState => ({
  pages_total: 3,
  min_seconds_per_page: 7,
  current_page: null,
  current_page_seconds: 0,
  active_seconds: 0,
  pages_seen: [],
  last_progress_at: null,
  ...overrides,
});

describe('creditReadingHeartbeat', () => {
  it('no acredita nada en el primer latido de una pagina', () => {
    // Sin `last_progress_at` no hay contra que medir: el tiempo empieza a
    // contar a partir del segundo latido.
    const result = creditReadingHeartbeat(state(), 1, { nowMs: NOW });

    expect(result.current_page_seconds).toBe(0);
    expect(result.active_seconds).toBe(0);
    expect(result.pages_seen).toEqual([]);
    expect(result.status).toBe('in_progress');
  });

  it('acredita el tiempo real transcurrido mientras siga en la misma pagina', () => {
    const result = creditReadingHeartbeat(
      state({ current_page: 1, current_page_seconds: 3, active_seconds: 10, last_progress_at: secondsAgo(4) }),
      1,
      { nowMs: NOW },
    );

    expect(result.current_page_seconds).toBe(7);
    expect(result.active_seconds).toBe(14);
  });

  it('acota el credito de un solo latido: dejar la pestania abierta no acumula', () => {
    // Cuatro horas en segundo plano solo valen el techo por latido.
    const result = creditReadingHeartbeat(
      state({ current_page: 1, current_page_seconds: 0, last_progress_at: secondsAgo(14_400) }),
      1,
      { nowMs: NOW },
    );

    expect(result.current_page_seconds).toBe(DEFAULT_MAX_HEARTBEAT_CREDIT_SECONDS);
  });

  it('respeta un techo de credito propio del modulo', () => {
    const result = creditReadingHeartbeat(
      state({ current_page: 1, last_progress_at: secondsAgo(999) }),
      1,
      { nowMs: NOW, maxCreditSeconds: 5 },
    );

    expect(result.current_page_seconds).toBe(5);
  });

  it('reinicia el contador al cambiar de pagina: parquearse en la 1 no sirve', () => {
    const result = creditReadingHeartbeat(
      state({ current_page: 1, current_page_seconds: 60, active_seconds: 60, last_progress_at: secondsAgo(4) }),
      2,
      { nowMs: NOW },
    );

    // La pagina nueva arranca de cero, y el salto no acredita tiempo activo.
    expect(result.current_page_seconds).toBe(0);
    expect(result.active_seconds).toBe(60);
    expect(result.current_page).toBe(2);
  });

  it('califica la pagina al alcanzar la permanencia minima, y solo una vez', () => {
    const first = creditReadingHeartbeat(
      state({ current_page: 2, current_page_seconds: 6, last_progress_at: secondsAgo(4) }),
      2,
      { nowMs: NOW },
    );
    expect(first.pages_seen).toEqual([2]);

    const again = creditReadingHeartbeat(
      state({ current_page: 2, current_page_seconds: 30, pages_seen: [2], last_progress_at: secondsAgo(4) }),
      2,
      { nowMs: NOW },
    );
    expect(again.pages_seen).toEqual([2]);
  });

  it('pasa a read cuando se cubren todas las paginas, y devuelve el listado ordenado', () => {
    const result = creditReadingHeartbeat(
      state({
        current_page: 1,
        current_page_seconds: 7,
        pages_seen: [3, 2],
        last_progress_at: secondsAgo(4),
      }),
      1,
      { nowMs: NOW },
    );

    expect(result.pages_seen).toEqual([1, 2, 3]);
    expect(result.completed).toBe(true);
    expect(result.status).toBe('read');
  });

  it('ignora un reloj que va hacia atras en vez de restar tiempo', () => {
    const result = creditReadingHeartbeat(
      state({ current_page: 1, current_page_seconds: 5, last_progress_at: new Date(NOW + 60_000) }),
      1,
      { nowMs: NOW },
    );

    expect(result.current_page_seconds).toBe(5);
  });
});

describe('isValidPage', () => {
  it('acepta solo enteros dentro del documento', () => {
    expect(isValidPage(1, 3)).toBe(true);
    expect(isValidPage(3, 3)).toBe(true);
    expect(isValidPage(0, 3)).toBe(false);
    expect(isValidPage(4, 3)).toBe(false);
    expect(isValidPage(1.5, 3)).toBe(false);
    expect(isValidPage('2', 3)).toBe(false);
  });
});
