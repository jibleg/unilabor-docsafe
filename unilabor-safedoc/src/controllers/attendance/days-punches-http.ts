import type { Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Valida con Zod los parametros de consulta o de ruta. Si falla responde 400
 * con el mismo formato del middleware `validate` y devuelve null.
 */
export const parseInput = <T>(res: Response, schema: ZodType<T>, input: unknown): T | null => {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  res.status(400).json({
    message: 'Datos de entrada invalidos',
    errors: result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : '(query)',
      message: issue.message,
    })),
  });
  return null;
};
