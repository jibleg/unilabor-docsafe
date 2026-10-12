import { z } from 'zod';
import { dateString, optional, positiveId } from './incidents.schema';

export const adjustVacationSchema = z.object({
  period_id: positiveId,
  adjustment: z
    .number()
    .min(-60, 'El ajuste va de -60 a 60 dias')
    .max(60, 'El ajuste va de -60 a 60 dias')
    .refine((value) => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9, 'El ajuste va en pasos de 0.5 dias'),
  reason: z.string().trim().min(5, 'Escribe el motivo del ajuste (minimo 5 caracteres)').max(500),
});

export const previewVacationSchema = z.object({
  employee_id: positiveId,
  incident_type_id: positiveId,
  start_date: dateString,
  end_date: dateString,
});

export const listBalancesQuerySchema = z.object({
  branch_id: optional(positiveId),
  search: optional(z.string().trim().max(100)),
  page: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).optional().default(1)),
  limit: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(200).optional().default(25)),
});
