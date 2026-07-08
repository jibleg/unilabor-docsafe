import type { Response } from 'express';
import { registerAuditEvent } from '../services/audit.service';
import type { HelpdeskCatalogAdminPayload } from '../services/helpdesk-catalog-admin.service';
import type { HelpdeskAssetPayload } from '../services/helpdesk-asset.service';
import type {
  HelpdeskTicketPayload,
  HelpdeskTicketSolutionPayload,
  HelpdeskTicketReturnPayload,
  HelpdeskTicketIsoRiskPayload,
  HelpdeskTicketTechnicalReleasePayload,
} from '../services/helpdesk-ticket.service';
import type {
  HelpdeskMaintenancePlanPayload,
  HelpdeskMaintenanceOrderClosePayload,
  HelpdeskMaintenanceOrderReschedulePayload,
} from '../services/helpdesk-maintenance.service';
import type {
  HelpdeskCalibrationPlanPayload,
  HelpdeskCalibrationOrderClosePayload,
  HelpdeskCalibrationOrderReschedulePayload,
} from '../services/helpdesk-calibration.service';

export const getText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

export const getNumberId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
};

export const mapHelpdeskError = (res: Response, error: any) => {
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
    error?.code === 'HELPDESK_TICKET_INVALID_STATE' ||
    error?.code === 'HELPDESK_MAINTENANCE_ORDER_INVALID_STATE'
  ) {
    return res.status(409).json({
      message: error.publicMessage ?? 'La operacion no es valida para el estado actual del registro.',
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

  if (error?.code === 'HELPDESK_ASSET_CODE_SCOPE_REQUIRED') {
    return res.status(400).json({
      message: 'Para autogenerar el codigo de inventario selecciona unidad, area y clasificacion (o captura el codigo manualmente).',
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

export const mapHelpdeskCatalogAdminError = (res: Response, error: any) => {
  if (error?.code === 'HELPDESK_CATALOG_KEY_INVALID') {
    return res.status(400).json({ message: 'Catalogo invalido.' });
  }

  if (error?.code === 'HELPDESK_CATALOG_NAME_REQUIRED') {
    return res.status(400).json({ message: 'El nombre del catalogo es obligatorio.' });
  }

  if (error?.code === 'HELPDESK_CATALOG_CODE_REQUIRED') {
    return res.status(400).json({ message: 'El codigo del catalogo es obligatorio.' });
  }

  if (error?.code === 'HELPDESK_CATALOG_SORT_ORDER_INVALID') {
    return res.status(400).json({ message: 'El orden del catalogo debe ser un numero entero igual o mayor a cero.' });
  }

  if (error?.code === 'HELPDESK_CATALOG_RESPONSE_HOURS_INVALID') {
    return res.status(400).json({ message: 'Las horas de respuesta deben ser un numero entero igual o mayor a cero.' });
  }

  if (error?.code === 'HELPDESK_CATALOG_INTERVAL_MONTHS_INVALID') {
    return res.status(400).json({ message: 'La frecuencia debe indicar meses enteros mayores a cero.' });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ message: 'Ya existe un registro de catalogo con ese codigo o nombre.' });
  }

  return null;
};

export const getBoolean = (value: unknown): boolean => value === true || value === 'true' || value === 1 || value === '1';

export const getHelpdeskCatalogAdminPayload = (body: any): HelpdeskCatalogAdminPayload | null => {
  const name = getText(body?.name);
  if (!name) {
    return null;
  }

  return {
    code: getText(body?.code),
    name,
    description: getText(body?.description),
    sort_order: body?.sort_order === undefined ? null : Number(body?.sort_order),
    is_closed: body?.is_closed === undefined ? null : getBoolean(body?.is_closed),
    response_hours: body?.response_hours === undefined || body?.response_hours === '' ? null : Number(body?.response_hours),
    interval_months: body?.interval_months === undefined || body?.interval_months === '' ? null : Number(body?.interval_months),
  };
};

export const getAssetPayload = (body: any): HelpdeskAssetPayload | null => {
  const assetCode = getText(body?.asset_code);
  const name = getText(body?.name);

  // asset_code puede ir vacio: el servicio autogenera el codigo ISO. Solo el nombre es obligatorio.
  if (!name) {
    return null;
  }

  return {
    asset_code: assetCode ?? '',
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
    supplier_id: getNumberId(body?.supplier_id),
    received_on: getText(body?.received_on),
    placed_in_service_on: getText(body?.placed_in_service_on),
    receipt_condition_id: getNumberId(body?.receipt_condition_id),
    decommissioned_on: getText(body?.decommissioned_on),
    disposal_reason_id: getNumberId(body?.disposal_reason_id),
  };
};

export const getTicketPayload = (body: any): HelpdeskTicketPayload | null => {
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

export const getTicketSolutionPayload = (body: any): HelpdeskTicketSolutionPayload | null => {
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

export const getTicketReturnPayload = (body: any): HelpdeskTicketReturnPayload | null => {
  const returnToOperationAt = getText(body?.return_to_operation_at);

  if (!returnToOperationAt) {
    return null;
  }

  return {
    return_to_operation_at: returnToOperationAt,
    equipment_status_after_solution_id: getNumberId(body?.equipment_status_after_solution_id),
  };
};

export const getTicketIsoRiskPayload = (body: any): HelpdeskTicketIsoRiskPayload | null => {
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

export const getTicketTechnicalReleasePayload = (body: any): HelpdeskTicketTechnicalReleasePayload | null => {
  const technicalReleaseSummary = getText(body?.technical_release_summary);

  if (!technicalReleaseSummary) {
    return null;
  }

  return {
    technical_release_summary: technicalReleaseSummary,
    equipment_status_after_solution_id: getNumberId(body?.equipment_status_after_solution_id),
  };
};

export const getMaintenancePlanPayload = (body: any): HelpdeskMaintenancePlanPayload | null => {
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
    schedule_mode: body?.schedule_mode === 'CALENDAR' ? 'CALENDAR' : 'FREQUENCY',
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

// Cronograma provisto (modo CALENDAR): normaliza la lista de fechas a strings
// no vacios. Devuelve null si no hay ninguna valida.
export const getScheduleDatesPayload = (body: any): string[] | null => {
  const dates = Array.isArray(body?.dates)
    ? body.dates.map((d: unknown) => getText(d)).filter((d: string | null): d is string => Boolean(d))
    : [];
  return dates.length > 0 ? dates : null;
};

export const getMaintenanceOrderClosePayload = (body: any): HelpdeskMaintenanceOrderClosePayload | null => {
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

export const getMaintenanceOrderReschedulePayload = (body: any): HelpdeskMaintenanceOrderReschedulePayload | null => {
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

export const getCalibrationPlanPayload = (body: any): HelpdeskCalibrationPlanPayload | null => {
  const assetId = getNumberId(body?.asset_id);
  const title = getText(body?.title);
  const startsOn = getText(body?.starts_on);
  const nextDueOn = getText(body?.next_due_on);

  if (!assetId || !title || !startsOn || !nextDueOn) {
    return null;
  }

  return {
    asset_id: assetId,
    frequency_id: getNumberId(body?.frequency_id),
    schedule_mode: body?.schedule_mode === 'CALENDAR' ? 'CALENDAR' : 'FREQUENCY',
    responsible_employee_id: getNumberId(body?.responsible_employee_id),
    quality_document_id: getText(body?.quality_document_id),
    title,
    description: getText(body?.description),
    provider_name: getText(body?.provider_name),
    standard_ref: getText(body?.standard_ref),
    starts_on: startsOn,
    next_due_on: nextDueOn,
    tolerance_before_days: Number(body?.tolerance_before_days ?? 0),
    tolerance_after_days: Number(body?.tolerance_after_days ?? 0),
    certificate_required: body?.certificate_required === undefined ? true : getBoolean(body?.certificate_required),
    evidence_required: body?.evidence_required === undefined ? true : getBoolean(body?.evidence_required),
  };
};

export const getCalibrationOrderClosePayload = (body: any): HelpdeskCalibrationOrderClosePayload | null => {
  const completedAt = getText(body?.completed_at);
  const result = getText(body?.result);

  if (!completedAt || !result) {
    return null;
  }

  return {
    completed_at: completedAt,
    result,
    certificate_no: getText(body?.certificate_no),
    calibration_due_on: getText(body?.calibration_due_on),
    findings: getText(body?.findings),
    provider_name: getText(body?.provider_name),
    evidence_notes: getText(body?.evidence_notes),
  };
};

export const getCalibrationOrderReschedulePayload = (body: any): HelpdeskCalibrationOrderReschedulePayload | null => {
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

export const logHelpdeskAudit = async (
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

