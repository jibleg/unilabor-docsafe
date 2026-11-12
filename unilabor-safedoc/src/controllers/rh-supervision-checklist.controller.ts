import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  closeFullySignedChecklist,
  renderSupervisionChecklistPdf,
  type CloseSupervisionChecklistResult,
} from '../services/rh-supervision-checklist-close.service';
import {
  createSupervisionChecklist,
  deleteSupervisionDraft,
  getSupervisionChecklist,
  listSupervisionChecklists,
  listSupervisionFormItems,
  saveSupervisionResults,
  updateSupervisionChecklist,
} from '../services/rh-supervision-checklist.service';
import {
  getPositionSupervisionConfig,
  listSupervisionPending,
  setPositionSupervisionConfig,
} from '../services/rh-supervision-position.service';
import { describeRoles, pendingSignerRoles } from '../services/rh-supervision-signature.rules';
import { cancelSignatureRequest, sendChecklistToSignature } from '../services/rh-supervision-signature.service';
import { assignPhase6Supervisor } from '../services/rh-supervision-signers.service';
import { generateSupervisionDrafts } from '../services/rh-supervision-draft-generator.service';
import {
  supervisionListQuerySchema,
  supervisionPendingQuerySchema,
  type AssignSupervisorBody,
  type GenerateDraftsBody,
  type CreateSupervisionChecklistBody,
  type SaveSupervisionResultsBody,
  type SendToSignatureBody,
  type SetPositionNaItemsBody,
  type UpdateSupervisionChecklistBody,
} from '../schemas/rh-supervision-checklist.schema';

/**
 * Endpoints de la Lista de verificacion de Supervision ANA-REG-060. Montados en
 * /api/rh/supervision-checklists, guard RH.SUPERVISION.MANAGE.
 */

export const parseId = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ERROR_STATUS: Record<string, number> = {
  RH_SUPERVISION_NOT_FOUND: 404,
  RH_SUPERVISION_EMPLOYEE_NOT_FOUND: 404,
  RH_SUPERVISION_POSITION_NOT_FOUND: 404,
  RH_SUPERVISION_ENROLLMENT_NOT_FOUND: 404,
  RH_SUPERVISION_ENROLLMENT_MISMATCH: 409,
  RH_SUPERVISION_ENROLLMENT_CANCELLED: 409,
  RH_SUPERVISION_FORM_EMPTY: 409,
  RH_SUPERVISION_ALREADY_CLOSED: 409,
  RH_SUPERVISION_SUPERVISOR_REQUIRED: 409,
  RH_SUPERVISION_RESPONSIBLE_REQUIRED: 409,
  RH_SUPERVISION_ITEMS_PENDING: 409,
  RH_SUPERVISION_NOTHING_EVALUATED: 409,
  RH_SUPERVISION_SGC_REFERENCE_REQUIRED: 409,
  RH_SUPERVISION_FINAL_WITHOUT_ENROLLMENT: 409,
  RH_SUPERVISION_PHASE_NOT_PUBLISHED: 409,
  RH_SUPERVISION_PRACTICAL_NOT_AVAILABLE: 409,
  RH_SUPERVISION_INVALID_SIGNATURE: 400,
  RH_SUPERVISION_IN_SIGNATURE: 409,
  RH_SUPERVISION_ENROLLMENT_IN_SIGNATURE: 409,
  RH_SUPERVISION_NOT_IN_SIGNATURE: 409,
  RH_SUPERVISION_SIGNERS_NOT_READY: 409,
  RH_SUPERVISION_SIGNERS_ASSIGNED: 409,
  RH_SUPERVISION_SIGNER_INVALID: 400,
  RH_SUPERVISION_AREA_NOT_FOUND: 400,
  RH_SUPERVISION_UNIT_NOT_FOUND: 400,
  RH_SUPERVISION_ALTERNATE_SAME: 400,
  RH_SUPERVISION_ALREADY_SIGNED: 409,
  RH_SUPERVISION_SIGNATURE_FILE_MISSING: 409,
  RH_SUPERVISION_HAS_SIGNATURE_HISTORY: 409,
  RH_SUPERVISION_SUPERVISOR_NOT_ASSIGNED: 409,
  RH_SUPERVISION_SUPERVISOR_INVALID: 400,
  RH_SUPERVISION_SELF_SUPERVISION: 409,
  RH_SUPERVISION_SELF_ENDORSEMENT: 409,
  RH_SUPERVISION_NOT_YOURS: 403,
  RH_SUPERVISION_NO_EMPLOYEE: 403,
  ARCHIVE_DOCUMENT_TYPE_NOT_FOUND: 409,
};

