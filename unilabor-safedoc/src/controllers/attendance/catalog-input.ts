import type { ZodType } from 'zod';
import { invalid } from '../../services/attendance/attendance-errors';

/** Valida params/query con Zod; ante error lanza AttendanceError 400 con detalle por campo. */
export const parseInput = <T>(schema: ZodType<T>, data: unknown): T => {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const first = result.error.issues[0]?.message;
  return invalid(
    first && !first.startsWith('Invalid') ? first : 'Parametros de entrada invalidos',
    result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(entrada)',
      message: issue.message,
    })),
  );
};
