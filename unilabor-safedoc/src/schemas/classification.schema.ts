import { z } from 'zod';

const requiredText = (message: string) => z.string().trim().min(1, message);

// Catalogo compartido de clasificacion (Proveedor / Cliente).
export const classificationSchema = z
  .object({
    type: z.enum(['PROVIDER', 'CLIENT'], {
      message: 'El tipo debe ser PROVIDER o CLIENT',
    }),
    name: requiredText('El nombre es obligatorio'),
  })
  .passthrough();
