import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildIlikeSearch,
  buildPaginatedResult,
  resolvePagination,
} from './pagination';

describe('resolvePagination', () => {
  it('usa valores por defecto cuando no se especifican', () => {
    expect(resolvePagination()).toEqual({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it('calcula el offset a partir de page y limit', () => {
    expect(resolvePagination({ page: 3, limit: 10 })).toEqual({
      page: 3,
      limit: 10,
      offset: 20,
    });
  });

  it('coacciona strings de query y respeta el defaultLimit', () => {
    expect(resolvePagination({ page: '2' }, { defaultLimit: 5 })).toEqual({
      page: 2,
      limit: 5,
      offset: 5,
    });
  });

  it('acota el limit al máximo permitido', () => {
    const { limit } = resolvePagination({ limit: 9999 });
    expect(limit).toBe(MAX_PAGE_SIZE);
  });

  it('cae a los valores por defecto ante entradas inválidas', () => {
    expect(resolvePagination({ page: 'abc', limit: '-4' })).toEqual({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });
});

describe('buildIlikeSearch', () => {
  it('devuelve un fragmento vacío sin término', () => {
    expect(buildIlikeSearch(['a.name'], '   ')).toEqual({ clause: '', values: [] });
  });

  it('combina varias columnas con OR usando un único parámetro', () => {
    const result = buildIlikeSearch(['a.name', 'a.code'], 'foo', 0);
    expect(result.clause).toBe('(a.name ILIKE $1 OR a.code ILIKE $1)');
    expect(result.values).toEqual(['%foo%']);
  });

  it('respeta el offset de parámetros previos', () => {
    const result = buildIlikeSearch(['a.name'], 'bar', 2);
    expect(result.clause).toBe('(a.name ILIKE $3)');
    expect(result.values).toEqual(['%bar%']);
  });
});

describe('buildPaginatedResult', () => {
  it('arma el contrato uniforme y calcula totalPages', () => {
    const result = buildPaginatedResult([{ id: 1 }], 25, 2, 10);
    expect(result).toEqual({
      data: [{ id: 1 }],
      pagination: { page: 2, limit: 10, total: 25, totalPages: 3 },
    });
  });

  it('normaliza total inválido a 0 y totalPages a 1', () => {
    const result = buildPaginatedResult([], 'x', 1, 10);
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 1 });
  });
});
