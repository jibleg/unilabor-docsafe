import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import { getEmployeeByUserId } from '../services/employee.service';
import {
  assignEvaluation,
  countPendingForEmployee,
  listAssignmentsByTemplate,
  listEmployeeAssignments,
  requestLateAuthorization,
} from '../services/evaluation-assignment.service';
import {
  getTakingView,
  startEvaluation,
  submitEvaluation,
  type SubmitAnswerInput,
} from '../services/evaluation-attempt.service';

const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const mapAssignmentError = (res: Response, error: any): Response | null => {
  switch (error?.code) {
    case 'EVAL_ASSIGNMENT_TABLES_NOT_AVAILABLE':
      return res.status(409).json({
        message: 'Las tablas de asignacion de evaluaciones no existen. Ejecuta las migraciones del Sprint 32.',
      });
    case 'EVAL_TEMPLATE_NOT_FOUND':
      return res.status(404).json({ message: 'La evaluacion indicada no existe.' });
    case 'EVAL_TEMPLATE_NOT_PUBLISHED':
      return res.status(400).json({ message: 'Solo se pueden asignar evaluaciones publicadas.' });
    case 'EVAL_TEMPLATE_WITHOUT_QUESTIONS':
      return res.status(400).json({ message: 'La evaluacion no tiene preguntas en su banco.' });
    case 'RANDOM_COUNT_EXCEEDS_BANK':
      return res.status(400).json({
        message: 'La cantidad de preguntas aleatorias supera el total del banco.',
      });
    case 'EVAL_ASSIGNMENT_NOT_FOUND':
      return res.status(404).json({ message: 'La evaluacion asignada no existe.' });
    case 'EVAL_NOT_OWNER':
      return res.status(403).json({ message: 'Esta evaluacion no esta asignada a tu cuenta.' });
    case 'EVAL_WINDOW_EXPIRED':
      return res.status(409).json({
        message: 'La ventana de 72 horas vencio. Solicita a RH una autorizacion extemporanea.',
      });
    case 'EVAL_NOT_ACTIONABLE':
      return res.status(409).json({ message: 'Esta evaluacion ya no se puede responder.' });
    case 'EVAL_NOT_EXPIRED':
      return res.status(409).json({ message: 'Esta evaluacion no esta vencida.' });
    default:
      return null;
  }
};

const resolveOwnEmployeeId = async (req: AuthRequest): Promise<number | null> => {
  if (!req.user?.id) {
    return null;
  }
  const employee = await getEmployeeByUserId(req.user.id);
  return employee ? employee.id : null;
};

// --- RH ---

export const assignEvaluationController = async (req: AuthRequest, res: Response) => {
  const templateId = parseId(req.params.templateId);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const summary = await assignEvaluation(templateId, req.body.employee_ids as number[], req.user?.id ?? null);
    if (req.user?.id) {
      await registerAuditEvent({
        user_id: req.user.id,
        action: `RH_EVAL_ASSIGN:${templateId}`,
        ip_address: req.ip ?? null,
        module_code: 'RH',
        entity_type: 'evaluation_assignment',
        entity_id: templateId,
        metadata: { created: summary.created, skipped: summary.skipped },
      });
    }
    return res.status(201).json({
      message: `Asignadas ${summary.created} evaluacion(es)${summary.skipped > 0 ? `, ${summary.skipped} ya vigente(s) omitida(s)` : ''}.`,
      summary,
    });
  } catch (error: any) {
    const mapped = mapAssignmentError(res, error);
    if (mapped) return mapped;
    console.error('Error asignando evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo asignar la evaluacion.' });
  }
};

export const listTemplateAssignmentsController = async (req: AuthRequest, res: Response) => {
  const templateId = parseId(req.params.templateId);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const result = await listAssignmentsByTemplate(templateId, {
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    return res.json(result);
  } catch (error: any) {
    const mapped = mapAssignmentError(res, error);
    if (mapped) return mapped;
    console.error('Error listando asignaciones:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las asignaciones.' });
  }
};

