import type { Response } from 'express';
import type { AuthRequest, OpenAnswerGradeInput } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  getGradingDetail,
  gradeOpenAnswers,
  listGradingQueue,
} from '../services/evaluation-grading.service';

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const mapGradingError = (res: Response, error: any): Response | null => {
  switch (error?.code) {
    case 'EVAL_ASSIGNMENT_NOT_FOUND':
      return res.status(404).json({ message: 'La evaluacion no existe.' });
    case 'EVAL_NOT_IN_GRADING':
      return res.status(409).json({ message: 'Esta evaluacion no esta pendiente de calificacion.' });
    case 'EVAL_OPEN_ANSWERS_INCOMPLETE':
      return res.status(400).json({ message: 'Debes calificar todas las respuestas abiertas.' });
    case 'EVAL_POINTS_OUT_OF_RANGE':
      return res.status(400).json({ message: 'Los puntos asignados estan fuera del rango permitido.' });
    default:
      return null;
  }
};

export const listGradingQueueController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listGradingQueue({ page: req.query.page, limit: req.query.limit });
    return res.json(result);
  } catch (error) {
    console.error('Error listando bandeja de calificacion:', error);
    return res.status(500).json({ message: 'No se pudo cargar la bandeja de calificacion.' });
  }
};

export const getGradingDetailController = async (req: AuthRequest, res: Response) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const detail = await getGradingDetail(assignmentId);
    return res.json(detail);
  } catch (error: any) {
    const mapped = mapGradingError(res, error);
    if (mapped) return mapped;
    console.error('Error obteniendo detalle de calificacion:', error);
    return res.status(500).json({ message: 'No se pudo obtener el detalle.' });
  }
};

export const gradeEvaluationController = async (req: AuthRequest, res: Response) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const result = await gradeOpenAnswers(
      assignmentId,
      req.body.grades as OpenAnswerGradeInput[],
      req.user?.id ?? null,
    );
    if (req.user?.id) {
      await registerAuditEvent({
        user_id: req.user.id,
        action: `RH_EVAL_GRADE:${assignmentId}`,
        ip_address: req.ip ?? null,
        module_code: 'RH',
        entity_type: 'evaluation_assignment',
        entity_id: assignmentId,
        metadata: { status: result.status, percentage: result.percentage },
      });
    }
    return res.json({ message: 'Evaluacion calificada correctamente.', result });
  } catch (error: any) {
    const mapped = mapGradingError(res, error);
    if (mapped) return mapped;
    console.error('Error calificando evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo calificar la evaluacion.' });
  }
};