export const fail = (res: Response, error: any, logLabel: string, fallback: string): Response => {
  const status = ERROR_STATUS[error?.code];
  if (status) {
    return res.status(status).json({ message: error?.publicMessage || fallback });
  }
  console.error(`${logLabel}:`, error);
  return res.status(500).json({ message: fallback });
};

export const audit = async (req: AuthRequest, action: string, checklistId: number, employeeId: number, metadata?: Record<string, unknown>) => {
  const userId = req.user?.id;
  if (!userId) return;
  await registerAuditEvent({
    user_id: userId,
    action,
    ip_address: req.ip ?? null,
    module_code: 'RH',
    entity_type: 'supervision_checklist',
    entity_id: checklistId,
    employee_id: employeeId,
    metadata: metadata ?? null,
  }).catch((error) => console.error('Auditoria ANA-REG-060:', error));
};

/** Respuesta comun de una lista que se cerro sola (ultima firma o reintento de RH). */
export const closedMessage = (result: CloseSupervisionChecklistResult): string =>
  result.practical
    ? `Lista ${result.record.folio} cerrada y archivada en el expediente. ${result.practical.message}`
    : `Lista ${result.record.folio} cerrada y archivada en el expediente.`;

export const closedAuditMetadata = (result: CloseSupervisionChecklistResult): Record<string, unknown> => ({
  compliance_pct: result.record.compliance_pct,
  conclusion: result.record.conclusion,
  is_final: result.record.is_final,
  enrollment_id: result.record.enrollment_id,
  practical: result.practical,
});

const invalidQuery = (res: Response, issues: Array<{ path: PropertyKey[]; message: string }>) =>
  res.status(400).json({ message: 'Filtros invalidos', errors: issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) });

/** GET /rh/supervision-checklists/items */
export const listSupervisionFormItemsController = async (_req: AuthRequest, res: Response) => {
  try {
    return res.json({ items: await listSupervisionFormItems() });
  } catch (error) {
    return fail(res, error, 'Error listando items ANA-REG-060', 'No se pudo cargar el formato.');
  }
};

/** GET /rh/supervision-checklists/positions/:positionId/na-items */
export const getPositionNaItemsController = async (req: AuthRequest, res: Response) => {
  const positionId = parseId(req.params.positionId);
  if (!positionId) return res.status(400).json({ message: 'ID de puesto invalido.' });
  try {
    return res.json({ config: await getPositionSupervisionConfig(positionId) });
  } catch (error) {
    return fail(res, error, 'Error cargando items N/A del puesto', 'No se pudo cargar la configuracion del puesto.');
  }
};

/** PUT /rh/supervision-checklists/positions/:positionId/na-items {item_ids} */
export const setPositionNaItemsController = async (req: AuthRequest, res: Response) => {
  const positionId = parseId(req.params.positionId);
  if (!positionId) return res.status(400).json({ message: 'ID de puesto invalido.' });
  const body = req.body as SetPositionNaItemsBody;
  try {
    const config = await setPositionSupervisionConfig(positionId, body.item_ids);
    return res.json({ message: 'Items que no aplican al puesto actualizados.', config });
  } catch (error) {
    return fail(res, error, 'Error guardando items N/A del puesto', 'No se pudo guardar la configuracion del puesto.');
  }
};

