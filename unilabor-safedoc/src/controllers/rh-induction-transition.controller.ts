import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import { getPositionReadiness } from '../services/rh-induction-position-readiness.service';
import { captureEnrollmentPractical } from '../services/rh-induction-practical.service';
import { executeTransition, queryTransitionQueue } from '../services/rh-induction-transition.service';
import type { TransitionTarget } from '../services/rh-induction-transition.service';
import {
  transitionQuerySchema,
  type CapturePracticalScoreInput,
  type ExecuteTransitionInputBody,
} from '../schemas/rh-induction-dashboard.schema';

/**
 * Fases por puesto en el Tablero de Induccion: bandeja de avance (4->5->6->7),
 * preparacion por puesto y captura de la practica de la Fase 6. Controllers
 * delgados: validan, delegan, auditan y responden.
 */

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_INDUCTION_PHASE_NOT_FOUND: 404,
  RH_INDUCTION_ENROLLMENT_NOT_FOUND: 404,
  RH_INDUCTION_PHASE_NOT_PUBLISHED: 409,
  RH_INDUCTION_PRACTICAL_NOT_AVAILABLE: 409,
  EVAL_TEMPLATE_NOT_PUBLISHED: 409,
  EVAL_PRACTICAL_EMPLOYEE_NOT_FOUND: 409,
  EVAL_PRACTICAL_SCORE_OUT_OF_RANGE: 400,
};

const ERROR_MESSAGE: Record<string, string> = {
  EVAL_TEMPLATE_NOT_PUBLISHED: 'La evaluacion practica del puesto no esta activa.',
  EVAL_PRACTICAL_EMPLOYEE_NOT_FOUND: 'El colaborador esta inactivo; no se puede capturar su evaluacion.',
  EVAL_PRACTICAL_SCORE_OUT_OF_RANGE: 'La calificacion debe estar entre 0 y 10.',
};

const fail = (res: Response, error: any, logLabel: string, fallback: string): Response => {
  const status = ERROR_STATUS[error?.code];
  if (status) {
    return res.status(status).json({ message: error?.publicMessage || ERROR_MESSAGE[error?.code] || fallback });
  }
  console.error(`${logLabel}:`, error);
  return res.status(500).json({ message: fallback });
};

/** GET /rh/induction/dashboard/transitions?target=5|6|7&state=&reason=&q=&page=&limit= */
export const getTransitionQueueController = async (req: AuthRequest, res: Response) => {
  const parsed = transitionQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Filtros invalidos',
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
  }
  try {
    const queue = await queryTransitionQueue({
      target: parsed.data.target as TransitionTarget,
      state: parsed.data.state,
      reason: parsed.data.reason,
      search: parsed.data.q,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return res.json({ queue });
  } catch (error: any) {
    return fail(res, error, 'Error cargando la bandeja de avance', 'No se pudo cargar la bandeja de avance.');
  }
};

/** POST /rh/induction/dashboard/transitions {target, employee_ids, evaluator_name?, evaluation_date?} */
export const executeTransitionController = async (req: AuthRequest, res: Response) => {
  const body = req.body as ExecuteTransitionInputBody;
  const actorUserId = req.user?.id;
  if (!actorUserId) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }
  try {
    const results = await executeTransition({
      target: body.target,
      employeeIds: body.employee_ids,
      actorUserId,
      evaluatorName: body.evaluator_name,
      evaluationDate: body.evaluation_date,
    });
    for (const result of results.filter((item) => item.ok)) {
      await registerAuditEvent({
        user_id: actorUserId,
        action:
          body.target === 7
            ? `RH_INDUCTION_COMPETENCY_STARTED:${result.created_id}`
            : `RH_INDUCTION_ADVANCED:${result.previous_enrollment_id}->${result.created_id}`,
        ip_address: req.ip ?? null,
        module_code: 'RH',
        entity_type: body.target === 7 ? 'competency_evaluation' : 'induction_enrollment',
        entity_id: result.created_id,
        employee_id: result.employee_id,
        metadata: { to_phase_number: body.target, from_enrollment_id: result.previous_enrollment_id, source: 'TRANSITION_QUEUE' },
      });
    }
    const done = results.filter((item) => item.ok).length;
    const skipped = results.length - done;
    const what = body.target === 7 ? 'evaluacion(es) de competencia abiertas' : `inscrito(s) en la Fase ${body.target}`;
    return res.status(done > 0 ? 201 : 200).json({
      message: skipped > 0 ? `${done} ${what}; ${skipped} no se movieron (ver detalle).` : `${done} ${what}.`,
      results,
    });
  } catch (error: any) {
    return fail(res, error, 'Error ejecutando el avance de fase', 'No se pudo completar el avance.');
  }
};

/** GET /rh/induction/dashboard/positions/readiness */
export const getPositionReadinessController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ positions: await getPositionReadiness() });
  } catch (error: any) {
    return fail(res, error, 'Error cargando la preparacion por puesto', 'No se pudo cargar la preparacion por puesto.');
  }
};

/** POST /rh/induction/dashboard/enrollments/:enrollmentId/practical {score, captured_at?} */
export const captureEnrollmentPracticalController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  const actorUserId = req.user?.id;
  if (!actorUserId) {
    return res.status(401).json({ message: 'Sesion invalida o expirada' });
  }
  const body = req.body as CapturePracticalScoreInput;
  try {
    const result = await captureEnrollmentPractical({
      enrollmentId,
      score: body.score,
      capturedAt: body.captured_at ?? null,
      actorUserId,
    });
    await registerAuditEvent({
      user_id: actorUserId,
      action: `RH_INDUCTION_PRACTICAL_CAPTURED:${enrollmentId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_enrollment',
      entity_id: enrollmentId,
      employee_id: result.employee_id,
      metadata: { assignment_id: result.assignment_id, score: result.score, status: result.status },
    });
    return res.status(201).json({
      message:
        result.status === 'passed'
          ? `${result.employee_name} acredito la Fase 6 (${result.score}/10).`
          : `${result.employee_name} no acredito la Fase 6 (${result.score}/10; minimo ${result.passing_score / 10}).`,
      result,
    });
  } catch (error: any) {
    return fail(res, error, 'Error capturando la evaluacion practica', 'No se pudo capturar la evaluacion practica.');
  }
};
