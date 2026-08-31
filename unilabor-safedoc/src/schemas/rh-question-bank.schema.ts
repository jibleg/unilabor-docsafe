import { z } from 'zod';

/**
 * Esquemas del banco de preguntas generado por IA (Induccion, RH).
 * Ver rh-question-bank.service.ts para la validacion de la respuesta cruda
 * del modelo (esa vive junto a la llamada, no aqui: no es input de endpoint).
 */

const questionCount = z.coerce.number().int().min(0).max(15);

export const generateQuestionBankSchema = z.object({
  document_ids: z.array(z.string().uuid('ID de documento invalido')).min(1, 'Selecciona al menos un documento'),
  counts: z
    .object({
      single: questionCount,
      multiple: questionCount,
      boolean: questionCount,
      open: questionCount,
    })
    .refine((counts) => counts.single + counts.multiple + counts.boolean + counts.open > 0, {
      message: 'Indica al menos una pregunta a generar',
    }),
});

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal('').transform(() => undefined));

export const reviewQuestionBankItemSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']).optional(),
    text: optionalText,
    points: z.coerce.number().int().min(1).max(100).optional(),
    options: z
      .array(
        z.object({
          text: z.string().trim().min(1, 'La opcion no puede quedar vacia'),
          is_correct: z.coerce.boolean(),
        }),
      )
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar la pregunta',
  });
