import { describe, expect, it } from 'vitest';
import { evaluateTiming, REMINDER_WINDOW_HOURS } from './evaluation-scheduler.service';

const HOUR = 60 * 60 * 1000;
const now = 1_000_000_000_000; // reloj fijo inyectado

describe('evaluateTiming', () => {
  it('marca vencida cuando el deadline ya paso', () => {
    expect(evaluateTiming(now - HOUR, false, now)).toEqual({ expired: true, needsReminder: false });
  });

  it('marca vencida exactamente en el deadline', () => {
    expect(evaluateTiming(now, false, now)).toEqual({ expired: true, needsReminder: false });
  });

  it('necesita recordatorio si faltan <= 24h y no se envio', () => {
    expect(evaluateTiming(now + 10 * HOUR, false, now)).toEqual({ expired: false, needsReminder: true });
  });

  it('no repite el recordatorio si ya se envio', () => {
    expect(evaluateTiming(now + 10 * HOUR, true, now)).toEqual({ expired: false, needsReminder: false });
  });

  it('no recuerda si falta mas que la ventana', () => {
    expect(evaluateTiming(now + (REMINDER_WINDOW_HOURS + 5) * HOUR, false, now)).toEqual({
      expired: false,
      needsReminder: false,
    });
  });

  it('recuerda justo en el limite de la ventana', () => {
    expect(evaluateTiming(now + REMINDER_WINDOW_HOURS * HOUR, false, now)).toEqual({
      expired: false,
      needsReminder: true,
    });
  });
});
