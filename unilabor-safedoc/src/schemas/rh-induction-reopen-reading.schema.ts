import { z } from 'zod';

/**
 * Reabrir la lectura de una fase de Induccion a un inscrito que no termino de
 * leer y cuyo plazo vencio: horas adicionales (1..720 = 30 dias) y nota
 * opcional que queda en la auditoria.
 */
export const REOPEN_READING_MAX_HOURS = 720;

export const reopenInductionReadingSchema = z.object({
  hours: z.coerce
    .number({ message: 'Las horas de lectura son obligatorias' })
    .int('Las horas deben ser un numero entero')
    .min(1, 'Debes dar al menos 1 hora de lectura')
    .max(REOPEN_READING_MAX_HOURS, `Maximo ${REOPEN_READING_MAX_HOURS} horas (30 dias)`),
  note: z
    .string()
    .trim()
    .max(500, 'La nota no puede exceder 500 caracteres')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export type ReopenInductionReadingInput = z.infer<typeof reopenInductionReadingSchema>;