// --- Colaborador (/me) ---

export const listMyEvaluationsController = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = await resolveOwnEmployeeId(req);
    if (!employeeId) {
      return res.json({ data: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 1 } });
    }
    const result = await listEmployeeAssignments(employeeId, {
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json(result);
  } catch (error: any) {
    const mapped = mapAssignmentError(res, error);
    if (mapped) return mapped;
    console.error('Error listando mis evaluaciones:', error);
    return res.status(500).json({ message: 'No se pudieron cargar tus evaluaciones.' });
  }
};

export const myPendingEvaluationsCountController = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = await resolveOwnEmployeeId(req);
    const count = employeeId ? await countPendingForEmployee(employeeId) : 0;
    return res.json({ count });
  } catch (error) {
    console.error('Error obteniendo conteo de evaluaciones pendientes:', error);
    // No bloquea la UI: devolver 0 ante error.
    return res.json({ count: 0 });
  }
};

const requireOwnEmployee = async (req: AuthRequest, res: Response): Promise<number | null> => {
  const employeeId = await resolveOwnEmployeeId(req);
  if (!employeeId) {
    res.status(403).json({ message: 'Tu cuenta no esta vinculada a un colaborador.' });
    return null;
  }
  return employeeId;
};

export const getMyEvaluationDetailController = async (req: AuthRequest, res: Response) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const employeeId = await requireOwnEmployee(req, res);
    if (employeeId === null) return res;
    const view = await getTakingView(assignmentId, employeeId);
    return res.json(view);
  } catch (error: any) {
    const mapped = mapAssignmentError(res, error);
    if (mapped) return mapped;
    console.error('Error obteniendo evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo cargar la evaluacion.' });
  }
};

export const startMyEvaluationController = async (req: AuthRequest, res: Response) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const employeeId = await requireOwnEmployee(req, res);
    if (employeeId === null) return res;
    const view = await startEvaluation(assignmentId, employeeId);
    return res.json(view);
  } catch (error: any) {
    const mapped = mapAssignmentError(res, error);
    if (mapped) return mapped;
    console.error('Error iniciando evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo iniciar la evaluacion.' });
  }
};

export const requestLateAuthorizationController = async (req: AuthRequest, res: Response) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const employeeId = await requireOwnEmployee(req, res);
    if (employeeId === null) return res;
    await requestLateAuthorization(assignmentId, employeeId);
    return res.json({ message: 'Solicitud enviada a RH para autorizacion extemporanea.' });
  } catch (error: any) {
    const mapped = mapAssignmentError(res, error);
    if (mapped) return mapped;
    console.error('Error solicitando autorizacion extemporanea:', error);
    return res.status(500).json({ message: 'No se pudo enviar la solicitud.' });
  }
};

export const submitMyEvaluationController = async (req: AuthRequest, res: Response) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) {
    return res.status(400).json({ message: 'ID de evaluacion invalido.' });
  }
  try {
    const employeeId = await requireOwnEmployee(req, res);
    if (employeeId === null) return res;
    const result = await submitEvaluation(assignmentId, employeeId, req.body.answers as SubmitAnswerInput[]);
    if (req.user?.id) {
      await registerAuditEvent({
        user_id: req.user.id,
        action: `RH_EVAL_SUBMIT:${assignmentId}`,
        ip_address: req.ip ?? null,
        module_code: 'RH',
        entity_type: 'evaluation_assignment',
        entity_id: assignmentId,
        metadata: { status: result.status, percentage: result.percentage },
      });
    }
    return res.json({ message: 'Evaluacion enviada.', result });
  } catch (error: any) {
    const mapped = mapAssignmentError(res, error);
    if (mapped) return mapped;
    console.error('Error enviando evaluacion:', error);
    return res.status(500).json({ message: 'No se pudo enviar la evaluacion.' });
  }
};
