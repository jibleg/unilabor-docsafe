import { z } from 'zod';

/** Catalogos del Listado de personal autorizado (REH-REG-026). */

export const organizationalLevelSchema = z.object({
  code: z.string().trim().min(1, 'La clave es obligatoria').max(4, 'La clave admite hasta 4 caracteres'),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'El nombre es demasiado largo'),
  description: z.string().trim().max(400, 'La descripcion es demasiado larga').nullish(),
  sort_order: z.number().int().min(0).nullish(),
  is_active: z.boolean().optional(),
});
export type OrganizationalLevelInput = z.infer<typeof organizationalLevelSchema>;

export const authorizationLevelSchema = z.object({
  level_no: z.coerce.number({ message: 'El numero de nivel es obligatorio' }).int().min(1, 'El nivel debe ser mayor a cero').max(99),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'El nombre es demasiado largo'),
  description: z.string().trim().max(400, 'La descripcion es demasiado larga').nullish(),
  is_active: z.boolean().optional(),
});
export type AuthorizationLevelInput = z.infer<typeof authorizationLevelSchema>;

export const levelParamsSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * PDF del listado con las filas que muestra la pantalla. Cada clave es
 * `empleado:puesto` (`none` cuando el colaborador no tiene puesto). Sin claves
 * sale el listado completo.
 */
export const authorizedPersonnelPdfSchema = z.object({
  keys: z.array(z.string().regex(/^\d+:(\d+|none)$/, 'Clave de fila invalida')).max(5000).optional(),
  /** Descripcion de los filtros aplicados, para dejarla impresa en el PDF. */
  filter_label: z.string().trim().max(300, 'La descripcion del filtro es demasiado larga').optional(),
});
export type AuthorizedPersonnelPdfInput = z.infer<typeof authorizedPersonnelPdfSchema>;

/** Firmante del pie del formato (ELABORO / REVISO / AUTORIZO). */
export const formSignerSlotParamsSchema = z.object({
  slot: z.enum(['ELABORO', 'REVISO', 'AUTORIZO'], { message: 'Puesto de firma invalido' }),
});

export const formSignerBodySchema = z.object({
  signer_name: z.string().trim().min(1, 'El nombre es obligatorio').max(120, 'El nombre es demasiado largo'),
  signer_title: z.string().trim().min(1, 'El cargo es obligatorio').max(120, 'El cargo es demasiado largo'),
  /** PNG en data URL o base64; sin imagen se conserva la firma vigente. */
  image: z.string().min(1).max(7_000_000, 'La imagen es demasiado grande').optional(),
});
export type FormSignerBody = z.infer<typeof formSignerBodySchema>;
