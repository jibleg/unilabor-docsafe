import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  issueEnrollmentCertificate,
  resendReadingNotice,
  resetTruncatedAttempt,
} from '../services/rh-induction-attempt-repair.service';
import { getInductionEmployee360 } from '../services/rh-induction-dashboard-employee.service';
import { getInductionProgramOverview } from '../services/rh-induction-dashboard-overview.service';
import { loadEnrollmentRosterRow, queryPhaseRoster } from '../services/rh-induction-dashboard.service';
import {
  advanceEnrollmentToNextPhase,
  reconcilePhaseAdvance,
  setPhaseAutoAdvance,
} from '../services/rh-induction-progression.service';
import { updateEvaluationTemplate } from '../services/evaluation-template.service';
import type { EvaluationTemplatePayload } from '../services/evaluation-template.service';
import pool from '../config/db';
import {
  rosterQuerySchema,
  type ResetTruncatedAttemptInput,
  type UpdatePhaseAdvanceGraceInput,
  type UpdatePhaseAutoAdvanceInput,
  type UpdatePhaseEvaluationRulesInput,
} from '../schemas/rh-induction-dashboard.schema';
import { setPhaseAdvanceGrace, startDeferredEnrollmentNow } from '../services/rh-induction-grace.service';

/**
 * Tablero de gestion integral de la Induccion (Fases 1-4). Controllers
 * delgados: parsean, delegan al servicio, auditan y responden.
 */

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_INDUCTION_PHASE_NOT_FOUND: 404,
  RH_INDUCTION_ENROLLMENT_NOT_FOUND: 404,
  RH_INDUCTION_ALREADY_ENROLLED: 409,
  RH_INDUCTION_PREVIOUS_PHASE_NOT_APPROVED: 409,
  RH_INDUCTION_EMPLOYEE_WITHOUT_USER: 409,
  RH_INDUCTION_PHASE_WITHOUT_DOCUMENTS: 409,
  RH_INDUCTION_PHASE_WITHOUT_PUBLISHED_EVALUATION: 409,
  RH_INDUCTION_AUTO_ADVANCE_NOT_APPLICABLE: 409,
  RH_INDUCTION_GRACE_NOT_APPLICABLE: 409,
  RH_INDUCTION_NOT_DEFERRED: 409,
  RH_INDUCTION_ADVANCE_NO_NEXT_PHASE: 409,
  RH_INDUCTION_SYSTEM_ACTOR_NOT_FOUND: 500,
  RH_INDUCTION_RETRY_NO_EVALUATION: 409,
  RH_INDUCTION_RETRY_NOT_ALLOWED: 409,
  RH_INDUCTION_RETRY_ASSIGNMENT_FAILED: 500,
  RH_INDUCTION_ATTEMPT_NOT_TRUNCATED: 409,
  RH_INDUCTION_CERTIFICATE_NOT_PASSED: 409,
  RH_INDUCTION_CERTIFICATE_FAILED: 500,
  RH_INDUCTION_NOTICE_NOT_APPLICABLE: 409,
  EVAL_TEMPLATE_NOT_FOUND: 404,
  EVAL_TEMPLATE_NO_QUESTIONS: 409,
  RANDOM_COUNT_EXCEEDS_BANK: 409,
};

const mapError = (res: Response, error: any): Response | null => {
  const status = ERROR_STATUS[error?.code];
  if (!status) {
    return null;
  }
  return res.status(status).json({ message: error?.publicMessage || 'No se pudo completar la operacion.' });
};

const fail = (res: Response, error: any, context: string, fallback: string): Response => {
  const mapped = mapError(res, error);
  if (mapped) return mapped;
  console.error(`${context}:`, error);
  return res.status(500).json({ message: fallback });
};

/** GET /rh/induction/dashboard/overview */
export const getInductionDashboardOverviewController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ overview: await getInductionProgramOverview() });
  } catch (error: any) {
    return fail(res, error, 'Error cargando el panorama del tablero de induccion', 'No se pudo cargar el tablero.');
  }
};

