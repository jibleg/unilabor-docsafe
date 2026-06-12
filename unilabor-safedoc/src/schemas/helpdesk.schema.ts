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

// --- Activos ---
// El controller exige asset_code y name no vacios (tanto en create como update).
export const helpdeskAssetSchema = z
  .object({
    asset_code: requiredText('El codigo del activo es obligatorio'),
    name: requiredText('El nombre del activo es obligatorio'),
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

export const maintenancePlanSchema = z.object({
  asset_id: z.coerce.number().int().positive('El activo es obligatorio'),
  title: z.string().trim().min(1, 'El titulo es obligatorio'),
  starts_on: z.string().trim().min(1, 'La fecha de inicio es obligatoria'),
  next_due_on: z.string().trim().min(1, 'La proxima ejecucion es obligatoria'),
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
