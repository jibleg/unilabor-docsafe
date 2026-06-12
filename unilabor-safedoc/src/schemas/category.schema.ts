import { z } from 'zod';

// Los esquemas usan .passthrough() para no descartar campos que el controller
// pueda leer y que aqui no se modelen; solo se validan los campos clave.

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  })
  .passthrough();

export const updateCategorySchema = createCategorySchema;

export const updateCategoryStatusSchema = z
  .object({
    // El controller acepta boolean | string | number y lo normaliza; aqui solo
    // exigimos que venga presente con un tipo aceptable.
    is_active: z.union([z.boolean(), z.string(), z.number()]),
  })
  .passthrough();