/** GET /rh/induction/dashboard/phases/:phaseId/roster?q=&stage=a,b&alert=&page=&limit= */
export const getInductionPhaseRosterController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  const parsed = rosterQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Filtros invalidos',
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
  }
  try {
    const roster = await queryPhaseRoster({
      phaseId,
      search: parsed.data.q,
      stages: parsed.data.stage,
      alerts: parsed.data.alert,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return res.json({ roster });
  } catch (error: any) {
    return fail(res, error, 'Error cargando el roster de la fase', 'No se pudo cargar el roster de la fase.');
  }
};

/** GET /rh/induction/dashboard/employees/:employeeId */
export const getInductionEmployee360Controller = async (req: AuthRequest, res: Response) => {
  const employeeId = parsePositiveInt(req.params.employeeId);
  if (!employeeId) {
    return res.status(400).json({ message: 'ID de colaborador invalido.' });
  }
  try {
    const detail = await getInductionEmployee360(employeeId);
    if (!detail) {
      return res.status(404).json({ message: 'El colaborador no existe.' });
    }
    return res.json({ detail });
  } catch (error: any) {
    return fail(res, error, 'Error cargando la vista 360 de induccion', 'No se pudo cargar el detalle del colaborador.');
  }
};

/** GET /rh/induction/dashboard/enrollments/:enrollmentId (fila fresca tras una accion) */
export const getInductionEnrollmentRowController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  try {
    const row = await loadEnrollmentRosterRow(enrollmentId);
    if (!row) {
      return res.status(404).json({ message: 'La inscripcion no existe.' });
    }
    return res.json({ row });
  } catch (error: any) {
    return fail(res, error, 'Error cargando la inscripcion', 'No se pudo cargar la inscripcion.');
  }
};

/** PATCH /rh/induction/phases/:phaseId/auto-advance {enabled} */
export const updatePhaseAutoAdvanceController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  const { enabled } = req.body as UpdatePhaseAutoAdvanceInput;
  try {
    const updated = await setPhaseAutoAdvance(phaseId, enabled);
    if (!updated) {
      return res.status(404).json({ message: 'La fase no existe.' });
    }
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_AUTO_ADVANCE:${phaseId}:${enabled ? 'ON' : 'OFF'}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_phase',
      entity_id: phaseId,
      metadata: { enabled },
    });
    return res.json({
      message: enabled
        ? 'Avance automatico encendido: al aprobar esta fase el colaborador se inscribe solo en la siguiente.'
        : 'Avance automatico apagado: RH avanzara a los aprobados desde el tablero.',
      enabled,
    });
  } catch (error: any) {
    return fail(res, error, 'Error actualizando el avance automatico', 'No se pudo actualizar el avance automatico.');
  }
};

/** PATCH /rh/induction/phases/:phaseId/evaluation-rules {window_hours?, attempt_time_limit_minutes?, passing_score?} */
export const updatePhaseEvaluationRulesController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  const rules = req.body as UpdatePhaseEvaluationRulesInput;
  try {
    const template = await pool.query(
      `SELECT t.id FROM public.rh_induction_phases p
         JOIN public.evaluation_templates t ON t.training_course_id = p.training_course_id
        WHERE p.id = $1 AND t.status = 'published' AND t.is_active = TRUE AND t.evaluation_type = 'quiz'
        ORDER BY t.created_at DESC LIMIT 1;`,
      [phaseId],
    );
    if (template.rows.length === 0) {
      return res.status(409).json({ message: 'La fase no tiene un cuestionario publicado; configuralo en Capacitaciones.' });
    }
    const templateId = Number(template.rows[0].id);
    // updateEvaluationTemplate conserva los campos no enviados (lee la fila actual).
    const updated = await updateEvaluationTemplate(templateId, rules as unknown as EvaluationTemplatePayload);
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_EVALUATION_RULES:${phaseId}:${templateId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'evaluation_template',
      entity_id: templateId,
      metadata: { ...rules },
    });
    return res.json({ message: 'Reglas del cuestionario actualizadas.', template: updated });
  } catch (error: any) {
    return fail(res, error, 'Error actualizando reglas del cuestionario', 'No se pudieron actualizar las reglas.');
  }
};

