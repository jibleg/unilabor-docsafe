import type { Response } from 'express';
import type { AuthRequest } from '../types';
import { getNumberId, mapHelpdeskError, logHelpdeskAudit } from './helpdesk-controller.shared';
import {
  createMaintenanceTemplate,
  getMaintenanceTemplateById,
  listMaintenanceTemplates,
  setMaintenanceTemplateActive,
  updateMaintenanceTemplate,
} from '../services/helpdesk-maintenance-template.service';
import {
  createAssetProgramVersion,
  deactivateRoutine,
  getAssetProgramOverview,
  getRoutineById,
  pauseRoutine,
  proposeRoutinesFromTemplate,
  resumeRoutine,
  setProgramProjectionMonths,
  updateRoutine,
} from '../services/helpdesk-asset-program.service';
import { getCoverage, listCalendarEvents, type CalendarEventKind } from '../services/helpdesk-service-calendar.service';
import { getMaintenanceOrderById } from '../services/helpdesk-maintenance.service';
import {
  attachOrderEvidence,
  closeMaintenanceOrder,
  listOrderEvidence,
  validateMaintenanceOrder,
} from '../services/helpdesk-maintenance-execution.service';
import type {
  AssetProgramInput,
  MaintenanceTemplateInput,
  OrderExecutionInput,
  OrderValidationInput,
  ProgramRoutineInput,
} from '../schemas/helpdesk-program.schema';

/** Controladores del Programa de Mantenimiento: plantillas, programa por activo, calendario y ejecucion. */

const fail = (res: Response, error: any, log: string, message: string) => {
  const mapped = mapHelpdeskError(res, error);
  if (mapped) {
    return mapped;
  }
  console.error(log, error);
  return res.status(500).json({ message });
};

const queryText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const queryList = (value: unknown): string[] =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : Array.isArray(value) ? value.map(String) : [];

// --- Plantillas -------------------------------------------------------------
export const listTemplatesController = async (req: AuthRequest, res: Response) => {
  try {
    const templates = await listMaintenanceTemplates({
      includeInactive: req.query.include_inactive === 'true',
      categoryId: getNumberId(req.query.category_id),
    });
    return res.json({ templates });
  } catch (error: any) {
    return fail(res, error, 'Error listando plantillas de mantenimiento:', 'No se pudieron cargar las plantillas.');
  }
};

export const getTemplateController = async (req: AuthRequest, res: Response) => {
  const templateId = getNumberId(req.params.id);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de plantilla invalido.' });
  }
  try {
    const template = await getMaintenanceTemplateById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Plantilla no encontrada.' });
    }
    return res.json({ template });
  } catch (error: any) {
    return fail(res, error, 'Error consultando plantilla de mantenimiento:', 'No se pudo cargar la plantilla.');
  }
};

export const createTemplateController = async (req: AuthRequest, res: Response) => {
  try {
    const template = await createMaintenanceTemplate(req.body as MaintenanceTemplateInput, req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_TEMPLATE_CREATE:${template.id}`, req.ip, template.id, 'helpdesk_maintenance_template');
    return res.status(201).json({ message: 'Plantilla creada correctamente.', template });
  } catch (error: any) {
    return fail(res, error, 'Error creando plantilla de mantenimiento:', 'No se pudo crear la plantilla.');
  }
};

export const updateTemplateController = async (req: AuthRequest, res: Response) => {
  const templateId = getNumberId(req.params.id);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de plantilla invalido.' });
  }
  try {
    const template = await updateMaintenanceTemplate(templateId, req.body as MaintenanceTemplateInput, req.user?.id ?? null);
    if (!template) {
      return res.status(404).json({ message: 'Plantilla no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_TEMPLATE_UPDATE:${templateId}`, req.ip, templateId, 'helpdesk_maintenance_template');
    return res.json({ message: 'Plantilla actualizada correctamente.', template });
  } catch (error: any) {
    return fail(res, error, 'Error actualizando plantilla de mantenimiento:', 'No se pudo actualizar la plantilla.');
  }
};

export const setTemplateActiveController = async (req: AuthRequest, res: Response) => {
  const templateId = getNumberId(req.params.id);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de plantilla invalido.' });
  }
  const isActive = req.body?.is_active !== false;
  try {
    const ok = await setMaintenanceTemplateActive(templateId, isActive, req.user?.id ?? null);
    if (!ok) {
      return res.status(404).json({ message: 'Plantilla no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_TEMPLATE_${isActive ? 'ACTIVATE' : 'DEACTIVATE'}:${templateId}`, req.ip, templateId, 'helpdesk_maintenance_template');
    return res.json({ message: isActive ? 'Plantilla activada.' : 'Plantilla desactivada.' });
  } catch (error: any) {
    return fail(res, error, 'Error cambiando estado de plantilla:', 'No se pudo cambiar el estado de la plantilla.');
  }
};

export const proposeFromTemplateController = async (req: AuthRequest, res: Response) => {
  const templateId = getNumberId(req.params.id);
  if (!templateId) {
    return res.status(400).json({ message: 'ID de plantilla invalido.' });
  }
  const startsOn = queryText(req.query.starts_on) ?? new Date().toISOString().slice(0, 10);
  try {
    const routines = await proposeRoutinesFromTemplate(templateId, startsOn);
    return res.json({ routines });
  } catch (error: any) {
    return fail(res, error, 'Error proponiendo rutinas desde plantilla:', 'No se pudo generar la propuesta.');
  }
};

// --- Programa por activo ----------------------------------------------------
export const getAssetProgramController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.assetId);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }
  try {
    const overview = await getAssetProgramOverview(assetId);
    if (!overview) {
      return res.status(404).json({ message: 'Activo no encontrado.' });
    }
    return res.json(overview);
  } catch (error: any) {
    return fail(res, error, 'Error consultando programa del activo:', 'No se pudo cargar el programa de mantenimiento.');
  }
};

