import { z } from 'zod';

/** Fecha 'YYYY-MM-DD' real (rechaza 2026-02-31). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (usa YYYY-MM-DD).')
  .refine((text) => {
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }, 'Fecha invalida.');

export const holidaysQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const holidayIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const holidayName = z.string().trim().min(2, 'El nombre es muy corto.').max(120);

export const createHolidaySchema = z.object({
  holiday_date: isoDateSchema,
  name: holidayName,
});

export const updateHolidaySchema = z
  .object({
    holiday_date: isoDateSchema.optional(),
    name: holidayName.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios que guardar.');

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
