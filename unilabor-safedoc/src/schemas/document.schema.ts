import { z } from 'zod';

const documentStatus = z.string().trim().toLowerCase().pipe(z.enum(['active', 'inactive']));

// Campos de metadata que el controller permite actualizar; al menos uno debe venir.
const METADATA_FIELDS = ['title', 'description', 'code', 'publish_date', 'expiry_date', 'category_id', 'status'] as const;

export const updateDocumentStatusSchema = z
  .object({
    status: documentStatus,
  })
  .passthrough();

export const updateDocumentMetadataSchema = z
  .object({
    title: z.string().trim().min(2, 'El titulo debe tener al menos 2 caracteres').optional(),
    // Codigo del documento del SGC (ej. "REH-INS-001"), opcional y nullable: se
    // etiqueta manualmente desde esta pantalla para que el modulo de induccion
    // (RH) pueda ligar documentos por codigo. No es unico (versiones superseded
    // pueden compartir codigo con la vigente).
    code: z.string().trim().nullish(),
    category_id: z.coerce.number().int().positive('La categoria debe ser un ID valido').optional(),
    status: documentStatus.optional(),
  })
  .passthrough()
  .refine((data) => METADATA_FIELDS.some((field) => (data as Record<string, unknown>)[field] !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar',
  });

// Endpoints multipart (multer): el body llega como campos de formulario (strings).
// El archivo se valida en el controller; aqui solo los campos de texto/numericos.
export const uploadDocumentSchema = z
  .object({
    category_id: z.coerce.number().int().positive('La categoria es obligatoria'),
  })
  .passthrough();

export const replaceDocumentFileSchema = z
  .object({
    title: z.string().trim().min(2, 'El titulo debe tener al menos 2 caracteres').optional(),
    category_id: z.coerce.number().int().positive('La categoria debe ser un ID valido').optional(),
  })
  .passthrough();
