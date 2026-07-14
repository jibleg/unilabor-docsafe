import { z } from 'zod';

const permissionCodes = z
  .array(z.string().trim().toUpperCase().min(1))
  .default([])
  .transform((codes) => Array.from(new Set(codes)));

const roleIds = z
  .array(z.coerce.number().int().positive())
  .default([])
  .transform((ids) => Array.from(new Set(ids)));

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'El codigo es requerido')
    .regex(/^[A-Z0-9_]+$/, 'El codigo solo admite letras, numeros y guion bajo'),
  name: z.string().trim().min(1, 'El nombre es requerido'),
  description: z.string().trim().optional(),
  module_code: z.string().trim().toUpperCase().optional(),
  permission_codes: permissionCodes,
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const setRolePermissionsSchema = z.object({
  permission_codes: permissionCodes,
});

export const setUserRolesSchema = z.object({
  role_ids: roleIds,
});

const userIds = z
  .array(z.string().trim().min(1))
  .default([])
  .transform((ids) => Array.from(new Set(ids)));

export const setRoleUsersSchema = z.object({
  user_ids: userIds,
});
