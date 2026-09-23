import { z } from 'zod';

/** Esquemas Zod del Programa de Mantenimiento (plantillas, programa por activo, ejecucion). */

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (AAAA-MM-DD)');
const optionalIsoDate = isoDate.nullable().optional();
const optionalText = z.string().trim().max(4000).nullable().optional();
const optionalId = z.coerce.number().int().positive().nullable().optional();

export const serviceKindSchema = z.enum(['PREVENTIVE', 'VERIFICATION', 'ELECTRICAL_SAFETY', 'OTHER']);
export const intervalUnitSchema = z.enum(['DAY', 'WEEK', 'MONTH']);
export const executorKindSchema = z.enum(['INTERNAL_OPERATOR', 'INTERNAL_TECH', 'EXTERNAL_PROVIDER']);
export const anchorModeSchema = z.enum(['FIXED', 'FLOATING']);
export const sourceKindSchema = z.enum(['MANUFACTURER_MANUAL', 'PROVIDER_PROGRAM', 'SERVICE_CONTRACT', 'INTERNAL']);

const taskSchema = z.object({
  id: optionalId,
  task_text: z.string().trim().min(1, 'La tarea no puede estar vacia').max(500),
  is_required: z.boolean().optional(),
});

export const templateRoutineSchema = z.object({
  id: optionalId,
  service_kind: serviceKindSchema,
  title: z.string().trim().min(1, 'El titulo de la rutina es obligatorio').max(200),
  description: optionalText,
  frequency_id: optionalId,
  custom_interval_value: z.coerce.number().int().positive().nullable().optional(),
  custom_interval_unit: intervalUnitSchema.nullable().optional(),
  executor_kind: executorKindSchema,
  window_before_days: z.coerce.number().int().min(0).max(365).optional(),
  window_after_days: z.coerce.number().int().min(0).max(365).optional(),
  checklist_required: z.boolean().optional(),
  evidence_required: z.boolean().optional(),
  tasks: z.array(taskSchema).default([]),
});

export const maintenanceTemplateSchema = z.object({
  category_id: optionalId,
  name: z.string().trim().min(1, 'El nombre de la plantilla es obligatorio').max(200),
  description: optionalText,
  routines: z.array(templateRoutineSchema).default([]),
});

export const programRoutineSchema = z.object({
  plan_id: optionalId,
  template_routine_id: optionalId,
  service_kind: serviceKindSchema,
  title: z.string().trim().min(1, 'El titulo de la rutina es obligatorio').max(200),
  description: optionalText,
  schedule_mode: z.enum(['FREQUENCY', 'CALENDAR']).optional(),
  frequency_id: optionalId,
  custom_interval_value: z.coerce.number().int().positive().nullable().optional(),
  custom_interval_unit: intervalUnitSchema.nullable().optional(),
  anchor_mode: anchorModeSchema.optional(),
  starts_on: isoDate,
  next_due_on: isoDate,
  tolerance_before_days: z.coerce.number().int().min(0).max(365).optional(),
  tolerance_after_days: z.coerce.number().int().min(0).max(365).optional(),
  recurrence_end_on: optionalIsoDate,
  recurrence_max_occurrences: z.coerce.number().int().positive().nullable().optional(),
  executor_kind: executorKindSchema,
  supplier_id: optionalId,
  responsible_employee_id: optionalId,
  quality_document_id: z.string().uuid().nullable().optional(),
  checklist_required: z.boolean().optional(),
  evidence_required: z.boolean().optional(),
  deviates_from_template: z.boolean().optional(),
  deviation_reason: optionalText,
  tasks: z.array(taskSchema).default([]),
});

export const assetProgramSchema = z.object({
  template_id: optionalId,
  source_kind: sourceKindSchema,
  source_document_id: z.string().uuid().nullable().optional(),
  source_asset_document_id: optionalId,
  source_reference: optionalText,
  source_notes: optionalText,
  effective_from: optionalIsoDate,
  change_reason: optionalText,
  deviates_from_template: z.boolean().optional(),
  deviation_reason: optionalText,
  projection_months: z.coerce.number().int().min(1).max(36).optional(),
  routines: z.array(programRoutineSchema).min(1, 'El programa necesita al menos una rutina'),
});

export const routinePauseSchema = z.object({
  reason: z.string().trim().min(3, 'Indica el motivo de la pausa').max(500),
});

export const routineResumeSchema = z.object({
  next_due_on: optionalIsoDate,
});

export const projectionMonthsSchema = z.object({
  projection_months: z.coerce.number().int().min(1).max(36),
});

export const orderExecutionSchema = z.object({
  completed_at: z.string().trim().min(1, 'La fecha de ejecucion es obligatoria'),
  performed_activities: z.string().trim().min(1, 'Describe las actividades realizadas').max(4000),
  result: z.string().trim().min(1, 'El resultado es obligatorio').max(500),
  findings: optionalText,
  provider_name: optionalText,
  supplier_id: optionalId,
  executed_by_employee_id: optionalId,
  downtime_minutes: z.coerce.number().int().min(0).nullable().optional(),
  evidence_notes: optionalText,
  checklist: z
    .array(
      z.object({
        plan_task_id: optionalId,
        task_text: z.string().trim().min(1).max(500),
        result: z.string().trim().max(30).default('PENDING'),
        notes: optionalText,
      }),
    )
    .optional(),
  technician_signature: z.string().nullable().optional(),
  responsible_signature: z.string().nullable().optional(),
  open_corrective_ticket: z.boolean().optional(),
  corrective_title: optionalText,
  corrective_description: optionalText,
});

export const orderValidationSchema = z.object({
  responsible_signature: z.string().min(1, 'La firma del responsable es obligatoria'),
  validation_notes: optionalText,
});

export const orderEvidenceSchema = z.object({
  title: z.string().trim().max(200).optional(),
});

export type MaintenanceTemplateInput = z.infer<typeof maintenanceTemplateSchema>;
export type AssetProgramInput = z.infer<typeof assetProgramSchema>;
export type ProgramRoutineInput = z.infer<typeof programRoutineSchema>;
export type OrderExecutionInput = z.infer<typeof orderExecutionSchema>;
export type OrderValidationInput = z.infer<typeof orderValidationSchema>;
