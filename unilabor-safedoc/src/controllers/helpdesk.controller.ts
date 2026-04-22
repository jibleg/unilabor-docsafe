import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { registerAuditEvent } from '../services/audit.service';
import {
  createHelpdeskAsset,
  deactivateHelpdeskAsset,
  getHelpdeskAssetById,
  listHelpdeskAssetsByEmployee,
  listHelpdeskAssets,
  listHelpdeskCatalogs,
  type HelpdeskAssetPayload,
  updateHelpdeskAsset,
} from '../services/helpdesk-asset.service';
import {
  addHelpdeskTicketComment,
  addMyHelpdeskTicketComment,
  confirmMyHelpdeskTicketFunctionality,
  createHelpdeskTicket,
  createMyHelpdeskTicket,
  evaluateHelpdeskTicketIsoRisk,
  getHelpdeskDashboardMetrics,
  getHelpdeskSummaryWithTickets,
  getHelpdeskTicketById,
  getMyHelpdeskTicketById,
  listHelpdeskTicketCatalogs,
  listHelpdeskTickets,
  listMyHelpdeskTickets,
  releaseHelpdeskTicketTechnically,
  solveHelpdeskTicket,
  type HelpdeskTicketIsoRiskPayload,
  type HelpdeskTicketPayload,
  type HelpdeskTicketReturnPayload,
  type HelpdeskTicketSolutionPayload,
  type HelpdeskTicketTechnicalReleasePayload,
  updateHelpdeskTicket,
  validateHelpdeskTicketReturn,
} from '../services/helpdesk-ticket.service';
import { getEmployeeByUserId } from '../services/employee.service';
import {
  closeMaintenanceOrder,
  createMaintenancePlan,
  getPreventiveDueCount,
  listMaintenanceCatalogs,
  listMaintenanceOrders,
  listMaintenancePlans,
  rescheduleMaintenanceOrder,
  startMaintenanceOrder,
  type HelpdeskMaintenanceOrderClosePayload,
  type HelpdeskMaintenanceOrderReschedulePayload,
  type HelpdeskMaintenancePlanPayload,
  updateMaintenancePlan,
} from '../services/helpdesk-maintenance.service';

const getText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const getNumberId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
};

const mapHelpdeskError = (res: Response, error: any) => {
  if (error?.code === 'HELPDESK_ASSETS_TABLE_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'Las tablas de activos Helpdesk no existen. Ejecuta la migracion del Sprint 14.',
    });
  }

  if (error?.code === 'HELPDESK_TICKETS_TABLE_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'Las tablas de tickets Helpdesk no existen. Ejecuta la migracion del Sprint 15.',
    });
  }

  if (error?.code === 'HELPDESK_EMPLOYEE_PROFILE_NOT_FOUND') {
    return res.status(409).json({
      message: 'Tu usuario no esta vinculado a un colaborador activo de RH.',
    });
  }

  if (error?.code === 'HELPDESK_ASSET_NOT_ASSIGNED_TO_EMPLOYEE') {
    return res.status(403).json({
      message: 'No puedes crear solicitudes sobre un activo que no esta asignado a tu colaborador.',
    });
  }

  if (error?.code === 'HELPDESK_TICKET_NOT_SOLVED') {
    return res.status(409).json({
      message: 'Solo puedes confirmar funcionamiento cuando soporte registro una solucion.',
    });
  }

  if (error?.code === 'HELPDESK_MAINTENANCE_TABLES_NOT_AVAILABLE') {
    return res.status(409).json({
      message: 'Las tablas de mantenimiento Helpdesk no existen. Ejecuta la migracion del Sprint 17.',
    });
  }

  if (error?.code === 'HELPDESK_TECHNICAL_RELEASE_REQUIRED') {
    return res.status(409).json({
      message: 'Este ticket requiere liberacion tecnica documentada antes del retorno a operacion.',
    });
  }

  if (
    error?.code === '42703' &&
    typeof error?.message === 'string' &&
    ['risk_level', 'technical_release', 'operational_lock'].some((fieldName) =>
      error.message.toLowerCase().includes(fieldName),
    )
  ) {
    return res.status(409).json({
      message: 'La evaluacion ISO/riesgo no esta disponible. Ejecuta la migracion del Sprint 19.',
    });
  }

  if (
    (error?.code === '42703' || error?.code === '42P01') &&
    typeof error?.message === 'string' &&
    error.message.toLowerCase().includes('helpdesk_maintenance')
  ) {
    return res.status(409).json({
      message: 'La ejecucion de mantenimiento no esta disponible. Ejecuta la migracion del Sprint 18.',
    });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ message: 'Ya existe un activo con ese codigo interno.' });
  }

  if (error?.code === '23503') {
    return res.status(400).json({
      message: 'Uno de los catalogos, colaboradores o usuarios relacionados no existe.',
    });
  }

  return null;
};