/** POST /rh/induction/phases/:phaseId/reconcile-advance */
export const reconcilePhaseAdvanceController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  try {
    const result = await reconcilePhaseAdvance(phaseId, req.user?.id ?? null);
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_ADVANCE_RECONCILE:${phaseId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_phase',
      entity_id: phaseId,
      metadata: { candidates: result.candidates, advanced: result.advanced, skipped: result.skipped },
    });
    const message =
      result.candidates === 0
        ? `No hay aprobados de la Fase ${result.phase_number - 1} pendientes de avanzar.`
        : `${result.advanced} de ${result.candidates} colaborador(es) avanzaron a la Fase ${result.phase_number}.`;
    return res.json({ message, result });
  } catch (error: any) {
    return fail(res, error, 'Error sincronizando avances', 'No se pudieron sincronizar los avances.');
  }
};

/** POST /rh/induction/enrollments/:enrollmentId/advance */
export const advanceEnrollmentController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  try {
    const advanced = await advanceEnrollmentToNextPhase(enrollmentId, req.user?.id ?? null);
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_ADVANCED:${enrollmentId}->${advanced.to_enrollment_id}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_enrollment',
      entity_id: enrollmentId,
      employee_id: advanced.employee_id,
      metadata: { ...advanced },
    });
    return res.status(201).json({
      message: !advanced.to_phase_published
        ? `${advanced.employee_name} quedo inscrito en la Fase ${advanced.to_phase_number} (en espera de que se publique).`
        : advanced.grace_hours > 0
          ? `${advanced.employee_name} avanzo a la Fase ${advanced.to_phase_number}; sus lecturas se activan en ${advanced.grace_hours} h (periodo de descanso).`
          : `${advanced.employee_name} avanzo a la Fase ${advanced.to_phase_number}; ya tiene sus lecturas asignadas.`,
      advanced,
    });
  } catch (error: any) {
    return fail(res, error, 'Error avanzando de fase', 'No se pudo avanzar al colaborador.');
  }
};

/** POST /rh/induction/enrollments/:enrollmentId/reset-attempt {note?} */
export const resetTruncatedAttemptController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  const { note } = (req.body ?? {}) as ResetTruncatedAttemptInput;
  try {
    const result = await resetTruncatedAttempt({ enrollmentId, actorUserId: req.user?.id ?? null, note });
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_ATTEMPT_RESET:${enrollmentId}:${result.closed_assignment_id}->${result.new_assignment_id}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_enrollment',
      entity_id: enrollmentId,
      employee_id: result.employee_id,
      metadata: {
        closed_assignment_id: result.closed_assignment_id,
        closed_reasons: result.closed_reasons,
        closed_responses_kept: result.closed_responses_kept,
        new_assignment_id: result.new_assignment_id,
        attempt_no: result.attempt_no,
        deadline_at: result.deadline_at,
        note: note ?? null,
      },
    });
    return res.status(201).json({
      message: `Intento reabierto (intento #${result.attempt_no}). El colaborador ya puede presentar de nuevo.`,
      reset: result,
    });
  } catch (error: any) {
    return fail(res, error, 'Error reabriendo intento truncado', 'No se pudo reabrir el intento.');
  }
};

