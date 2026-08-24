import { z } from 'zod';

// Texto opcional: cadena vacia o ausente -> null (coincide con el getText del
// controller, que no rechaza vacios sino que los normaliza a null).
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalPositiveId = z.coerce
  .number()
  .int()
  .positive()
  .nullish()
  .transform((value) => value ?? null);

const requiredText = (message: string) => z.string().trim().min(1, message);

// ID obligatorio (> 0). Coacciona null/undefined/0 a fallo con el mensaje dado
// (el frontend envia numericOrNull -> null cuando el campo queda sin seleccionar).
const requiredPositiveId = (message: string) =>
  z.coerce.number({ message }).int(message).positive(message);

// --- Activos ---
// Obligatorios (create y update): nombre, categoria, unidad, area y responsable
// tecnico. El asset_code es opcional: si viene vacio el backend autogenera
// UNIDAD-AREA-CATEGORIA-NNN (consecutivo por area).
export const helpdeskAssetSchema = z
  .object({
    asset_code: optionalText.optional(),
    name: requiredText('El nombre del activo es obligatorio'),
    category_id: requiredPositiveId('La categoría es obligatoria'),
    unit_id: requiredPositiveId('La unidad es obligatoria'),
    area_id: requiredPositiveId('El área es obligatoria'),
    responsible_employee_id: requiredPositiveId('El responsable técnico es obligatorio'),
  })
  .passthrough();

// --- Componentes de activo (activos compuestos) ---
// Un componente solo exige nombre; el resto (unidad/area/categoria/responsable)
// se hereda del activo padre y el codigo se autogenera como {padre}-NNN.
export const assetComponentSchema = z
  .object({
    name: requiredText('El nombre del componente es obligatorio'),
  })
  .passthrough();

export const assetComponentAttachSchema = z
  .object({
    component_asset_id: requiredPositiveId('El componente es obligatorio'),
  })
  .passthrough();

// --- Tickets ---
export const helpdeskTicketSchema = z
  .object({
    title: requiredText('El titulo es obligatorio'),
    description: requiredText('La descripcion es obligatoria'),
  })
  .passthrough();

export const helpdeskTicketCommentSchema = z
  .object({
    comment: requiredText('El comentario no puede estar vacio'),
  })
  .passthrough();

// --- Ciclo de vida (ISO 15189:2022) ---
export const lifecycleEventSchema = z
  .object({
    event_type_id: z.coerce.number().int().positive('El tipo de evento es obligatorio'),
    event_date: requiredText('La fecha del evento es obligatoria'),
    title: requiredText('El titulo del evento es obligatorio'),
    description: optionalText.optional(),
    maintenance_order_id: optionalPositiveId.optional(),
    ticket_id: optionalPositiveId.optional(),
    supplier_id: optionalPositiveId.optional(),
    performed_by_employee_id: optionalPositiveId.optional(),
    performed_by_provider: optionalText.optional(),
    cost: z.coerce.number().nonnegative().nullish(),
    currency: optionalText.optional(),
    calibration_certificate_no: optionalText.optional(),
    calibration_due_on: optionalText.optional(),
    disposal_reason_id: optionalPositiveId.optional(),
    from_location_id: optionalPositiveId.optional(),
    to_location_id: optionalPositiveId.optional(),
    notes: optionalText.optional(),
  })
  .passthrough();

// --- Evidencia documental de activos (S4) ---
export const assetDocumentSchema = z
  .object({
    title: requiredText('El titulo del documento es obligatorio'),
    document_kind_id: optionalPositiveId.optional(),
    lifecycle_event_id: optionalPositiveId.optional(),
    issued_on: optionalText.optional(),
    expires_on: optionalText.optional(),
  })
  .passthrough();

// risk_level/result se exigen presentes pero NO se restringen a un enum, para no
// endurecer mas que el controller actual (que solo valida no-vacio).
export const helpdeskTicketIsoRiskSchema = z
  .object({
    risk_level: requiredText('El nivel de riesgo es obligatorio'),
    impact_evaluation: requiredText('La evaluacion de impacto es obligatoria'),
  })
  .passthrough();

export const helpdeskTicketTechnicalReleaseSchema = z
  .object({
    technical_release_summary: requiredText('El resumen de liberacion tecnica es obligatorio'),
  })
  .passthrough();