const getBoolean = (value: unknown): boolean => value === true || value === 'true' || value === 1 || value === '1';

const getAssetPayload = (body: any): HelpdeskAssetPayload | null => {
  const assetCode = getText(body?.asset_code);
  const name = getText(body?.name);

  if (!assetCode || !name) {
    return null;
  }

  return {
    asset_code: assetCode,
    name,
    description: getText(body?.description),
    category_id: getNumberId(body?.category_id),
    unit_id: getNumberId(body?.unit_id),
    area_id: getNumberId(body?.area_id),
    location_id: getNumberId(body?.location_id),
    brand_id: getNumberId(body?.brand_id),
    brand_name: getText(body?.brand_name),
    model: getText(body?.model),
    serial_number: getText(body?.serial_number),
    complementary_info: getText(body?.complementary_info),
    purchase_modality_id: getNumberId(body?.purchase_modality_id),
    purchase_condition_id: getNumberId(body?.purchase_condition_id),
    assigned_employee_id: getNumberId(body?.assigned_employee_id),
    responsible_employee_id: getNumberId(body?.responsible_employee_id),
    criticality_id: getNumberId(body?.criticality_id),
    operational_status_id: getNumberId(body?.operational_status_id),
    acquired_on: getText(body?.acquired_on),
    warranty_expires_on: getText(body?.warranty_expires_on),
    inventory_legacy_code: getText(body?.inventory_legacy_code),
    legacy_consecutive: getText(body?.legacy_consecutive),
    legacy_component_consecutive: getText(body?.legacy_component_consecutive),
    notes: getText(body?.notes),
  };
};

const getTicketPayload = (body: any): HelpdeskTicketPayload | null => {
  const title = getText(body?.title);
  const description = getText(body?.description);

  if (!title || !description) {
    return null;
  }

  return {
    asset_id: getNumberId(body?.asset_id),
    request_type_id: getNumberId(body?.request_type_id),
    status_id: getNumberId(body?.status_id),
    priority_id: getNumberId(body?.priority_id),
    requester_employee_id: getNumberId(body?.requester_employee_id),
    assigned_employee_id: getNumberId(body?.assigned_employee_id),
    title,
    description,
    operational_impact: getText(body?.operational_impact),
    affects_results: getBoolean(body?.affects_results),
    due_at: getText(body?.due_at),
  };
};

const getTicketSolutionPayload = (body: any): HelpdeskTicketSolutionPayload | null => {
  const solvedAt = getText(body?.solved_at);
  const solutionSummary = getText(body?.solution_summary);

  if (!solvedAt || !solutionSummary) {
    return null;
  }

  return {
    solved_at: solvedAt,
    solution_summary: solutionSummary,
    equipment_status_after_solution_id: getNumberId(body?.equipment_status_after_solution_id),
  };
};

const getTicketReturnPayload = (body: any): HelpdeskTicketReturnPayload | null => {
  const returnToOperationAt = getText(body?.return_to_operation_at);

  if (!returnToOperationAt) {
    return null;
  }

  return {
    return_to_operation_at: returnToOperationAt,
    equipment_status_after_solution_id: getNumberId(body?.equipment_status_after_solution_id),
  };
};

