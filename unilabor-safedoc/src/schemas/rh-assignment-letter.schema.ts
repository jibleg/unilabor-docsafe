import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (AAAA-MM-DD)');

export const setPositionAuthorizationsSchema = z.object({ item_ids: z.array(positiveId).max(200) }).passthrough();
export type SetPositionAuthorizationsBody = z.infer<typeof setPositionAuthorizationsSchema>;

export const updateAssignmentLetterSchema = z
  .object({
    letter_date: isoDate.optional(),
    other_authorizations: z.string().trim().max(500).nullable().optional(),
    area_signatory_employee_id: positiveId.optional(),
    director_signatory_employee_id: positiveId.optional(),
    items: z.array(z.object({ item_id: positiveId, authorized: z.boolean() })).max(200).optional(),
  })
  .passthrough();
export type UpdateAssignmentLetterBody = z.infer<typeof updateAssignmentLetterSchema>;

export const assignmentLetterListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'CLOSED']).optional(),
  q: z.string().trim().max(120).optional(),
});