/** GET /rh/supervision-checklists/pending?q=&area=&include_passed= */
export const listSupervisionPendingController = async (req: AuthRequest, res: Response) => {
  const parsed = supervisionPendingQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) return invalidQuery(res, parsed.error.issues);
  try {
    const rows = await listSupervisionPending({ search: parsed.data.q, area: parsed.data.area, includePassed: parsed.data.include_passed });
    return res.json({ rows });
  } catch (error) {
    return fail(res, error, 'Error listando pendientes de supervision', 'No se pudo cargar la bandeja de la Fase 6.');
  }
};

/** POST /rh/supervision-checklists/pending/assign-supervisor {enrollment_ids, supervisor_employee_id} */
export const assignSupervisorController = async (req: AuthRequest, res: Response) => {
  const body = req.body as AssignSupervisorBody;
  try {
    const updated = await assignPhase6Supervisor(body.enrollment_ids, body.supervisor_employee_id);
    const userId = req.user?.id;
    if (userId) {
      await registerAuditEvent({
        user_id: userId,
        action: 'RH_SUPERVISION_SUPERVISOR_ASSIGNED',
        ip_address: req.ip ?? null,
        module_code: 'RH',
        entity_type: 'induction_enrollment',
        entity_id: body.enrollment_ids[0] ?? null,
        employee_id: null,
        metadata: { enrollment_ids: body.enrollment_ids, supervisor_employee_id: body.supervisor_employee_id },
      }).catch((error) => console.error('Auditoria asignacion de supervisor:', error));
    }
    return res.json({ updated, message: body.supervisor_employee_id ? `Supervisor asignado a ${updated} inscripcion(es).` : `Supervisor retirado de ${updated} inscripcion(es).` });
  } catch (error) {
    return fail(res, error, 'Error asignando supervisor', 'No se pudo asignar el supervisor.');
  }
};

/** GET /rh/supervision-checklists?status=&employee_id=&position_id=&enrollment_id=&q=&page=&limit= */
export const listSupervisionChecklistsController = async (req: AuthRequest, res: Response) => {
  const parsed = supervisionListQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) return invalidQuery(res, parsed.error.issues);
  try {
    const pageResult = await listSupervisionChecklists({
      status: parsed.data.status,
      employeeId: parsed.data.employee_id,
      positionId: parsed.data.position_id,
      enrollmentId: parsed.data.enrollment_id,
      processArea: parsed.data.area,
      search: parsed.data.q,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return res.json(pageResult);
  } catch (error) {
    return fail(res, error, 'Error listando listas de supervision', 'No se pudieron cargar las listas.');
  }
};

/** POST /rh/supervision-checklists */
export const createSupervisionChecklistController = async (req: AuthRequest, res: Response) => {
  const body = req.body as CreateSupervisionChecklistBody;
  try {
    const record = await createSupervisionChecklist({
      employeeId: body.employee_id ?? null,
      positionId: body.position_id ?? null,
      enrollmentId: body.enrollment_id ?? null,
      supervisionDate: body.supervision_date,
      supervisionType: body.supervision_type,
      supervisorName: body.supervisor_name ?? null,
      areaResponsibleName: body.area_responsible_name ?? null,
      areaName: body.area_name ?? null,
      createdByUserId: req.user?.id ?? null,
      reuseDraft: body.reuse_draft ?? true,
    });
    await audit(req, `RH_SUPERVISION_CREATED:${record.id}`, record.id, record.employee_id, { enrollment_id: record.enrollment_id, position_id: record.position_id });
    return res.status(201).json({ message: `Lista ${record.folio} abierta.`, checklist: record });
  } catch (error) {
    return fail(res, error, 'Error creando lista de supervision', 'No se pudo abrir la lista de verificacion.');
  }
};

/** GET /rh/supervision-checklists/:id */
export const getSupervisionChecklistController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    return res.json({ checklist: await getSupervisionChecklist(id) });
  } catch (error) {
    return fail(res, error, 'Error cargando lista de supervision', 'No se pudo cargar la lista.');
  }
};

