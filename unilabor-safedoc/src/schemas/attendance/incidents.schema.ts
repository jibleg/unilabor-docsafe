import { z } from 'zod';
import { isDateString } from '../../services/attendance/engine/time';

/**
 * Entradas de incidencias. Sirven para JSON y para multipart (donde todo llega
 * como texto): por eso los numeros y booleanos se coercionan y las cadenas
 * vacias se tratan como ausentes.
 */

const emptyToUndefined = (value: unknown): unknown => (value === '' || value === null ? undefined : value);

export const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

export const dateString = z
  .string()
  .trim()
  .refine((value) => isDateString(value), 'Fecha invalida, usa AAAA-MM-DD');

export const positiveId = z.coerce.number().int().positive();

const booleanLike = z.preprocess((value) => {
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (['true', 'on', '1', 'si', 'yes'].includes(text)) return true;
    if (['false', 'off', '0', 'no', ''].includes(text)) return false;
  }
  return value;
}, z.boolean());

export const createIncidentSchema = z.object({
  employee_id: positiveId,
  incident_type_id: positiveId,
  start_date: dateString,
  end_date: optional(dateString),
  hours: optional(z.coerce.number().gt(0, 'Las horas deben ser mayores a 0').max(24, 'Maximo 24 horas')),
  reason: optional(z.string().trim().max(1000)),
  imss_folio: optional(z.string().trim().max(40)),
  authorize: z.preprocess(emptyToUndefined, booleanLike.optional().default(false)),
  authorization_notes: optional(z.string().trim().max(1000)),
});
export type CreateIncidentBody = z.infer<typeof createIncidentSchema>;

export const transitionIncidentSchema = z.object({
  notes: optional(z.string().trim().max(1000)),
});

export const justifyAbsenceSchema = z.object({
  reason: z.string().trim().min(5, 'Escribe el motivo de la justificacion (minimo 5 caracteres)').max(1000),
});

export const listIncidentsQuerySchema = z.object({
  from: optional(dateString),
  to: optional(dateString),
  employee_id: optional(positiveId),
  branch_id: optional(positiveId),
  type_id: optional(positiveId),
  status: optional(z.enum(['captured', 'authorized', 'rejected', 'cancelled'])),
  search: optional(z.string().trim().max(100)),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional().default(1)),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(200).optional().default(25)),
});
export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;
