import { z } from 'zod';

/**
 * Autorizar nuevo intento de la evaluacion de una fase de Induccion. La nota
 * (retroalimentacion / recapacitacion dada al colaborador) es opcional y queda
 * en la auditoria del evento.
 */
export const authorizeInductionRetrySchema = z.object({
  note: z
    .string()
    .trim()
    .max(500, 'La nota no puede exceder 500 caracteres')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type AuthorizeInductionRetryInput = z.infer<typeof authorizeInductionRetrySchema>;