/** PATCH /rh/supervision-checklists/:id */
export const updateSupervisionChecklistController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const body = req.body as UpdateSupervisionChecklistBody;
  try {
    const record = await updateSupervisionChecklist(id, {
      supervisionDate: body.supervision_date,
      supervisionType: body.supervision_type,
      areaName: body.area_name,
      supervisorEmployeeId: body.supervisor_employee_id,
      areaResponsibleEmployeeId: body.area_responsible_employee_id,
      sgcFollowUpRequired: body.sgc_follow_up_required,
      sgcReference: body.sgc_reference,
      supervisorComments: body.supervisor_comments,
    });
    return res.json({ message: 'Lista actualizada.', checklist: record });
  } catch (error) {
    return fail(res, error, 'Error actualizando lista de supervision', 'No se pudo actualizar la lista.');
  }
};

/** PUT /rh/supervision-checklists/:id/results */
export const saveSupervisionResultsController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const body = req.body as SaveSupervisionResultsBody;
  try {
    const record = await saveSupervisionResults(
      id,
      body.results.map((entry) => ({ item_id: entry.item_id, result: entry.result, observations: entry.observations ?? null })),
    );
    return res.json({ message: 'Resultados guardados.', checklist: record });
  } catch (error) {
    return fail(res, error, 'Error guardando resultados de supervision', 'No se pudieron guardar los resultados.');
  }
};

/** POST /rh/supervision-checklists/:id/send-to-signature {is_final?, header?} */
export const sendToSignatureController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const actorUserId = req.user?.id;
  if (!actorUserId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  const body = req.body as SendToSignatureBody;
  try {
    const checklist = await sendChecklistToSignature({
      id,
      isFinal: body.is_final,
      header: body.header
        ? {
            supervisionDate: body.header.supervision_date,
            supervisionType: body.header.supervision_type,
            areaName: body.header.area_name,
            supervisorEmployeeId: body.header.supervisor_employee_id,
            areaResponsibleEmployeeId: body.header.area_responsible_employee_id,
            sgcFollowUpRequired: body.header.sgc_follow_up_required,
            sgcReference: body.header.sgc_reference,
            supervisorComments: body.header.supervisor_comments,
          }
        : undefined,
      userId: actorUserId,
    });
    await audit(req, `RH_SUPERVISION_SENT_TO_SIGNATURE:${id}`, id, checklist.employee_id, {
      is_final: checklist.is_final,
      enrollment_id: checklist.enrollment_id,
      compliance_pct: checklist.summary.compliance_pct,
      signers: checklist.signers.map((signer) => ({ role: signer.role, employee_id: signer.employee_id })),
      sent_by: 'rh',
    });
    return res.json({
      // Sin repetir a quien ocupa dos roles.
      message: `Lista ${checklist.folio} enviada a firma: se cerrara sola cuando firmen ${[...new Set(checklist.signers.map((signer) => signer.name))].join(', ')}.`,
      checklist,
    });
  } catch (error) {
    return fail(res, error, 'Error enviando lista de supervision a firma', 'No se pudo enviar la lista a firma.');
  }
};

/** POST /rh/supervision-checklists/:id/cancel-signature  (regresa a borrador e invalida las firmas recabadas) */
export const cancelSignatureController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const actorUserId = req.user?.id;
  if (!actorUserId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  try {
    const { record, invalidated } = await cancelSignatureRequest(id, actorUserId);
    await audit(req, `RH_SUPERVISION_SIGNATURE_CANCELLED:${id}`, id, record.employee_id, {
      enrollment_id: record.enrollment_id,
      invalidated_signatures: invalidated,
    });
    const message =
      invalidated.length > 0
        ? `Envio a firma cancelado: la lista ${record.folio} regreso a borrador y ${invalidated.length} firma(s) recabada(s) quedaron invalidadas.`
        : `Envio a firma cancelado: la lista ${record.folio} regreso a borrador.`;
    return res.json({ message, checklist: record });
  } catch (error) {
    return fail(res, error, 'Error cancelando el envio a firma', 'No se pudo cancelar el envio a firma.');
  }
};

