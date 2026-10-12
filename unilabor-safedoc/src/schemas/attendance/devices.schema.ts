import { z } from 'zod';

/** Entrada del panel de relojes (JWT de usuario). */

const idParam = z.coerce.number().int().positive();

export const createAgentSchema = z.object({
  branch_id: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
});

export const updateAgentSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.is_active !== undefined, { message: 'No hay cambios que guardar' });

export const updateTerminalSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.is_active !== undefined, { message: 'No hay cambios que guardar' });

export const syncAgentSchema = z.object({ all: z.boolean().optional() });

export const enrollSchema = z.object({ mode: z.enum(['fingerprint', 'face']) });

export const ordersQuerySchema = z.object({
  agent_id: idParam.optional(),
  status: z.enum(['pending', 'processing', 'done', 'error']).optional(),
  page: idParam.default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const idParamsSchema = z.object({ id: idParam });
export const employeeIdParamsSchema = z.object({ employeeId: idParam });

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type UpdateTerminalInput = z.infer<typeof updateTerminalSchema>;
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