/** POST /rh/induction/enrollments/:enrollmentId/issue-certificate */
export const issueEnrollmentCertificateController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  try {
    const result = await issueEnrollmentCertificate(enrollmentId);
    if (!result.already_existed) {
      await registerAuditEvent({
        user_id: req.user?.id ?? null,
        action: `RH_INDUCTION_CERTIFICATE_ISSUED:${enrollmentId}:${result.certificate_document_id}`,
        ip_address: req.ip ?? null,
        module_code: 'RH',
        entity_type: 'induction_enrollment',
        entity_id: enrollmentId,
        employee_id: result.employee_id,
        metadata: { assignment_id: result.assignment_id, certificate_document_id: result.certificate_document_id },
      });
    }
    return res.status(result.already_existed ? 200 : 201).json({
      message: result.already_existed ? 'La constancia ya existia.' : 'Constancia emitida y archivada en el expediente.',
      certificate: result,
    });
  } catch (error: any) {
    return fail(res, error, 'Error emitiendo constancia de induccion', 'No se pudo emitir la constancia.');
  }
};

/** POST /rh/induction/enrollments/:enrollmentId/resend-notice */
export const resendReadingNoticeController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  try {
    const result = await resendReadingNotice(enrollmentId);
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_NOTICE_RESENT:${enrollmentId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_enrollment',
      entity_id: enrollmentId,
      employee_id: result.employee_id,
      metadata: { phase_number: result.phase_number, reading_deadline_at: result.reading_deadline_at },
    });
    return res.json({ message: 'Aviso de lectura reenviado por SMS.', notice: result });
  } catch (error: any) {
    return fail(res, error, 'Error reenviando aviso de lectura', 'No se pudo reenviar el aviso.');
  }
};

/** PATCH /rh/induction/phases/:phaseId/advance-grace {hours|null} */
export const updatePhaseAdvanceGraceController = async (req: AuthRequest, res: Response) => {
  const phaseId = parsePositiveInt(req.params.phaseId);
  if (!phaseId) {
    return res.status(400).json({ message: 'ID de fase invalido.' });
  }
  const { hours } = req.body as UpdatePhaseAdvanceGraceInput;
  try {
    const updated = await setPhaseAdvanceGrace(phaseId, hours);
    if (!updated) {
      return res.status(404).json({ message: 'La fase no existe.' });
    }
    const applied = hours && hours > 0 ? Math.floor(hours) : null;
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_ADVANCE_GRACE:${phaseId}:${applied ?? 0}h`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_phase',
      entity_id: phaseId,
      metadata: { advance_grace_hours: applied },
    });
    return res.json({
      message: applied
        ? `Descanso de ${applied} h antes de iniciar esta fase: al avanzar, las lecturas y el SMS se activan cuando termina.`
        : 'Sin periodo de descanso: al avanzar, las lecturas arrancan de inmediato.',
      advance_grace_hours: applied,
    });
  } catch (error: any) {
    return fail(res, error, 'Error actualizando el periodo de descanso', 'No se pudo actualizar el periodo de descanso.');
  }
};

/** POST /rh/induction/enrollments/:enrollmentId/start-now - termina el descanso y activa las lecturas ya. */
export const startDeferredEnrollmentController = async (req: AuthRequest, res: Response) => {
  const enrollmentId = parsePositiveInt(req.params.enrollmentId);
  if (!enrollmentId) {
    return res.status(400).json({ message: 'ID de inscripcion invalido.' });
  }
  try {
    const result = await startDeferredEnrollmentNow(enrollmentId);
    await registerAuditEvent({
      user_id: req.user?.id ?? null,
      action: `RH_INDUCTION_GRACE_ENDED:${enrollmentId}`,
      ip_address: req.ip ?? null,
      module_code: 'RH',
      entity_type: 'induction_enrollment',
      entity_id: enrollmentId,
      metadata: { activated: result.activated },
    });
    return res.json({
      message: result.activated
        ? 'Descanso terminado: lecturas asignadas, plazo iniciado y SMS enviado.'
        : 'Descanso terminado; las lecturas se activaran en cuanto la fase tenga documentos y este publicada.',
      ...result,
    });
  } catch (error: any) {
    return fail(res, error, 'Error terminando el descanso', 'No se pudo activar la inscripcion.');
  }
};
