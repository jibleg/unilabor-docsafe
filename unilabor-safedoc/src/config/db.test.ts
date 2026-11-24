import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import pool from './db';

// Un EventEmitter que emite 'error' sin listener lanza la excepcion: en produccion
// eso terminaba el proceso cada vez que la BD cortaba la conexion.
describe('pool de la BD ante la perdida de conexion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no lanza cuando una conexion inactiva del pool falla', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => pool.emit('error', new Error('read ETIMEDOUT'), {} as never)).not.toThrow();
  });

  it('no lanza cuando una conexion en uso falla entre dos consultas', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new EventEmitter();

    pool.emit('connect', client as never);

    expect(() => client.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
  });

  it('deja rastro en el log sin repetir la misma causa en el mismo minuto', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(120_000);
      pool.emit('error', new Error('uno'), {} as never);
      pool.emit('error', new Error('dos'), {} as never);
      expect(errorSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(61_000);
      pool.emit('error', new Error('tres'), {} as never);
      expect(errorSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
