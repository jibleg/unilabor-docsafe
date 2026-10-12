import { z } from 'zod';
import { dayDateSchema } from './days.schema';

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const booleanFlag = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((value) => value === true || value === 'true' || value === '1');

export const punchesQuerySchema = z.object({
  from: dayDateSchema.optional(),
  to: dayDateSchema.optional(),
  branch_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  source: z.enum(['terminal', 'manual']).optional(),
  review_status: z.enum(['none', 'pending', 'approved', 'rejected']).optional(),
  only_review: booleanFlag,
  search: optionalText,
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export type PunchesQuery = z.infer<typeof punchesQuerySchema>;

export const punchIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const manualPunchBodySchema = z.object({
  employee_id: z.number().int().positive(),
  work_date: dayDateSchema,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora invalida (usa HH:MM).'),
  punch_type: z.enum(['in', 'out']),
  justification: z.string().trim().min(5, 'La justificacion debe tener al menos 5 caracteres.').max(500),
});

export type ManualPunchBody = z.infer<typeof manualPunchBodySchema>;

export const reviewPunchBodySchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (body) => body.decision === 'approve' || (body.reason ?? '').length >= 5,
    { message: 'Al rechazar indica el motivo (minimo 5 caracteres).', path: ['reason'] },
  );

export type ReviewPunchBody = z.infer<typeof reviewPunchBodySchema>;

export const linkEmployeeBodySchema = z.object({
  employee_id: z.number().int().positive(),
});

export type LinkEmployeeBody = z.infer<typeof linkEmployeeBodySchema>;
