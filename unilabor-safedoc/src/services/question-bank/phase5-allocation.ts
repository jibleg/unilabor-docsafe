// -----------------------------------------------------------------------------
// Reparto de preguntas del banco de la Fase 5 (puro, sin BD ni red).
//
// Criterios de RH (2026-10-06):
//   * Solo cerradas: 40 % Verdadero/Falso, 10 % opcion multiple, 50 % opcion unica.
//   * Puesto con < 20 documentos vigentes: 20 preguntas, al menos 1 por documento.
//   * Puesto con >= 20 documentos vigentes: 1 pregunta por documento.
// -----------------------------------------------------------------------------

export type ClosedQuestionType = 'boolean' | 'multiple' | 'single';

export const CLOSED_TYPES: ClosedQuestionType[] = ['boolean', 'multiple', 'single'];

export const MIN_QUESTIONS_PER_COURSE = 20;
export const MINUTES_PER_QUESTION = 2;

export type TypeCounts = Record<ClosedQuestionType, number>;

export const emptyCounts = (): TypeCounts => ({ boolean: 0, multiple: 0, single: 0 });

/** Total de preguntas de un curso segun cuantos documentos vigentes tiene el puesto. */
export const questionTotalFor = (documentCount: number): number =>
  documentCount < MIN_QUESTIONS_PER_COURSE ? MIN_QUESTIONS_PER_COURSE : documentCount;

/** Cuota por tipo (40/10/50) que suma exactamente `total`. */
export const typeQuotaFor = (total: number): TypeCounts => {
  const boolean = Math.round(total * 0.4);
  const multiple = Math.round(total * 0.1);
  return { boolean, multiple, single: total - boolean - multiple };
};

/**
 * Secuencia de `total` tipos con la cuota repartida de forma pareja (no todas
 * las V/F juntas): en cada posicion toma el tipo mas atrasado respecto a su
 * proporcion ideal.
 */
export const typeSequenceFor = (total: number): ClosedQuestionType[] => {
  const quota = typeQuotaFor(total);
  const used = emptyCounts();
  const sequence: ClosedQuestionType[] = [];
  for (let index = 0; index < total; index += 1) {
    let best: ClosedQuestionType | null = null;
    let bestDeficit = -Infinity;
    for (const type of CLOSED_TYPES) {
      if (used[type] >= quota[type]) {
        continue;
      }
      const deficit = (quota[type] * (index + 1)) / total - used[type];
      if (deficit > bestDeficit) {
        best = type;
        bestDeficit = deficit;
      }
    }
    used[best!] += 1;
    sequence.push(best!);
  }
  return sequence;
};

export interface DocumentSlot {
  documentId: string;
  type: ClosedQuestionType;
}

/**
 * Asigna a cada documento (en el orden del puesto) los tipos de pregunta que le
 * tocan. Con < 20 documentos reparte las 20 preguntas lo mas parejo posible
 * (todos reciben al menos una); con >= 20, una por documento.
 */
export const allocateSlots = (documentIds: string[]): DocumentSlot[] => {
  if (documentIds.length === 0) {
    return [];
  }
  const total = questionTotalFor(documentIds.length);
  const sequence = typeSequenceFor(total);
  const base = Math.floor(total / documentIds.length);
  const extra = total % documentIds.length;

  const slots: DocumentSlot[] = [];
  let cursor = 0;
  documentIds.forEach((documentId, index) => {
    const count = base + (index < extra ? 1 : 0);
    for (let k = 0; k < count; k += 1) {
      slots.push({ documentId, type: sequence[cursor]! });
      cursor += 1;
    }
  });
  return slots;
};

/** Cuantas preguntas de cada tipo necesita cada documento para cubrir a todos los puestos que lo usan. */
export const documentNeeds = (slotsByCourse: DocumentSlot[][]): Map<string, TypeCounts> => {
  const needs = new Map<string, TypeCounts>();
  for (const slots of slotsByCourse) {
    const perCourse = new Map<string, TypeCounts>();
    for (const slot of slots) {
      const counts = perCourse.get(slot.documentId) ?? emptyCounts();
      counts[slot.type] += 1;
      perCourse.set(slot.documentId, counts);
    }
    for (const [documentId, counts] of perCourse) {
      const current = needs.get(documentId) ?? emptyCounts();
      for (const type of CLOSED_TYPES) {
        current[type] = Math.max(current[type], counts[type]);
      }
      needs.set(documentId, current);
    }
  }
  return needs;
};
