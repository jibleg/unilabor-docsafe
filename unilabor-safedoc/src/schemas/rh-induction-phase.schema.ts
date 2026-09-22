import { z } from 'zod';

/** Interruptor por fase "Completar checklist al aprobar". */
export const updatePhaseAutoChecklistSchema = z.object({
  enabled: z.boolean({ error: 'Indica si el checklist se completa al aprobar.' }),
});

export type UpdatePhaseAutoChecklistInput = z.infer<typeof updatePhaseAutoChecklistSchema>;