export const createAssetProgramController = async (req: AuthRequest, res: Response) => {
  const assetId = getNumberId(req.params.assetId);
  if (!assetId) {
    return res.status(400).json({ message: 'ID de activo invalido.' });
  }
  try {
    const overview = await createAssetProgramVersion(assetId, req.body as AssetProgramInput, req.user?.id ?? null);
    const version = overview.program?.version ?? 1;
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_PROGRAM_VERSION:${assetId}:v${version}`, req.ip, assetId, 'helpdesk_asset');
    return res.status(201).json({ message: `Programa de mantenimiento version ${version} activado.`, ...overview });
  } catch (error: any) {
    return fail(res, error, 'Error creando programa del activo:', 'No se pudo guardar el programa de mantenimiento.');
  }
};

export const setProjectionMonthsController = async (req: AuthRequest, res: Response) => {
  const programId = getNumberId(req.params.programId);
  if (!programId) {
    return res.status(400).json({ message: 'ID de programa invalido.' });
  }
  try {
    const created = await setProgramProjectionMonths(programId, Number(req.body?.projection_months ?? 12), req.user?.id ?? null);
    return res.json({ message: `Horizonte actualizado. Se proyectaron ${created} orden(es).`, created });
  } catch (error: any) {
    return fail(res, error, 'Error actualizando horizonte de proyeccion:', 'No se pudo actualizar el horizonte.');
  }
};

export const getRoutineController = async (req: AuthRequest, res: Response) => {
  const planId = getNumberId(req.params.planId);
  if (!planId) {
    return res.status(400).json({ message: 'ID de rutina invalido.' });
  }
  try {
    const routine = await getRoutineById(planId);
    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada.' });
    }
    return res.json({ routine });
  } catch (error: any) {
    return fail(res, error, 'Error consultando rutina:', 'No se pudo cargar la rutina.');
  }
};

export const updateRoutineController = async (req: AuthRequest, res: Response) => {
  const planId = getNumberId(req.params.planId);
  if (!planId) {
    return res.status(400).json({ message: 'ID de rutina invalido.' });
  }
  try {
    const routine = await updateRoutine(planId, req.body as ProgramRoutineInput, req.user?.id ?? null);
    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ROUTINE_UPDATE:${planId}`, req.ip, planId, 'helpdesk_maintenance_plan');
    return res.json({ message: 'Rutina actualizada y proyeccion regenerada.', routine });
  } catch (error: any) {
    return fail(res, error, 'Error actualizando rutina:', 'No se pudo actualizar la rutina.');
  }
};

export const pauseRoutineController = async (req: AuthRequest, res: Response) => {
  const planId = getNumberId(req.params.planId);
  if (!planId) {
    return res.status(400).json({ message: 'ID de rutina invalido.' });
  }
  try {
    const routine = await pauseRoutine(planId, String(req.body?.reason ?? ''), req.user?.id ?? null);
    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ROUTINE_PAUSE:${planId}`, req.ip, planId, 'helpdesk_maintenance_plan');
    return res.json({ message: 'Rutina pausada; se retiraron las ordenes proyectadas.', routine });
  } catch (error: any) {
    return fail(res, error, 'Error pausando rutina:', 'No se pudo pausar la rutina.');
  }
};

export const resumeRoutineController = async (req: AuthRequest, res: Response) => {
  const planId = getNumberId(req.params.planId);
  if (!planId) {
    return res.status(400).json({ message: 'ID de rutina invalido.' });
  }
  try {
    const routine = await resumeRoutine(planId, queryText(req.body?.next_due_on), req.user?.id ?? null);
    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ROUTINE_RESUME:${planId}`, req.ip, planId, 'helpdesk_maintenance_plan');
    return res.json({ message: 'Rutina reanudada y proyeccion regenerada.', routine });
  } catch (error: any) {
    return fail(res, error, 'Error reanudando rutina:', 'No se pudo reanudar la rutina.');
  }
};

