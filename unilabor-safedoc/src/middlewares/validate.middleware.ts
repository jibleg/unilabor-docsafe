import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

/**
 * Middleware de validacion de entrada centralizado.
 *
 * Valida `req.body` contra un esquema Zod. Si falla, responde 400 con un formato
 * uniforme `{ message, errors: [{ field, message }] }`. Si pasa, reemplaza
 * `req.body` con los datos ya parseados/normalizados (coerciones y defaults del
 * esquema), de modo que el controller recibe entrada confiable.
 *
 * En Express 5 una peticion sin body deja `req.body` en `undefined`; lo tratamos
 * como objeto vacio para que el esquema decida si los campos son opcionales en
 * vez de fallar con "expected object, received undefined".
 */
export const validate =
  (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      return res.status(400).json({
        message: 'Datos de entrada invalidos',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.length > 0 ? issue.path.join('.') : '(body)',
          message: issue.message,
        })),
      });
    }

    req.body = result.data;
    next();
  };
