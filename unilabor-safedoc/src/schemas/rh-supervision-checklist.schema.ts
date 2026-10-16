import { z } from 'zod';

/**
 * Esquemas de la Lista de verificacion de Supervision ANA-REG-060. Los
 * calculos (porcentaje, bandas, aprobacion de la Fase 6) viven en el servicio.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (YYYY-MM-DD)');
const optionalText = z
  .string()
  .trim()
  .max(2000, 'Texto demasiado largo')
  .optional()
  .or(z.literal('').transform(() => undefined))
  .nullable();
const supervisionType = z.enum(['PROGRAMADA', 'NO_PROGRAMADA']);
const positiveId = z.coerce.number().int().positive();

export const createSupervisionChecklistSchema = z
  .object({
    // Con enrollment_id basta: colaborador y puesto se resuelven de la inscripcion.
    employee_id: positiveId.optional().nullable(),
    position_id: positiveId.optional().nullable(),
    enrollment_id: positiveId.optional().nullable(),
    supervision_date: isoDate,
    supervision_type: supervisionType.optional(),
    supervisor_name: optionalText,
    area_responsible_name: optionalText,
    area_name: optionalText,
    reuse_draft: z.boolean().optional(),
  })
  .passthrough()
  .refine((value) => Boolean(value.enrollment_id) || (Boolean(value.employee_id) && Boolean(value.position_id)), {
    message: 'Indica la inscripcion de la Fase 6 o el colaborador y el puesto',
    path: ['enrollment_id'],
  });
export type CreateSupervisionChecklistBody = z.infer<typeof createSupervisionChecklistSchema>;

const headerSchema = z.object({
  supervision_date: isoDate.optional(),
  supervision_type: supervisionType.optional(),
  area_name: optionalText,
  supervisor_name: z.string().trim().min(1, 'El supervisor es obligatorio').max(200).optional(),
  area_responsible_name: z.string().trim().max(200).optional(),
  sgc_follow_up_required: z.boolean().optional(),
  sgc_reference: optionalText,
  supervisor_comments: optionalText,
});

export const updateSupervisionChecklistSchema = headerSchema.passthrough();
export type UpdateSupervisionChecklistBody = z.infer<typeof updateSupervisionChecklistSchema>;

export const saveSupervisionResultsSchema = z
  .object({
    results: z
      .array(
        z.object({
          item_id: positiveId,
          result: z.enum(['SI', 'NO', 'NA']).nullable(),
          observations: optionalText,
        }),
      )
      .min(1, 'Sin resultados que guardar')
      .max(100, 'Demasiados items'),
  })
  .passthrough();
export type SaveSupervisionResultsBody = z.infer<typeof saveSupervisionResultsSchema>;

const signature = z.string().trim().min(1, 'Firma vacia').max(2_000_000, 'Firma demasiado grande');

export const closeSupervisionChecklistSchema = z
  .object({
    supervisor_signature: signature,
    area_responsible_signature: signature,
    employee_signature: signature.optional().nullable(),
    is_final: z.boolean().optional(),
    header: headerSchema.optional(),
  })
  .passthrough();
export type CloseSupervisionChecklistBody = z.infer<typeof closeSupervisionChecklistSchema>;

export const setPositionNaItemsSchema = z
  .object({
    item_ids: z.array(positiveId).max(200),
  })
  .passthrough();
export type SetPositionNaItemsBody = z.infer<typeof setPositionNaItemsSchema>;

export const supervisionListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'CLOSED']).optional(),
  employee_id: positiveId.optional(),
  position_id: positiveId.optional(),
  enrollment_id: positiveId.optional(),
  area: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const supervisionPendingQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  area: z.string().trim().max(120).optional(),
  include_passed: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),
});

export const saveAreaSignatoriesSchema = z
  .object({
    rows: z
      .array(
        z.object({
          area_name: z.string().trim().min(1, 'Area vacia').max(120),
          supervisor_name: z.string().trim().max(200).default(''),
          area_responsible_name: z.string().trim().max(200).default(''),
        }),
      )
      .min(1)
      .max(200),
  })
  .passthrough();
export type SaveAreaSignatoriesBody = z.infer<typeof saveAreaSignatoriesSchema>;

export const generateDraftsSchema = z
  .object({
    employee_ids: z.array(positiveId).max(500).optional(),
  })
  .passthrough();
export type GenerateDraftsBody = z.infer<typeof generateDraftsSchema>;
