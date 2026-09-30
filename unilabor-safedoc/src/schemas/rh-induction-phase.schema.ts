import { z } from 'zod';

/** Interruptor por fase "Completar checklist al aprobar". */
export const updatePhaseAutoChecklistSchema = z.object({
  enabled: z.boolean({ error: 'Indica si el checklist se completa al aprobar.' }),
});

export type UpdatePhaseAutoChecklistInput = z.infer<typeof updatePhaseAutoChecklistSchema>;

/** Mapeo documento de fase -> tipo documental del expediente (null = no archivar). */
export const setPhaseDocumentExpedientTypeSchema = z.object({
  document_type_id: z
    .number({ error: 'Indica el tipo documental del expediente (o null para no archivar).' })
    .int()
    .positive()
    .nullable(),
});

export type SetPhaseDocumentExpedientTypeInput = z.infer<typeof setPhaseDocumentExpedientTypeSchema>;
