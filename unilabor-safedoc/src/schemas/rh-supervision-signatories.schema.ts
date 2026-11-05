import { z } from 'zod';

/**
 * Esquemas de la configuracion "Firmantes por area" del ANA-REG-060:
 * responsable general (y suplente) por area del proceso y responsable propio
 * por unidad. Que el area, la unidad y el colaborador existan lo valida el servicio.
 */

const positiveId = z.coerce.number().int().positive();
const areaKey = z
  .string()
  .trim()
  .min(1, 'Area vacia')
  .max(10, 'Area invalida')
  .transform((value) => value.toUpperCase());

/** Rechaza filas repetidas: dos valores para la misma celda no tienen un "ultimo" confiable. */
const rejectDuplicates = <T>(rows: T[], keyOf: (row: T) => string, message: string, ctx: z.RefinementCtx): void => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = keyOf(row);
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', message, path: [index] });
    }
    seen.add(key);
  });
};

export const saveAreaSignatoriesSchema = z
  .object({
    rows: z
      .array(
        z.object({
          area_key: areaKey,
          area_responsible_employee_id: positiveId.nullable().default(null),
          // Omitido = no tocar el suplente; null = quitarlo.
          alternate_employee_id: positiveId.nullable().optional(),
        }),
      )
      .min(1, 'Sin areas que guardar')
      .max(50, 'Demasiadas areas')
      .superRefine((rows, ctx) => rejectDuplicates(rows, (row) => row.area_key, 'Area repetida', ctx)),
  })
  .passthrough();
export type SaveAreaSignatoriesBody = z.infer<typeof saveAreaSignatoriesSchema>;

export const saveUnitSignatoriesSchema = z
  .object({
    rows: z
      .array(
        z.object({
          unit_id: positiveId,
          area_key: areaKey,
          // null = la unidad hereda el responsable general del area.
          area_responsible_employee_id: positiveId.nullable(),
        }),
      )
      .min(1, 'Sin responsables que guardar')
      .max(200, 'Demasiadas filas')
      .superRefine((rows, ctx) => rejectDuplicates(rows, (row) => `${row.unit_id}:${row.area_key}`, 'Unidad y area repetidas', ctx)),
  })
  .passthrough();
export type SaveUnitSignatoriesBody = z.infer<typeof saveUnitSignatoriesSchema>;

/** ?area_key=PRE&unit_ids=1,2&employee_id=62 (sin employee_id = heredar el general). */
export const unitSignatoryImpactQuerySchema = z.object({
  area_key: areaKey,
  unit_ids: z
    .string()
    .trim()
    .regex(/^\d+(,\d+)*$/, 'Unidades invalidas (ids separados por coma)')
    .transform((value) => [...new Set(value.split(',').map(Number))])
    .refine((ids) => ids.length <= 50 && ids.every((id) => id > 0), 'Unidades invalidas'),
  employee_id: positiveId.optional(),
});
