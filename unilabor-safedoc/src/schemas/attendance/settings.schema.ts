import { z } from 'zod';

export const settingKeyParamsSchema = z.object({
  key: z.string().trim().min(1).max(80),
});

export const saveSettingSchema = z.object({
  value: z.union([z.number(), z.string()]),
  reason: z.string().trim().min(5, 'Indica el motivo del cambio (minimo 5 caracteres).').max(500),
});

export const settingChangesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
