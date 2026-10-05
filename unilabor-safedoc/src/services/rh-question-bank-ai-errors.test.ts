import { describe, expect, it } from 'vitest';
import { mapAiApiError } from './rh-question-bank-ai-errors';

const apiError = (status: number, message: string, type = 'error') => ({
  status,
  name: 'APIError',
  message: `${status} ${message}`,
  error: { type: 'error', error: { type, message } },
});

describe('mapAiApiError (errores del SDK de Anthropic en el banco de preguntas)', () => {
  it('ignora errores que no son de la API', () => {
    expect(mapAiApiError(new Error('boom'))).toBeNull();
    expect(mapAiApiError(Object.assign(new Error('X'), { code: 'QUESTION_BANK_TEXT_EMPTY' }))).toBeNull();
    expect(mapAiApiError(undefined)).toBeNull();
  });

  it('detecta falta de saldo aunque venga como 400', () => {
    const mapped = mapAiApiError(apiError(400, 'Your credit balance is too low to access the Anthropic API.'));
    expect(mapped?.code).toBe('QUESTION_BANK_AI_UNAVAILABLE');
    expect(mapped?.publicMessage).toMatch(/saldo/);
    expect(mapped?.detail).toContain('Anthropic API 400');
  });

  it('llave invalida y modelo inexistente quedan como no disponible', () => {
    expect(mapAiApiError(apiError(401, 'invalid x-api-key'))?.publicMessage).toMatch(/llave/);
    expect(mapAiApiError(apiError(404, 'model: claude-x'))?.publicMessage).toMatch(/modelo/);
  });

  it('limite de uso, saturacion y red son reintentables', () => {
    expect(mapAiApiError(apiError(429, 'rate limit'))?.code).toBe('QUESTION_BANK_AI_BUSY');
    expect(mapAiApiError(apiError(529, 'Overloaded'))?.code).toBe('QUESTION_BANK_AI_BUSY');
    expect(mapAiApiError(apiError(500, 'Internal'))?.code).toBe('QUESTION_BANK_AI_BUSY');
    expect(mapAiApiError({ name: 'APIConnectionTimeoutError', message: 'timeout' })?.code).toBe('QUESTION_BANK_AI_BUSY');
  });

  it('prompt demasiado largo pide menos documentos', () => {
    expect(mapAiApiError(apiError(400, 'prompt is too long: 250000 tokens'))?.publicMessage).toMatch(/menos documentos/);
  });

  it('otros 400 muestran el mensaje de la API', () => {
    const mapped = mapAiApiError(apiError(400, 'max_tokens: too large'));
    expect(mapped?.code).toBe('QUESTION_BANK_AI_REJECTED');
    expect(mapped?.publicMessage).toContain('max_tokens: too large');
  });
});