const getTicketIsoRiskPayload = (body: any): HelpdeskTicketIsoRiskPayload | null => {
  const riskLevel = getText(body?.risk_level);
  const impactEvaluation = getText(body?.impact_evaluation);

  if (!riskLevel || !impactEvaluation) {
    return null;
  }

  return {
    risk_level: riskLevel,
    impact_evaluation: impactEvaluation,
    recent_analysis_usage: getText(body?.recent_analysis_usage),
    alternate_equipment_used: getBoolean(body?.alternate_equipment_used),
    alternate_equipment_notes: getText(body?.alternate_equipment_notes),
    corrective_action_required: getBoolean(body?.corrective_action_required),
    corrective_action_notes: getText(body?.corrective_action_notes),
    technical_release_required: getBoolean(body?.technical_release_required),
    quality_document_id: getText(body?.quality_document_id),
    operational_lock: body?.operational_lock === undefined ? undefined : getBoolean(body?.operational_lock),
  };
};

const getTicketTechnicalReleasePayload = (body: any): HelpdeskTicketTechnicalReleasePayload | null => {
  const technicalReleaseSummary = getText(body?.technical_release_summary);

  if (!technicalReleaseSummary) {
    return null;
  }

  return {
    technical_release_summary: technicalReleaseSummary,
    equipment_status_after_solution_id: getNumberId(body?.equipment_status_after_solution_id),
  };
};

const getMaintenancePlanPayload = (body: any): HelpdeskMaintenancePlanPayload | null => {
  const assetId = getNumberId(body?.asset_id);
  const title = getText(body?.title);
  const startsOn = getText(body?.starts_on);
  const nextDueOn = getText(body?.next_due_on);

  if (!assetId || !title || !startsOn || !nextDueOn) {
    return null;
  }

  const taskValues = Array.isArray(body?.tasks)
    ? body.tasks.map((task: unknown) => getText(task)).filter((task: string | null): task is string => Boolean(task))
    : [];

  return {
    asset_id: assetId,
    frequency_id: getNumberId(body?.frequency_id),
    responsible_employee_id: getNumberId(body?.responsible_employee_id),
    quality_document_id: getText(body?.quality_document_id),
    title,
    description: getText(body?.description),
    provider_name: getText(body?.provider_name),
    starts_on: startsOn,
    next_due_on: nextDueOn,
    tolerance_before_days: Number(body?.tolerance_before_days ?? 0),
    tolerance_after_days: Number(body?.tolerance_after_days ?? 0),
    checklist_required: body?.checklist_required === undefined ? true : getBoolean(body?.checklist_required),
    evidence_required: body?.evidence_required === undefined ? true : getBoolean(body?.evidence_required),
    tasks: taskValues,
  };
};

const getMaintenanceOrderClosePayload = (body: any): HelpdeskMaintenanceOrderClosePayload | null => {
  const completedAt = getText(body?.completed_at);
  const performedActivities = getText(body?.performed_activities);
  const result = getText(body?.result);

  if (!completedAt || !performedActivities || !result) {
    return null;
  }

  const checklist = Array.isArray(body?.checklist)
    ? body.checklist
        .map((item: any) => ({
          plan_task_id: getNumberId(item?.plan_task_id),
          task_text: getText(item?.task_text) ?? '',
          result: getText(item?.result) ?? 'PENDING',
          notes: getText(item?.notes),
        }))
        .filter((item: { task_text: string }) => item.task_text.length > 0)
    : [];

  return {
    completed_at: completedAt,
    performed_activities: performedActivities,
    result,
    findings: getText(body?.findings),
    provider_name: getText(body?.provider_name),
    evidence_notes: getText(body?.evidence_notes),
    checklist,
  };
};

const getMaintenanceOrderReschedulePayload = (body: any): HelpdeskMaintenanceOrderReschedulePayload | null => {
  const scheduledFor = getText(body?.scheduled_for);
  const rescheduleReason = getText(body?.reschedule_reason);

  if (!scheduledFor || !rescheduleReason) {
    return null;
  }

  return {
    scheduled_for: scheduledFor,
    reschedule_reason: rescheduleReason,
  };
};

