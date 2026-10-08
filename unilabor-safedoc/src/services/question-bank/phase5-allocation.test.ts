import { describe, expect, it } from 'vitest';
import { allocateSlots, documentNeeds, questionTotalFor, typeQuotaFor, typeSequenceFor } from './phase5-allocation';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `doc-${i + 1}`);
const countTypes = (types: string[]) =>
  types.reduce<Record<string, number>>((acc, type) => ({ ...acc, [type]: (acc[type] ?? 0) + 1 }), {});

describe('allocation de la Fase 5', () => {
  it('menos de 20 documentos -> 20 preguntas; 20 o mas -> una por documento', () => {
    expect(questionTotalFor(1)).toBe(20);
    expect(questionTotalFor(19)).toBe(20);
    expect(questionTotalFor(20)).toBe(20);
    expect(questionTotalFor(246)).toBe(246);
  });

  it('respeta 40 % V/F, 10 % multiple y 50 % unica', () => {
    expect(typeQuotaFor(20)).toEqual({ boolean: 8, multiple: 2, single: 10 });
    expect(typeQuotaFor(246)).toEqual({ boolean: 98, multiple: 25, single: 123 });
    expect(countTypes(typeSequenceFor(28))).toEqual({ boolean: 11, multiple: 3, single: 14 });
  });

  it('con pocos documentos cubre cada documento al menos una vez', () => {
    const slots = allocateSlots(ids(6));
    expect(slots).toHaveLength(20);
    for (const id of ids(6)) {
      expect(slots.filter((slot) => slot.documentId === id).length).toBeGreaterThanOrEqual(3);
    }
    expect(countTypes(slots.map((slot) => slot.type))).toEqual({ boolean: 8, multiple: 2, single: 10 });
  });

  it('con un solo documento le asigna las 20 preguntas', () => {
    const slots = allocateSlots(ids(1));
    expect(slots).toHaveLength(20);
    expect(new Set(slots.map((slot) => slot.documentId))).toEqual(new Set(['doc-1']));
  });

  it('con 20 o mas documentos asigna exactamente una pregunta por documento', () => {
    const slots = allocateSlots(ids(41));
    expect(slots.map((slot) => slot.documentId)).toEqual(ids(41));
  });

  it('la necesidad por documento es el maximo entre los cursos que lo comparten', () => {
    const small = allocateSlots(['a']); // 20 preguntas de 'a'
    const large = allocateSlots(ids(20).map((id, i) => (i === 0 ? 'a' : id)));
    const needs = documentNeeds([small, large]);
    expect(needs.get('a')).toEqual({ boolean: 8, multiple: 2, single: 10 });
  });
});
