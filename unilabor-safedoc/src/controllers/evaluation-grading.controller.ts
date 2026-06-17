import type { Response } from 'express';
import type { AuthRequest, OpenAnswerGradeInput } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  getGradingDetail,
  gradeOpenAnswers,
  listGradingQueue,
} from '../services/evaluation-grading.service';
import { listOutbox, type OutboxChannel, type OutboxStatus } from '../services/outbox.service';
import { authorizeLateAttempt, listExpiredAssignments } from '../services/evaluation-assignment.service';
import { getEvaluationDashboard, getTraceabilityReport } from '../services/evaluation-report.service';

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

export const listNotificationLogController = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Number.parseInt(String(req.query.limit ?? '200'), 10);
    const channel = req.query.channel === 'email' || req.query.channel === 'sms' ? (req.query.channel as OutboxChannel) : undefined;
    const status =
      req.query.status === 'sent' || req.query.status === 'failed' || req.query.status === 'skipped'
        ? (req.query.status as OutboxStatus)
        : undefined;
    const filters: Parameters<typeof listOutbox>[0] = { limit: Number.isFinite(limit) ? limit : 200 };
    if (channel) filters.channel = channel;
    if (status) filters.status = status;
    const data = await listOutbox(filters);
    return res.json({ data });
  } catch (error) {
    console.error('Error listando la bandeja de salida:', error);
    return res.status(500).json({ message: 'No se pudo cargar la bandeja de salida.' });
  }
};

export const evaluationDashboardController = async (_req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getEvaluationDashboard();
    return res.json(dashboard);
  } catch (error) {
    console.error('Error obteniendo dashboard de evaluaciones:', error);
    return res.status(500).json({ message: 'No se pudo cargar el dashboard de capacitacion.' });
  }
};

export const traceabilityReportController = async (req: AuthRequest, res: Response) => {
  try {
    const courseId = Number.parseInt(String(req.query.course_id ?? ''), 10);
    const employeeId = Number.parseInt(String(req.query.employee_id ?? ''), 10);
    const filters: Parameters<typeof getTraceabilityReport>[0] = {
      page: req.query.page,
      limit: req.query.limit,
    };
    if (Number.isFinite(courseId) && courseId > 0) {
      filters.course_id = courseId;
    }
    if (Number.isFinite(employeeId) && employeeId > 0) {
      filters.employee_id = employeeId;
    }
    const result = await getTraceabilityReport(filters);
    return res.json(result);
  } catch (error) {
    console.error('Error obteniendo reporte de trazabilidad:', error);
    return res.status(500).json({ message: 'No se pudo cargar el reporte de trazabilidad.' });
  }
};

export const listExpiredAssignmentsController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listExpiredAssignments({ page: req.query.page, limit: req.query.limit });
    return res.json(result);
  } catch (error) {
    console.error('Error listando evaluaciones vencidas:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las evaluaciones vencidas.' });
  }
};

export const authorizeLateController = async (req: AuthRequest, res: Response) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const assignment = await authorizeLateAttempt(assignmentId);
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_EVAL_AUTHORIZE_LATE:${assignmentId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'evaluation_assignment',
      entity_id: assignmentId,
    });
    return res.json({ message: 'Autorizacion extemporanea otorgada. Se reabrio la ventana.', assignment });
  } catch (error: any) {
    if (error?.code === 'EVAL_ASSIGNMENT_NOT_FOUND') {
      return res.status(404).json({ message: 'La evaluacion no existe.' });
    }
    if (error?.code === 'EVAL_NOT_EXPIRED') {
      return res.status(409).json({ message: 'Solo se pueden autorizar evaluaciones vencidas.' });
    }
    console.error('Error autorizando extemporaneo:', error);
    return res.status(500).json({ message: 'No se pudo autorizar la evaluacion.' });
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
