import { z } from 'zod';

const ROLES = ['ADMIN', 'EDITOR', 'VIEWER'] as const;

export const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .trim()
    .min(6, 'La nueva contrasena debe tener al menos 6 caracteres'),
});

// Acepta tanto snake_case como camelCase (category_ids/categoryIds) y descarta
// los nulls para que apliquen los defaults. El acceso a modulos ya no se asigna
// por esta via (se otorga vía roles RBAC en la UI de Roles); no hay module_codes.
const normalizeUserKeys = (data: unknown): unknown => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  const source = data as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };

  if (normalized.category_ids === undefined && source.categoryIds !== undefined) {
    normalized.category_ids = source.categoryIds;
  }
  if (normalized.category_ids === null) {
    delete normalized.category_ids;
  }
  return normalized;
};

const uniqueNumbers = z
  .array(z.coerce.number().int().positive('Los IDs de categoria deben ser numeros positivos'))
  .default([])
  .transform((ids) => Array.from(new Set(ids)));

export const createUserSchema = z.preprocess(
  normalizeUserKeys,
  z.object({
    email: z.string().trim().min(1, 'El email es requerido').pipe(z.email('Email invalido')),
    full_name: z.string().trim().min(1, 'El nombre es requerido'),
    role: z.string().trim().toUpperCase().pipe(z.enum(ROLES)),
    category_ids: uniqueNumbers,
  }),
);

// Campos que el controller permite actualizar; al menos uno debe venir.
const UPDATE_USER_FIELDS = ['email', 'full_name', 'role'] as const;

const optionalRole = z.string().trim().toUpperCase().pipe(z.enum(ROLES)).optional();

export const updateUserSchema = z
  .object({
    email: z.string().trim().min(1).pipe(z.email('Email invalido')).optional(),
    role: optionalRole,
  })
  .passthrough()
  .refine((data) => UPDATE_USER_FIELDS.some((field) => (data as Record<string, unknown>)[field] !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const resetUserPasswordSchema = z
  .object({
    // Cadena vacia o ausente -> el controller genera una temporal aleatoria.
    temporaryPassword: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(6, 'La contrasena temporal debe tener al menos 6 caracteres').optional(),
    ),
  })
  .passthrough();

const optionalIdArray = z.array(z.coerce.number().int().positive()).optional();

export const replaceUserCategoriesSchema = z
  .object({
    category_ids: optionalIdArray,
    categoryIds: optionalIdArray,
  })
  .passthrough();