/**
 * POST /rh/supervision-checklists/:id/close
 * Reintento del cierre automatico: solo procede con las tres firmas ya
 * recabadas (cuando el cierre fallo al firmar el ultimo, p. ej. por la
 * practica del puesto sin publicar). No recibe firmas: nadie firma desde RH.
 */
export const retryCloseController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  const actorUserId = req.user?.id;
  if (!actorUserId) return res.status(401).json({ message: 'Sesion invalida o expirada' });
  try {
    const result = await closeFullySignedChecklist(id, actorUserId);
    if (!result) {
      const record = await getSupervisionChecklist(id);
      if (record.status === 'CLOSED') return res.status(409).json({ message: 'La lista ya esta cerrada y firmada.' });
      if (record.status === 'DRAFT') return res.status(409).json({ message: 'La lista esta en borrador: enviala a firma.' });
      const missing = pendingSignerRoles(record.signers.filter((signer) => signer.signed_at).map((signer) => signer.role));
      return res.status(409).json({ message: `Aun falta la firma de ${describeRoles(missing)}; la lista se cerrara sola al reunirlas.` });
    }
    await audit(req, `RH_SUPERVISION_CLOSED:${id}`, id, result.record.employee_id, { ...closedAuditMetadata(result), closed_via: 'rh_retry' });
    return res.status(201).json({ message: closedMessage(result), checklist: result.record, practical: result.practical });
  } catch (error) {
    return fail(res, error, 'Error cerrando lista de supervision', 'No se pudo cerrar la lista.');
  }
};

/** DELETE /rh/supervision-checklists/:id (solo borradores) */
export const deleteSupervisionDraftController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    const record = await getSupervisionChecklist(id);
    await deleteSupervisionDraft(id);
    await audit(req, `RH_SUPERVISION_DRAFT_DELETED:${id}`, id, record.employee_id, { folio: record.folio });
    return res.json({ message: 'Borrador eliminado.' });
  } catch (error) {
    return fail(res, error, 'Error eliminando borrador de supervision', 'No se pudo eliminar el borrador.');
  }
};

/** GET /rh/supervision-checklists/:id/pdf */
export const getSupervisionChecklistPdfController = async (req: AuthRequest, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido.' });
  try {
    const { record, pdf } = await renderSupervisionChecklistPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${record.folio}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    return fail(res, error, 'Error generando PDF de supervision', 'No se pudo generar el PDF.');
  }
};

/** POST /rh/supervision-checklists/pending/generate {employee_ids?} */
export const generateSupervisionDraftsController = async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as GenerateDraftsBody;
  try {
    const result = await generateSupervisionDrafts(req.user?.id ?? null, body.employee_ids);
    if (req.user?.id) {
      await registerAuditEvent({
        user_id: req.user.id,
        action: `RH_SUPERVISION_DRAFTS_GENERATED:${result.created}`,
        ip_address: req.ip ?? null,
        module_code: 'RH',
        entity_type: 'supervision_checklist',
        entity_id: null,
        metadata: { created: result.created, failed: result.failed, areas_without_signatories: result.areas_without_signatories },
      }).catch(() => undefined);
    }
    const message =
      result.created > 0
        ? `${result.created} borrador(es) abiertos.${result.failed ? ` ${result.failed} no se pudieron abrir.` : ''}`
        : result.failed > 0
          ? `No se abrieron borradores: ${result.failed} inscripcion(es) con error.`
          : 'Todas las inscripciones activas de la Fase 6 ya tienen su lista.';
    return res.json({ message, result });
  } catch (error) {
    return fail(res, error, 'Error generando borradores ANA-REG-060', 'No se pudieron generar los borradores.');
  }
};
