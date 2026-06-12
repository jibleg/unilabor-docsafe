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
