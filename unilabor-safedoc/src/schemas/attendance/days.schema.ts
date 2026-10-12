import { z } from 'zod';

/** Fecha 'YYYY-MM-DD' real (rechaza 2026-02-31). */
export const dayDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (usa YYYY-MM-DD).')
  .refine((text) => {
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }, 'Fecha invalida.');

export const DAY_RESULT_VALUES = [
  'present',
  'late',
  'absent',
  'partial_absence',
  'early_departure',
  'incident',
  'rest_day',
  'holiday',
  'no_schedule',
] as const;

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

/** Lista de resultados separados por coma: ?result=absent,late */
const resultList = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []))
  .pipe(z.array(z.enum(DAY_RESULT_VALUES)));

export const daysQuerySchema = z.object({
  from: dayDateSchema.optional(),
  to: dayDateSchema.optional(),
  branch_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  result: resultList,
  search: optionalText,
  only_issues: booleanFlag,
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export type DaysQuery = z.infer<typeof daysQuerySchema>;

export const recalculateBodySchema = z.object({
  from: dayDateSchema,
  to: dayDateSchema,
  employee_ids: z.array(z.number().int().positive()).min(1).max(5000).optional(),
});

export type RecalculateBody = z.infer<typeof recalculateBodySchema>;
