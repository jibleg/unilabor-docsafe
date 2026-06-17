import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import { getEmployeeByUserId } from '../services/employee.service';
import {
  assignEvaluation,
  countPendingForEmployee,
  listAssignmentsByTemplate,
  listEmployeeAssignments,
} from '../services/evaluation-assignment.service';

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
