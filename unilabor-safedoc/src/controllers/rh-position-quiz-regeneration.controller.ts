import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  getPositionQuizRegeneration,
  startPositionQuizRegeneration,
} from '../services/rh-position-quiz-regeneration.service';

/**
 * "Regenerar preguntas propias del puesto" (cuestionario de la Fase 5):
 * arranca la generacion en segundo plano y consulta su estado.
 */

const positionParamsSchema = z.object({ positionId: z.coerce.number().int().positive() });

const ERROR_STATUS: Record<string, number> = {
  RH_POSITION_QUIZ_NOT_FOUND: 404,
  RH_POSITION_WITHOUT_DOCUMENTS: 409,
  RH_POSITION_QUIZ_REGENERATION_RUNNING: 409,
  QUESTION_BANK_NOT_CONFIGURED: 503,
};

export const startPositionQuizRegenerationController = async (req: AuthRequest, res: Response) => {
  const params = positionParamsSchema.safeParse(req.params);
  if (!params.success || !req.user?.id) {
    return res.status(400).json({ message: 'Puesto invalido.' });
  }
  try {
    const regeneration = await startPositionQuizRegeneration(params.data.positionId, req.user.id);
    await registerAuditEvent({
      user_id: req.user.id,
      action: 'RH_POSITION_QUIZ_REGENERATE',
      module_code: 'RH',
      entity_type: 'rh_position',
      entity_id: params.data.positionId,
      metadata: { batch_id: regeneration.batch_id, documents: regeneration.documents },
    }).catch(() => undefined);
    return res.status(202).json({
      message: 'Generando preguntas propias del puesto en segundo plano; el cuestionario se actualiza al terminar.',
      regeneration,
    });
  } catch (error: any) {
    const status = ERROR_STATUS[String(error?.code)];
    if (status) return res.status(status).json({ message: error.publicMessage ?? 'No se pudo iniciar la generacion.' });
    console.error('Error iniciando la regeneracion de preguntas del puesto:', error);
    return res.status(500).json({ message: 'No se pudo iniciar la generacion de preguntas.' });
  }
};

export const getPositionQuizRegenerationController = async (req: AuthRequest, res: Response) => {
  const params = positionParamsSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ message: 'Puesto invalido.' });
  }
  try {
    return res.json({ regeneration: await getPositionQuizRegeneration(params.data.positionId) });
  } catch (error) {
    console.error('Error consultando la regeneracion de preguntas del puesto:', error);
    return res.status(500).json({ message: 'No se pudo consultar la generacion de preguntas.' });
  }
};
