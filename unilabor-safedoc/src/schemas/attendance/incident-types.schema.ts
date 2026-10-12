import { z } from 'zod';

const codeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,29}$/, 'Codigo invalido: minusculas, digitos y guion bajo (2-30, empieza con letra).');
const nameSchema = z.string().trim().min(2, 'El nombre es muy corto.').max(80, 'El nombre es muy largo.');

const flags = {
  requires_attachment: z.boolean(),
  is_paid: z.boolean(),
  deducts_vacation: z.boolean(),
  counts_as_attendance: z.boolean(),
  is_hourly: z.boolean(),
};

export const incidentTypesQuerySchema = z.object({
  include_inactive: z.enum(['true', 'false']).optional(),
});

export const incidentTypeIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createIncidentTypeSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  requires_attachment: flags.requires_attachment.default(true),
  is_paid: flags.is_paid.default(true),
  deducts_vacation: flags.deducts_vacation.default(false),
  counts_as_attendance: flags.counts_as_attendance.default(true),
  is_hourly: flags.is_hourly.default(false),
  sort_order: z.number().int().min(0).max(32000).optional(),
});

export const updateIncidentTypeSchema = z
  .object({
    code: codeSchema.optional(),
    name: nameSchema.optional(),
    requires_attachment: flags.requires_attachment.optional(),
    is_paid: flags.is_paid.optional(),
    deducts_vacation: flags.deducts_vacation.optional(),
    counts_as_attendance: flags.counts_as_attendance.optional(),
    is_hourly: flags.is_hourly.optional(),
    sort_order: z.number().int().min(0).max(32000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios que guardar.');

export type CreateIncidentTypeInput = z.infer<typeof createIncidentTypeSchema>;
export type UpdateIncidentTypeInput = z.infer<typeof updateIncidentTypeSchema>;
