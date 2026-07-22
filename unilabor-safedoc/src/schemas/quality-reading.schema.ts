import { z } from 'zod';

// Sala de Lectura (Calidad). Todo endpoint de escritura valida aqui; el
// controlador ya recibe la forma correcta.

export const publishReadingSchema = z
  .object({
    document_id: z.string().uuid('El documento del SGC es obligatorio.'),
    deadline_hours: z.number().int().min(1).max(8760).optional(),
    min_seconds_per_page: z.number().int().min(1).max(120).optional(),
    instructions: z.string().trim().max(2000).nullish(),
  })
  .passthrough();

// Las tres formas de asignar acordadas con el negocio. El discriminante evita
// que llegue un `mode: 'area'` sin area, o un 'users' con la lista vacia.
export const assignReadersSchema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('users'),
      user_ids: z.array(z.string().uuid()).min(1, 'Debes seleccionar al menos un lector.'),
      deadline_hours: z.number().int().min(1).max(8760).optional(),
    }),
    z.object({
      mode: z.literal('area'),
      area: z.string().trim().min(1, 'El area es obligatoria.'),
      deadline_hours: z.number().int().min(1).max(8760).optional(),
    }),
    z.object({
      mode: z.literal('all'),
      deadline_hours: z.number().int().min(1).max(8760).optional(),
    }),
  ]);

// El progreso NO acepta segundos a proposito: si el cliente pudiera reportar
// tiempo, bastaria un POST con un numero grande para saltarse el gate. El
// servidor mide con su propio reloj.
export const readingProgressSchema = z
  .object({
    page: z.coerce.number().int().min(1, 'La pagina reportada es invalida.'),
  })
  .strict();

export const signReadingSchema = z
  .object({
    signature: z.string().min(1, 'La firma autografa es obligatoria.'),
  })
  .passthrough();

export const republishSchema = z
  .object({
    deadline_hours: z.number().int().min(1).max(8760).optional(),
    min_seconds_per_page: z.number().int().min(1).max(120).optional(),
    include_unsigned: z.boolean().optional(),
  })
  .passthrough();