const logHelpdeskAudit = async (
  userId: string | undefined,
  action: string,
  ipAddress: string | undefined,
  entityId: number,
  entityType = 'helpdesk_asset',
) => {
  if (!userId) {
    return;
  }

  await registerAuditEvent({
    user_id: userId,
    action,
    ip_address: ipAddress ?? null,
    module_code: 'HELPDESK',
    entity_type: entityType,
    entity_id: entityId,
  });
};

export const getHelpdeskSummaryController = async (_req: AuthRequest, res: Response) => {
  try {
    const summary = await getHelpdeskSummaryWithTickets();
    const preventiveDue = await getPreventiveDueCount();
    return res.json({
      summary: {
        ...summary,
        preventive_due: preventiveDue,
      },
    });
  } catch (error) {
    console.error('Error obteniendo resumen Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el resumen de Helpdesk.' });
  }
};

export const listMyHelpdeskAssetsController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const employee = await getEmployeeByUserId(req.user.id);
    if (!employee) {
      return res.status(409).json({ message: 'Tu usuario no esta vinculado a un colaborador activo de RH.' });
    }

    const assets = await listHelpdeskAssetsByEmployee(employee.id);
    return res.json({ employee, assets });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando mis activos Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar tus equipos asignados.' });
  }
};

export const listMyHelpdeskTicketsController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  try {
    const tickets = await listMyHelpdeskTickets(req.user.id);
    return res.json({ tickets });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando mis tickets Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar tus solicitudes.' });
  }
};

export const getMyHelpdeskTicketByIdController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  try {
    const ticket = await getMyHelpdeskTicketById(ticketId, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    return res.json({ ticket });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo mi ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo cargar tu solicitud.' });
  }
};

export const createMyHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }

  const payload = getTicketPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Titulo y descripcion de la solicitud son obligatorios.' });
  }

  try {
    const ticket = await createMyHelpdeskTicket(payload, req.user.id);
    await logHelpdeskAudit(req.user.id, `HELPDESK_MY_TICKET_CREATE:${ticket.id}`, req.ip, ticket.id, 'helpdesk_ticket');

    return res.status(201).json({
      message: 'Solicitud registrada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando mi ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar tu solicitud.' });
  }
};

export const addMyHelpdeskTicketCommentController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const comment = getText(req.body?.comment);
  if (!comment) {
    return res.status(400).json({ message: 'El comentario es obligatorio.' });
  }

  try {
    const ticket = await addMyHelpdeskTicketComment(ticketId, comment, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user.id, `HELPDESK_MY_TICKET_COMMENT:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Comentario agregado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error comentando mi ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo agregar el comentario.' });
  }
};

export const confirmMyHelpdeskTicketFunctionalityController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Sesion invalida o expirada.' });
  }
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  try {
    const ticket = await confirmMyHelpdeskTicketFunctionality(ticketId, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user.id, `HELPDESK_MY_TICKET_CONFIRM:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Funcionamiento confirmado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error confirmando funcionamiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo confirmar el funcionamiento.' });
  }
};

export const getHelpdeskDashboardController = async (_req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getHelpdeskDashboardMetrics();
    return res.json({ dashboard });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo dashboard Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el dashboard de Helpdesk.' });
  }
};

export const listMaintenanceCatalogsController = async (_req: AuthRequest, res: Response) => {
  try {
    const catalogs = await listMaintenanceCatalogs();
    return res.json({ catalogs });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando catalogos mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los catalogos de mantenimiento.' });
  }
};

export const listMaintenancePlansController = async (_req: AuthRequest, res: Response) => {
  try {
    const plans = await listMaintenancePlans();
    return res.json({ plans });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando planes mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los planes de mantenimiento.' });
  }
};

export const listMaintenanceOrdersController = async (_req: AuthRequest, res: Response) => {
  try {
    const orders = await listMaintenanceOrders();
    return res.json({ orders });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando ordenes mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las ordenes de mantenimiento.' });
  }
};