export const helpdeskTicketSolveSchema = z
  .object({
    solved_at: requiredText('La fecha de solucion es obligatoria'),
    solution_summary: requiredText('El resumen de la solucion es obligatorio'),
  })
  .passthrough();

export const helpdeskTicketValidateReturnSchema = z
  .object({
    return_to_operation_at: requiredText('La fecha de retorno a operacion es obligatoria'),
  })
  .passthrough();

export const helpdeskTicketAssignSchema = z
  .object({
    assigned_employee_id: requiredPositiveId('El responsable a asignar es obligatorio'),
  })
  .passthrough();

export const helpdeskTicketStatusChangeSchema = z
  .object({
    status_code: requiredText('El estado destino es obligatorio'),
  })
  .passthrough();

export const helpdeskTicketCloseSchema = z
  .object({
    closure_notes: requiredText('Las notas de cierre son obligatorias'),
    closer_signature: requiredText('La firma del responsable que cierra es obligatoria'),
  })
  .passthrough();

export const helpdeskTicketCancelSchema = z
  .object({
    cancellation_reason: requiredText('El motivo de cancelacion es obligatorio'),
  })
  .passthrough();

export const helpdeskTicketConfirmFunctionalitySchema = z
  .object({
    requester_signature: requiredText('Firma tu confirmacion de funcionamiento'),
  })
  .passthrough();

// --- Catalogos (catalog-admin) ---
// name es obligatorio siempre; las reglas condicionales (code, sort_order,
// response_hours, interval_months segun catalogKey) las valida el controller.
export const helpdeskCatalogItemSchema = z
  .object({
    name: requiredText('El nombre es obligatorio'),
  })
  .passthrough();

// --- Ordenes de mantenimiento ---
export const maintenanceOrderRescheduleSchema = z
  .object({
    scheduled_for: requiredText('La nueva fecha programada es obligatoria'),
    reschedule_reason: requiredText('La justificacion de reprogramacion es obligatoria'),
  })
  .passthrough();

export const maintenanceOrderCloseSchema = z
  .object({
    completed_at: requiredText('La fecha de finalizacion es obligatoria'),
    performed_activities: requiredText('Las actividades realizadas son obligatorias'),
    result: requiredText('El resultado de la ejecucion es obligatorio'),
  })
  .passthrough();

// Cronograma provisto por el proveedor/responsable (modo CALENDAR): lista de
// fechas ISO que se convierten en ordenes programadas. Compartido mant/calib.
export const scheduleDatesSchema = z
  .object({
    dates: z.array(requiredText('La fecha es obligatoria')).min(1, 'Agrega al menos una fecha'),
  })
  .passthrough();

export const maintenancePlanSchema = z.object({
  asset_id: z.coerce.number().int().positive('El activo es obligatorio'),
  title: z.string().trim().min(1, 'El titulo es obligatorio'),
  starts_on: z.string().trim().min(1, 'La fecha de inicio es obligatoria'),
  next_due_on: z.string().trim().min(1, 'La proxima ejecucion es obligatoria'),
  schedule_mode: z.enum(['FREQUENCY', 'CALENDAR']).default('FREQUENCY'),
  frequency_id: optionalPositiveId.optional(),
  responsible_employee_id: optionalPositiveId.optional(),
  quality_document_id: optionalText.optional(),
  description: optionalText.optional(),
  provider_name: optionalText.optional(),
  tolerance_before_days: z.coerce.number().int().min(0).default(0),
  tolerance_after_days: z.coerce.number().int().min(0).default(0),
  checklist_required: z.boolean().default(true),
  evidence_required: z.boolean().default(true),
  tasks: z.array(z.string().trim().min(1)).default([]),
});

// --- Calibracion (ISO 15189:2022, control metrologico 6.5) ---
export const calibrationOrderRescheduleSchema = z
  .object({
    scheduled_for: requiredText('La nueva fecha programada es obligatoria'),
    reschedule_reason: requiredText('La justificacion de reprogramacion es obligatoria'),
  })
  .passthrough();

