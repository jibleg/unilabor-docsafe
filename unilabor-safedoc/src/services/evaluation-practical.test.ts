import { describe, expect, it } from 'vitest';
import { resolvePracticalOutcome } from './evaluation-practical.service';

/**
 * Sprint 40 (EVAL-102) - Resolucion de la nota practica (helper puro).
 * Escala 0-10, umbral por defecto 8 (= passing_score 80). La constancia se emite
 * solo cuando el resultado queda 'passed'.
 */
describe('resolvePracticalOutcome', () => {
  it('acredita con nota exactamente en el umbral (8 -> 80%)', () => {
    const outcome = resolvePracticalOutcome(8, 80);
    expect(outcome.percentage).toBe(80);
    expect(outcome.passed).toBe(true);
    expect(outcome.status).toBe('passed');
  });

  it('no acredita con nota justo por debajo del umbral (7.9 -> 79%)', () => {
    const outcome = resolvePracticalOutcome(7.9, 80);
    expect(outcome.percentage).toBe(79);
    expect(outcome.passed).toBe(false);
    expect(outcome.status).toBe('failed');
  });

  it('convierte notas con un decimal a porcentaje entero (8.5 -> 85%)', () => {
    const outcome = resolvePracticalOutcome(8.5, 80);
    expect(outcome.percentage).toBe(85);
    expect(outcome.passed).toBe(true);
  });

  it('acredita la nota maxima (10 -> 100%)', () => {
    const outcome = resolvePracticalOutcome(10, 80);
    expect(outcome.percentage).toBe(100);
    expect(outcome.status).toBe('passed');
  });

  it('no acredita el minimo (0 -> 0%)', () => {
    const outcome = resolvePracticalOutcome(0, 80);
    expect(outcome.percentage).toBe(0);
    expect(outcome.status).toBe('failed');
  });

  it('respeta un umbral personalizado del template (nota 7 con passing 70)', () => {
    const outcome = resolvePracticalOutcome(7, 70);
    expect(outcome.passed).toBe(true);
  });
});
