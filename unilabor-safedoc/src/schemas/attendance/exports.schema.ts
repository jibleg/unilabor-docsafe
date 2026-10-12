import { z } from 'zod';
import { isDateString } from '../../services/attendance/engine/time';
import { MAX_CUSTOM_DAYS, rangeDays } from '../../services/attendance/engine/periods';
import { dateParam, optional, positiveIdParam } from './boards.schema';

export { commitmentQuerySchema } from './boards.schema';

export const MAX_DAYS_EXPORT_ROWS = 5000;

export const DAY_RESULT_VALUES = [
  'present', 'late', 'absent', 'partial_absence', 'early_departure',
  'incident', 'rest_day', 'holiday', 'no_schedule',
] as const;

const rangeRefine = (value: { from: string; to: string }, ctx: z.RefinementCtx): void => {
  // Con fechas mal formadas el error de formato ya se reporta; aqui no hay rango que medir.
  if (!isDateString(value.from) || !isDateString(value.to)) return;
  if (value.from > value.to) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'to no puede ser anterior a from' });
    return;
  }
  if (rangeDays(value.from, value.to) > MAX_CUSTOM_DAYS) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: `El rango no puede exceder ${MAX_CUSTOM_DAYS} dias` });
  }
};

export const daysExportQuerySchema = z
  .object({
    from: dateParam,
    to: dateParam,
    result: optional(z.enum(DAY_RESULT_VALUES)),
    branch_id: optional(positiveIdParam),
    employee_id: optional(positiveIdParam),
  })
  .superRefine(rangeRefine);
export type DaysExportQuery = z.infer<typeof daysExportQuerySchema>;

export const overtimeExportQuerySchema = z
  .object({
    from: dateParam,
    to: dateParam,
    branch_id: optional(positiveIdParam),
  })
  .superRefine(rangeRefine);
export type OvertimeExportQuery = z.infer<typeof overtimeExportQuerySchema>;
