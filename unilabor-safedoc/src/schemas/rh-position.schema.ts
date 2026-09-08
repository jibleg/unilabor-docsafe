import { z } from 'zod';

export const positionSchema = z.object({
  code: z.string().trim().min(1, 'El codigo del puesto es obligatorio'),
  name: z.string().trim().min(1, 'El nombre del puesto es obligatorio'),
  description: z.string().trim().nullish(),
  sort_order: z.number().int().nullish(),
  is_active: z.boolean().optional(),
});

export type PositionInput = z.infer<typeof positionSchema>;

export const positionCompetencySchema = z.object({
  competency_text: z.string().trim().min(1, 'La competencia no puede estar vacia'),
  criticality: z.enum(['A', 'M', 'B']).optional(),
  sort_order: z.number().int().optional(),
});

export type PositionCompetencyInput = z.infer<typeof positionCompetencySchema>;

/** Edicion parcial de una competencia ya registrada (texto y/o criticidad). */
export const positionCompetencyUpdateSchema = z
  .object({
    competency_text: z.string().trim().min(1, 'La competencia no puede estar vacia').optional(),
    criticality: z.enum(['A', 'M', 'B']).optional(),
  })
  .refine((value) => value.competency_text !== undefined || value.criticality !== undefined, {
    message: 'Indica el texto o la criticidad a actualizar',
  });

export type PositionCompetencyUpdateInput = z.infer<typeof positionCompetencyUpdateSchema>;

export const positionDocumentSchema = z.object({
  document_id: z.string().uuid('El documento es invalido'),
  sort_order: z.number().int().optional(),
});

export type PositionDocumentInput = z.infer<typeof positionDocumentSchema>;

export const assignEmployeePositionSchema = z.object({
  position_id: z.number().int().positive('El puesto es obligatorio'),
});

export type AssignEmployeePositionInput = z.infer<typeof assignEmployeePositionSchema>;
