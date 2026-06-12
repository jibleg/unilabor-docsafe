import { z } from 'zod';

export const createDocumentSectionSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre de la seccion es obligatorio'),
  })
  .passthrough();

// En update, todos los campos son opcionales (el controller solo aplica los
// presentes); validamos que el body sea un objeto y conservamos sus claves.
export const updateDocumentSectionSchema = z.object({}).passthrough();

export const createDocumentTypeSchema = z
  .object({
    section_id: z.coerce.number().int().positive('La seccion es obligatoria'),
    name: z.string().trim().min(1, 'El nombre del tipo documental es obligatorio'),
  })
  .passthrough();

export const updateDocumentTypeSchema = z.object({}).passthrough();
