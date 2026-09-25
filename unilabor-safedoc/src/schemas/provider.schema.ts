import { z } from 'zod';

const requiredText = (message: string) => z.string().trim().min(1, message);

// --- Proveedores (catalogo, escribe en helpdesk_suppliers) ---
export const providerSchema = z
  .object({
    name: requiredText('El nombre es obligatorio'),
    classification_id: z.number().int().positive().nullable().optional(),
  })
  .passthrough();

// --- Contactos del proveedor ---
export const providerContactSchema = z
  .object({
    name: requiredText('El nombre es obligatorio'),
  })
  .passthrough();

// --- Categorias de documento (catalogo) ---
// name es obligatorio; code/description/sort_order los valida el service.
export const providerDocumentCategorySchema = z
  .object({
    name: requiredText('El nombre es obligatorio'),
  })
  .passthrough();

// --- Documentos: endpoints multipart (multer), el body llega como strings ---
export const uploadProviderDocumentSchema = z
  .object({
    category_id: z.coerce.number().int().positive('La categoria es obligatoria'),
    title: requiredText('El titulo es obligatorio'),
  })
  .passthrough();

export const replaceProviderDocumentSchema = z
  .object({
    title: z.string().trim().min(2, 'El titulo debe tener al menos 2 caracteres').optional(),
    category_id: z.coerce.number().int().positive('La categoria debe ser un ID valido').optional(),
  })
  .passthrough();

// --- Documentos: correccion de metadatos (JSON), sin tocar el PDF ---
const optionalDateOnly = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato AAAA-MM-DD'), z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === '' ? null : value));

export const updateProviderDocumentSchema = z
  .object({
    category_id: z.coerce.number().int().positive('La categoria debe ser un ID valido').optional(),
    title: z.string().trim().min(2, 'El titulo debe tener al menos 2 caracteres').max(255).optional(),
    description: z
      .union([z.string().trim().max(2000, 'La descripcion no puede exceder 2000 caracteres'), z.null()])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === '' ? null : value)),
    document_date: optionalDateOnly,
    effective_from: optionalDateOnly,
    expiry_date: optionalDateOnly,
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'No hay cambios que guardar.',
  });

export type UpdateProviderDocumentInput = z.infer<typeof updateProviderDocumentSchema>;

// --- Destinatarios de alerta de vencimiento ---
export const providerNotificationRecipientSchema = z
  .object({
    user_id: requiredText('El usuario es obligatorio'),
  })
  .passthrough();
