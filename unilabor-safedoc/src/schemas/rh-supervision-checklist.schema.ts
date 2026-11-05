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
  // Solo supervision de area (sin inscripcion): en la Fase 6 los firmantes salen de la asignacion.
  supervisor_employee_id: positiveId.nullable().optional(),
  area_responsible_employee_id: positiveId.nullable().optional(),
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

/** Enviar a firma (RH): decide si la lista es la final de la Fase 6 y admite ultimos cambios de cabecera. */
export const sendToSignatureSchema = z
  .object({
    is_final: z.boolean().optional(),
    header: headerSchema.optional(),
  })
  .passthrough();
export type SendToSignatureBody = z.infer<typeof sendToSignatureSchema>;

/** Buzon de firmas: el firmante solo manda su firma; el rol se deduce de su sesion. */
export const signatureInboxSignSchema = z.object({ signature }).passthrough();
export type SignatureInboxSignBody = z.infer<typeof signatureInboxSignSchema>;

export const setPositionNaItemsSchema = z
  .object({
    item_ids: z.array(positiveId).max(200),
  })
  .passthrough();
export type SetPositionNaItemsBody = z.infer<typeof setPositionNaItemsSchema>;

export const supervisionListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_SIGNATURES', 'CLOSED']).optional(),
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

export const assignSupervisorSchema = z
  .object({
    enrollment_ids: z.array(positiveId).min(1, 'Elige al menos una inscripcion').max(500),
    supervisor_employee_id: positiveId.nullable(),
  })
  .passthrough();
export type AssignSupervisorBody = z.infer<typeof assignSupervisorSchema>;

/** Mis supervisiones: el supervisor envia su lista a firma (con ultimos ajustes de SGC y comentarios). */
export const mySupervisionSendSchema = z
  .object({
    sgc_follow_up_required: z.boolean().optional(),
    sgc_reference: z.string().trim().max(500).nullable().optional(),
    supervisor_comments: z.string().trim().max(2000).nullable().optional(),
  })
  .passthrough();
export type MySupervisionSendBody = z.infer<typeof mySupervisionSendSchema>;

export const generateDraftsSchema = z
  .object({
    employee_ids: z.array(positiveId).max(500).optional(),
  })
  .passthrough();
export type GenerateDraftsBody = z.infer<typeof generateDraftsSchema>;