export const calibrationOrderCloseSchema = z
  .object({
    completed_at: requiredText('La fecha de calibracion es obligatoria'),
    result: requiredText('El resultado de la calibracion es obligatorio'),
    certificate_no: optionalText.optional(),
    calibration_due_on: optionalText.optional(),
    findings: optionalText.optional(),
    provider_name: optionalText.optional(),
    evidence_notes: optionalText.optional(),
  })
  .passthrough();

export const calibrationPlanSchema = z.object({
  asset_id: z.coerce.number().int().positive('El activo es obligatorio'),
  title: z.string().trim().min(1, 'El titulo es obligatorio'),
  starts_on: z.string().trim().min(1, 'La fecha de inicio es obligatoria'),
  next_due_on: z.string().trim().min(1, 'La proxima calibracion es obligatoria'),
  schedule_mode: z.enum(['FREQUENCY', 'CALENDAR']).default('FREQUENCY'),
  frequency_id: optionalPositiveId.optional(),
  responsible_employee_id: optionalPositiveId.optional(),
  quality_document_id: optionalText.optional(),
  description: optionalText.optional(),
  provider_name: optionalText.optional(),
  standard_ref: optionalText.optional(),
  tolerance_before_days: z.coerce.number().int().min(0).default(0),
  tolerance_after_days: z.coerce.number().int().min(0).default(0),
  certificate_required: z.boolean().default(true),
  evidence_required: z.boolean().default(true),
});

// --- Acta de entrega-recepcion de activos (ISO 15189:2022) ---
const handoverItemSchema = z
  .object({
    asset_id: z.coerce.number().int().positive('El activo es obligatorio'),
    receipt_condition_id: optionalPositiveId.optional(),
    observations: optionalText.optional(),
  })
  .passthrough();

// Create/update de borrador: cabecera obligatoria; los items pueden ir vacios
// mientras el acta es borrador (se exigen al firmar).
export const handoverSchema = z
  .object({
    unit_id: requiredPositiveId('La unidad es obligatoria'),
    area_id: requiredPositiveId('El área es obligatoria'),
    received_by_user_id: z.string().trim().uuid('El responsable que recibe es obligatorio'),
    received_by_name: requiredText('El nombre de quien recibe es obligatorio'),
    delivered_by_name: requiredText('El nombre de quien entrega es obligatorio'),
    notes: optionalText.optional(),
    items: z.array(handoverItemSchema).default([]),
  })
  .passthrough();

export const handoverSignSchema = z
  .object({
    deliverer_signature: requiredText('La firma de quien entrega es obligatoria'),
    receiver_signature: requiredText('La firma de quien recibe es obligatoria'),
    delivered_by_name: optionalText.optional(),
    received_by_name: optionalText.optional(),
    notes: optionalText.optional(),
  })
  .passthrough();

export const handoverVoidSchema = z
  .object({
    reason: requiredText('El motivo de anulación es obligatorio'),
  })
  .passthrough();

// --- Movimientos del activo (cambio de unidad/area/categoria/responsable) ---
export const assetMovementSchema = z
  .object({
    asset_id: requiredPositiveId('El activo es obligatorio'),
    to_unit_id: optionalPositiveId.optional(),
    to_area_id: optionalPositiveId.optional(),
    to_category_id: optionalPositiveId.optional(),
    reason: requiredText('El motivo del movimiento es obligatorio'),
    performed_by_name: requiredText('El nombre de quien realiza el movimiento es obligatorio'),
    performed_by_signature: requiredText('La firma de quien realiza el movimiento es obligatoria'),
    responsible_user_id: z.string().trim().uuid('El responsable debe ser un usuario válido').nullish(),
    responsible_name: requiredText('El nombre del responsable es obligatorio'),
    responsible_signature: requiredText('La firma del responsable es obligatoria'),
    include_components: z.boolean().optional(),
  })
  .passthrough();

// --- Estructura organizacional (Unidad <-> Area <-> Responsables) ---
// El reemplazo del conjunto acepta listas vacias (desasignar todo).
export const unitAreasSchema = z.object({
  area_ids: z.array(z.coerce.number().int().positive()).default([]),
});

export const areaResponsiblesSchema = z.object({
  user_ids: z.array(z.string().trim().uuid('El responsable debe ser un usuario valido')).default([]),
});
