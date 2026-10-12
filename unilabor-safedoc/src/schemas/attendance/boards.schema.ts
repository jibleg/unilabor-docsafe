import { z } from 'zod';
import { AttendanceError } from '../../services/attendance/attendance-errors';
import { MAX_CUSTOM_DAYS, PERIOD_TYPES, rangeDays } from '../../services/attendance/engine/periods';
import { isDateString } from '../../services/attendance/engine/time';

/** Fecha 'YYYY-MM-DD' valida de calendario. */
export const dateParam = z
  .string()
  .trim()
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isDateString(value), 'Fecha invalida (usa AAAA-MM-DD)');

export const positiveIdParam = z.coerce.number().int().positive();

/** Los parametros vacios ('') llegan de formularios: se tratan como ausentes. */
export const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

export const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

export const liveBoardQuerySchema = z.object({
  date: optional(dateParam),
  branch_id: optional(positiveIdParam),
});
export type LiveBoardQuery = z.infer<typeof liveBoardQuerySchema>;

export const commitmentQuerySchema = z
  .object({
    period: z.preprocess(emptyToUndefined, z.enum(PERIOD_TYPES).default('month')),
    anchor: optional(dateParam),
    from: optional(dateParam),
    to: optional(dateParam),
    branch_id: optional(positiveIdParam),
    employee_id: optional(positiveIdParam),
  })
  .superRefine((value, ctx) => {
    if (value.period !== 'custom') return;
    const start = value.from ?? value.anchor;
    const end = value.to ?? start;
    if (!start || !end) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'El periodo personalizado requiere from y to' });
      return;
    }
    // Zod 4 ejecuta este refinamiento aunque el formato ya haya fallado: sin fechas validas no hay rango que medir.
    if (!isDateString(start) || !isDateString(end)) return;
    const [a, b] = start <= end ? [start, end] : [end, start];
    if (rangeDays(a, b) > MAX_CUSTOM_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: `El rango personalizado no puede exceder ${MAX_CUSTOM_DAYS} dias` });
    }
  });
export type CommitmentQuery = z.infer<typeof commitmentQuerySchema>;

/** Valida req.query con Zod; ante error lanza AttendanceError 400 con el detalle por campo. */
export const parseQuery = <T extends z.ZodType>(schema: T, query: unknown): z.infer<T> => {
  const result = schema.safeParse(query ?? {});
  if (!result.success) {
    throw new AttendanceError('ATTENDANCE_INVALID', 'Parametros de consulta invalidos', {
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(query)',
        message: issue.message,
      })),
    });
  }
  return result.data;
};