export const createMaintenancePlanController = async (req: AuthRequest, res: Response) => {
  const payload = getMaintenancePlanPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Activo, titulo, inicio y proxima ejecucion son obligatorios.' });
  }

  try {
    const plan = await createMaintenancePlan(payload, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_PLAN_CREATE:${plan.id}`, req.ip, plan.id, 'helpdesk_maintenance_plan');

    return res.status(201).json({
      message: 'Plan de mantenimiento creado correctamente.',
      plan,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando plan mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo crear el plan de mantenimiento.' });
  }
};

export const updateMaintenancePlanController = async (req: AuthRequest, res: Response) => {
  const planId = getNumberId(req.params.id);
  if (!planId) {
    return res.status(400).json({ message: 'ID de plan invalido.' });
  }

  const payload = getMaintenancePlanPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Activo, titulo, inicio y proxima ejecucion son obligatorios.' });
  }

  try {
    const plan = await updateMaintenancePlan(planId, payload, req.user?.id ?? null);
    if (!plan) {
      return res.status(404).json({ message: 'Plan de mantenimiento no encontrado.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_PLAN_UPDATE:${planId}`, req.ip, planId, 'helpdesk_maintenance_plan');

    return res.json({
      message: 'Plan de mantenimiento actualizado correctamente.',
      plan,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando plan mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el plan de mantenimiento.' });
  }
};

export const startMaintenanceOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }

  try {
    const order = await startMaintenanceOrder(orderId, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de mantenimiento no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ORDER_START:${orderId}`, req.ip, orderId, 'helpdesk_maintenance_order');

    return res.json({
      message: 'Orden de mantenimiento iniciada correctamente.',
      order,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error iniciando orden mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo iniciar la orden de mantenimiento.' });
  }
};

export const rescheduleMaintenanceOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }

  const payload = getMaintenanceOrderReschedulePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Nueva fecha y justificacion son obligatorias.' });
  }

  try {
    const order = await rescheduleMaintenanceOrder(orderId, payload, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de mantenimiento no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ORDER_RESCHEDULE:${orderId}`, req.ip, orderId, 'helpdesk_maintenance_order');

    return res.json({
      message: 'Orden de mantenimiento reprogramada correctamente.',
      order,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error reprogramando orden mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo reprogramar la orden de mantenimiento.' });
  }
};

export const closeMaintenanceOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }

  const payload = getMaintenanceOrderClosePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Fecha de cierre, actividades realizadas y resultado son obligatorios.' });
  }

  try {
    const order = await closeMaintenanceOrder(orderId, payload, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de mantenimiento no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ORDER_CLOSE:${orderId}`, req.ip, orderId, 'helpdesk_maintenance_order');

    return res.json({
      message: 'Orden de mantenimiento cerrada correctamente.',
      order,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error cerrando orden mantenimiento Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo cerrar la orden de mantenimiento.' });
  }
};

export const listHelpdeskTicketCatalogsController = async (_req: AuthRequest, res: Response) => {
  try {
    const catalogs = await listHelpdeskTicketCatalogs();
    return res.json({ catalogs });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando catalogos de tickets Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los catalogos de tickets.' });
  }
};

export const listHelpdeskTicketsController = async (_req: AuthRequest, res: Response) => {
  try {
    const tickets = await listHelpdeskTickets();
    return res.json({ tickets });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando tickets Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las solicitudes.' });
  }
};

export const getHelpdeskTicketByIdController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    return res.json({ ticket });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener la solicitud.' });
  }
};

export const createHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const payload = getTicketPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Titulo y descripcion de la solicitud son obligatorios.' });
  }

  try {
    const ticket = await createHelpdeskTicket(payload, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_CREATE:${ticket.id}`, req.ip, ticket.id, 'helpdesk_ticket');

    return res.status(201).json({
      message: 'Solicitud registrada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar la solicitud.' });
  }
};

export const updateHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Titulo y descripcion de la solicitud son obligatorios.' });
  }

  try {
    const ticket = await updateHelpdeskTicket(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_UPDATE:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Solicitud actualizada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando ticket Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la solicitud.' });
  }
};

export const addHelpdeskTicketCommentController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const comment = getText(req.body?.comment);
  if (!comment) {
    return res.status(400).json({ message: 'El comentario es obligatorio.' });
  }

  try {
    const ticket = await addHelpdeskTicketComment(ticketId, comment, getBoolean(req.body?.is_internal), req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_COMMENT:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Comentario agregado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error agregando comentario Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo agregar el comentario.' });
  }
};

