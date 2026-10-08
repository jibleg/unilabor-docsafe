import api from './axios';
import { asRecord, unwrapPayload } from './service.shared';
import type { PositionQuizRegeneration } from '../types/models';

/** Última generación del banco del puesto (Fase 5) o null. */
export const getPositionQuizRegeneration = async (positionId: number): Promise<PositionQuizRegeneration | null> => {
  const response = await api.get(`/rh/induction/positions/${positionId}/phase5-quiz/regeneration`);
  return (asRecord(unwrapPayload(response.data))?.regeneration as PositionQuizRegeneration | null) ?? null;
};

/** Arranca "preguntas propias del puesto" en segundo plano. */
export const startPositionQuizRegeneration = async (positionId: number): Promise<PositionQuizRegeneration> => {
  const response = await api.post(`/rh/induction/positions/${positionId}/phase5-quiz/regenerate`);
  return asRecord(unwrapPayload(response.data))?.regeneration as PositionQuizRegeneration;
};
