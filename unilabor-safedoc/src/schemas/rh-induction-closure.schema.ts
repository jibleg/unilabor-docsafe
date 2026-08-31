import { z } from 'zod';

/**
 * Cierre del Formato de Induccion (REH-REG-005). El motivo obligatorio para
 * NO_APROBADA y el gate del dictamen positivo se validan en el servicio
 * (dependen del estado real del master record).
 */

const requiredText = (message: string) => z.string().trim().min(1, message);

export const closeInductionRecordSchema = z
  .object({
    verdict: z.enum(['APROBADA', 'NO_APROBADA']),
    closing_notes: z
      .string()
      .trim()
      .max(2000, 'El motivo no puede exceder 2000 caracteres')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    collaborator_signature: requiredText('La firma del colaborador es obligatoria'),
    rh_signature: requiredText('La firma de RH es obligatoria'),
    area_signature: requiredText('La firma del coordinador del área es obligatoria'),
    rh_signatory_name: requiredText('El nombre del firmante de RH es obligatorio'),
    area_signatory_name: requiredText('El nombre del coordinador del área es obligatorio'),
    supersede: z.coerce.boolean().optional(),
  })
  .passthrough();
