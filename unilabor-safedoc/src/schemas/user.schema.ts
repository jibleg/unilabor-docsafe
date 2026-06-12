import { z } from 'zod';

const ROLES = ['ADMIN', 'EDITOR', 'VIEWER'] as const;
const MODULE_CODES = ['QUALITY', 'RH', 'HELPDESK'] as const;

export const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .trim()
    .min(6, 'La nueva contrasena debe tener al menos 6 caracteres'),
});

// Acepta tanto snake_case como camelCase (category_ids/categoryIds,
// module_codes/moduleCodes) y descarta los nulls para que apliquen los defaults.
const normalizeUserKeys = (data: unknown): unknown => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  const source = data as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };

  if (normalized.category_ids === undefined && source.categoryIds !== undefined) {
    normalized.category_ids = source.categoryIds;
  }
  if (normalized.module_codes === undefined && source.moduleCodes !== undefined) {
    normalized.module_codes = source.moduleCodes;
  }
  if (normalized.category_ids === null) {
    delete normalized.category_ids;
  }
  if (normalized.module_codes === null) {
    delete normalized.module_codes;
  }
  return normalized;
};

const uniqueNumbers = z
  .array(z.coerce.number().int().positive('Los IDs de categoria deben ser numeros positivos'))
  .default([])
  .transform((ids) => Array.from(new Set(ids)));

const moduleCodes = z
  .array(z.string().trim().toUpperCase().pipe(z.enum(MODULE_CODES)))
  .default(['QUALITY'])
  .transform((codes) => Array.from(new Set(codes)));

export const createUserSchema = z.preprocess(
  normalizeUserKeys,
  z
    .object({
      email: z.string().trim().min(1, 'El email es requerido').pipe(z.email('Email invalido')),
      full_name: z.string().trim().min(1, 'El nombre es requerido'),
      role: z.string().trim().toUpperCase().pipe(z.enum(ROLES)),
      category_ids: uniqueNumbers,
      module_codes: moduleCodes,
    })
    .refine(
      (data) =>
        !(data.role === 'VIEWER' && data.module_codes.includes('QUALITY') && data.category_ids.length === 0),
      {
        message: 'Un usuario VIEWER debe tener al menos una categoria asignada',
        path: ['category_ids'],
      },
    ),
);