export const evaluateHelpdeskTicketIsoRiskController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketIsoRiskPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Nivel de riesgo y evaluacion de impacto son obligatorios.' });
  }

  try {
    const ticket = await evaluateHelpdeskTicketIsoRisk(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_ISO_RISK:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Evaluacion ISO/riesgo registrada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error registrando evaluacion ISO/riesgo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar la evaluacion ISO/riesgo.' });
  }
};

export const releaseHelpdeskTicketTechnicallyController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketTechnicalReleasePayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'El resumen de liberacion tecnica es obligatorio.' });
  }

  try {
    const ticket = await releaseHelpdeskTicketTechnically(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_TECHNICAL_RELEASE:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Liberacion tecnica documentada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error documentando liberacion tecnica Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo documentar la liberacion tecnica.' });
  }
};

export const solveHelpdeskTicketController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketSolutionPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Fecha de solucion y resumen tecnico son obligatorios.' });
  }

  try {
    const ticket = await solveHelpdeskTicket(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_SOLVE:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Solucion tecnica registrada correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error registrando solucion Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar la solucion tecnica.' });
  }
};

export const validateHelpdeskTicketReturnController = async (req: AuthRequest, res: Response) => {
  const ticketId = getNumberId(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'ID de ticket invalido.' });
  }

  const payload = getTicketReturnPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'La fecha de retorno a operacion es obligatoria.' });
  }

  try {
    const ticket = await validateHelpdeskTicketReturn(ticketId, payload, req.user?.id ?? null);
    if (!ticket) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_TICKET_VALIDATE_RETURN:${ticketId}`, req.ip, ticketId, 'helpdesk_ticket');

    return res.json({
      message: 'Retorno a operacion validado correctamente.',
      ticket,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error validando retorno Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo validar el retorno a operacion.' });
  }
};

export const listHelpdeskCatalogsController = async (_req: AuthRequest, res: Response) => {
  try {
    const catalogs = await listHelpdeskCatalogs();
    return res.json({ catalogs });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando catalogos Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los catalogos Helpdesk.' });
  }
};

export const listHelpdeskAssetsController = async (_req: AuthRequest, res: Response) => {
  try {
    const assets = await listHelpdeskAssets();
    return res.json({ assets });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error listando activos Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los activos.' });
  }
};

export const getHelpdeskAssetByIdController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  try {
    const asset = await getHelpdeskAssetById(assetId);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }

    return res.json({ asset });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error obteniendo activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo obtener el activo.' });
  }
};

export const createHelpdeskAssetController = async (req: AuthRequest, res: Response) => {
  const payload = getAssetPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Codigo interno y nombre del activo son obligatorios.' });
  }

  try {
    const asset = await createHelpdeskAsset(payload, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_CREATE:${asset.id}`, req.ip, asset.id);

    return res.status(201).json({
      message: 'Activo registrado correctamente.',
      asset,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo registrar el activo.' });
  }
};

export const updateHelpdeskAssetController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  const payload = getAssetPayload(req.body);
  if (!payload) {
    return res.status(400).json({ message: 'Codigo interno y nombre del activo son obligatorios.' });
  }

  try {
    const asset = await updateHelpdeskAsset(assetId, payload, req.user?.id ?? null);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_UPDATE:${assetId}`, req.ip, assetId);

    return res.json({
      message: 'Activo actualizado correctamente.',
      asset,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el activo.' });
  }
};

export const deleteHelpdeskAssetController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.id);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }

  try {
    const asset = await deactivateHelpdeskAsset(assetId, req.user?.id ?? null);
    if (!asset) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }

    await logHelpdeskAudit(req.user?.id, `HELPDESK_ASSET_DELETE:${assetId}`, req.ip, assetId);

    return res.json({
      message: 'Activo dado de baja correctamente.',
      asset,
    });
  } catch (error: any) {
    const mappedError = mapHelpdeskError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error inactivando activo Helpdesk:', error);
    return res.status(500).json({ message: 'No se pudo dar de baja el activo.' });
  }
};