export const deactivateRoutineController = async (req: AuthRequest, res: Response) => {
  const planId = getNumberId(req.params.planId);
  if (!planId) {
    return res.status(400).json({ message: 'ID de rutina invalido.' });
  }
  try {
    const ok = await deactivateRoutine(planId, req.user?.id ?? null);
    if (!ok) {
      return res.status(404).json({ message: 'Rutina no encontrada o ya inactiva.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ROUTINE_DEACTIVATE:${planId}`, req.ip, planId, 'helpdesk_maintenance_plan');
    return res.json({ message: 'Rutina retirada del programa. El historial de ordenes se conserva.' });
  } catch (error: any) {
    return fail(res, error, 'Error retirando rutina:', 'No se pudo retirar la rutina.');
  }
};

// --- Calendario y cobertura ---------------------------------------------------
const readCalendarFilters = (req: AuthRequest) => ({
  unitId: getNumberId(req.query.unit_id),
  areaId: getNumberId(req.query.area_id),
  responsibleEmployeeId: getNumberId(req.query.responsible_employee_id),
  responsibleUserId: queryText(req.query.responsible_user_id),
  categoryId: getNumberId(req.query.category_id),
  criticalityId: getNumberId(req.query.criticality_id),
  assetId: getNumberId(req.query.asset_id),
  kinds: queryList(req.query.kind) as CalendarEventKind[],
  statuses: queryList(req.query.status),
  search: queryText(req.query.search),
  mineUserId: req.query.mine === 'true' ? req.user?.id ?? null : null,
});

export const listCalendarController = async (req: AuthRequest, res: Response) => {
  const from = queryText(req.query.from);
  const to = queryText(req.query.to);
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return res.status(400).json({ message: 'Indica un rango de fechas valido (from/to en formato AAAA-MM-DD).' });
  }
  try {
    const response = await listCalendarEvents({ from, to, ...readCalendarFilters(req) });
    return res.json(response);
  } catch (error: any) {
    return fail(res, error, 'Error consultando calendario de mantenimiento:', 'No se pudo cargar el calendario.');
  }
};

export const getCoverageController = async (req: AuthRequest, res: Response) => {
  try {
    const coverage = await getCoverage(readCalendarFilters(req));
    return res.json({ coverage });
  } catch (error: any) {
    return fail(res, error, 'Error consultando cobertura del programa:', 'No se pudo calcular la cobertura.');
  }
};

// --- Ejecucion de ordenes -----------------------------------------------------
export const getOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }
  try {
    const order = await getMaintenanceOrderById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Orden de mantenimiento no encontrada.' });
    }
    const evidence = await listOrderEvidence(orderId);
    return res.json({ order, evidence });
  } catch (error: any) {
    return fail(res, error, 'Error consultando orden de mantenimiento:', 'No se pudo cargar la orden.');
  }
};

export const executeOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }
  try {
    const order = await closeMaintenanceOrder(orderId, req.body as OrderExecutionInput, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de mantenimiento no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ORDER_EXECUTE:${orderId}`, req.ip, orderId, 'helpdesk_maintenance_order');
    const message =
      order.status === 'PENDING_VALIDATION'
        ? 'Ejecucion registrada. La orden espera la firma de validacion del responsable del activo.'
        : 'Orden cerrada; la constancia quedo archivada en el expediente del activo.';
    return res.json({ message, order });
  } catch (error: any) {
    return fail(res, error, 'Error registrando ejecucion de orden:', 'No se pudo registrar la ejecucion.');
  }
};

export const validateOrderController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }
  try {
    const order = await validateMaintenanceOrder(orderId, req.body as OrderValidationInput, req.user?.id ?? null);
    if (!order) {
      return res.status(404).json({ message: 'Orden de mantenimiento no encontrada.' });
    }
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ORDER_VALIDATE:${orderId}`, req.ip, orderId, 'helpdesk_maintenance_order');
    return res.json({ message: 'Orden validada y cerrada; la constancia quedo archivada en el expediente.', order });
  } catch (error: any) {
    return fail(res, error, 'Error validando orden de mantenimiento:', 'No se pudo validar la orden.');
  }
};

export const uploadOrderEvidenceController = async (req: AuthRequest, res: Response) => {
  const orderId = getNumberId(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: 'ID de orden invalido.' });
  }
  const file = (req as any).file as { path: string; size: number; mimetype: string } | undefined;
  if (!file) {
    return res.status(400).json({ message: 'Adjunta un archivo de evidencia.' });
  }
  try {
    const document = await attachOrderEvidence(orderId, file, String(req.body?.title ?? ''), req.user?.id ?? null);
    await logHelpdeskAudit(req.user?.id, `HELPDESK_MAINTENANCE_ORDER_EVIDENCE:${orderId}`, req.ip, orderId, 'helpdesk_maintenance_order');
    return res.status(201).json({ message: 'Evidencia adjuntada a la orden y al expediente del activo.', document });
  } catch (error: any) {
    return fail(res, error, 'Error adjuntando evidencia de orden:', 'No se pudo adjuntar la evidencia.');
  }
};
