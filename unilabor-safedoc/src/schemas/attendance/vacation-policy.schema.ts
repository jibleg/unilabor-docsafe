import { z } from 'zod';

export const vacationPolicyParamsSchema = z.object({
  fromYear: z.coerce.number().int().min(1, 'El anio de antiguedad va de 1 a 60.').max(60, 'El anio de antiguedad va de 1 a 60.'),
});

export const saveVacationPolicySchema = z.object({
  vacation_days: z
    .number()
    .min(0, 'Los dias van de 0 a 60.')
    .max(60, 'Los dias van de 0 a 60.')
    .refine((days) => Number.isInteger(days * 2), 'Los dias van en pasos de 0.5.'),
});
