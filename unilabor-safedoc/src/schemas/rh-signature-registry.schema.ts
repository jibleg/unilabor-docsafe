import { z } from 'zod';

/** Registro de firmas autorizadas (REH-REG-027). */

export const signatureRegistryRowParamsSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  positionId: z.coerce.number().int().positive(),
});

export const signatureRegistryIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const signatureRegistryEmployeeParamsSchema = z.object({ employeeId: z.coerce.number().int().positive() });

/** Disciplina, responsable, alcance y notas de una fila (colaborador x puesto). */
export const signatureAuthorizationSchema = z.object({
  discipline_id: z.number().int().positive().nullable(),
  is_discipline_responsible: z.boolean(),
  signing_scope_text: z.string().trim().max(2000, 'El alcance es demasiado largo (máximo 2000 caracteres)').nullable(),
  notes: z.string().trim().max(1000, 'Las notas son demasiado largas (máximo 1000 caracteres)').nullable(),
});
export type SignatureAuthorizationInput = z.infer<typeof signatureAuthorizationSchema>;

export const disciplineSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'El nombre es demasiado largo'),
  is_active: z.boolean().optional(),
});
export type DisciplineInput = z.infer<typeof disciplineSchema>;

/**
 * Alta de un especimen: la imagen (data URL PNG o base64) con su origen, o
 * `from_last_signature` para copiar la ultima firma del colaborador en SafeDoc.
 */
export const specimenSchema = z
  .object({
    kind: z.enum(['FIRMA', 'RUBRICA'], { message: 'El tipo debe ser FIRMA o RUBRICA' }),
    image: z.string().min(1).max(7_000_000, 'La imagen es demasiado grande').optional(),
    source: z.enum(['UPLOAD', 'CLIPBOARD']).optional(),
    from_last_signature: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.image) !== Boolean(value.from_last_signature), {
    message: 'Envía la imagen del espécimen o pide tomarla de la última firma, no ambas cosas.',
    path: ['image'],
  });
export type SpecimenInput = z.infer<typeof specimenSchema>;

/** PDF del registro con las filas que muestra la pantalla (`empleado:puesto`); sin claves sale completo. */
export const signatureRegistryPdfSchema = z.object({
  keys: z.array(z.string().regex(/^\d+:\d+$/, 'Clave de fila invalida')).max(5000).optional(),
  filter_label: z.string().trim().max(300, 'La descripcion del filtro es demasiado larga').optional(),
});
export type SignatureRegistryPdfInput = z.infer<typeof signatureRegistryPdfSchema>;
