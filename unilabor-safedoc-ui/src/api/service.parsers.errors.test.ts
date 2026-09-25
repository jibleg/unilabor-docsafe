import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from './service.parsers';

const axios400 = (data: unknown): AxiosError => {
  const error = new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST');
  error.response = { data, status: 400, statusText: 'Bad Request', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
};

describe('getApiErrorMessage con errores de validacion Zod', () => {
  it('anexa el detalle de cada campo al mensaje general', () => {
    const error = axios400({
      message: 'Datos de entrada invalidos',
      errors: [{ field: 'counts.single', message: 'Maximo 15 preguntas por tipo en cada generacion' }],
    });
    expect(getApiErrorMessage(error)).toBe('Datos de entrada invalidos: Maximo 15 preguntas por tipo en cada generacion');
  });
  it('sin detalle devuelve solo el mensaje', () => {
    expect(getApiErrorMessage(axios400({ message: 'Documento no encontrado.' }))).toBe('Documento no encontrado.');
  });
});
