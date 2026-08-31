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

export const positionDocumentSchema = z.object({
  document_id: z.string().uuid('El documento es invalido'),
  sort_order: z.number().int().optional(),
});

export type PositionDocumentInput = z.infer<typeof positionDocumentSchema>;

export const assignEmployeePositionSchema = z.object({
  position_id: z.number().int().positive('El puesto es obligatorio'),
});

export type AssignEmployeePositionInput = z.infer<typeof assignEmployeePositionSchema>;
