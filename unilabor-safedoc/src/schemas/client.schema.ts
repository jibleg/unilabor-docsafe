import { z } from 'zod';

const requiredText = (message: string) => z.string().trim().min(1, message);

// --- Clientes (catalogo propio, tabla `clients`, NO compartido con Activos) ---
export const clientSchema = z
  .object({
    name: requiredText('El nombre es obligatorio'),
    classification_id: z.number().int().positive().nullable().optional(),
  })
  .passthrough();

// --- Contactos del cliente ---
export const clientContactSchema = z
  .object({
    name: requiredText('El nombre es obligatorio'),
  })
  .passthrough();

// --- Categorias de documento de cliente (catalogo) ---
// name es obligatorio; code/description/sort_order los valida el service.
export const clientDocumentCategorySchema = z
  .object({
    name: requiredText('El nombre es obligatorio'),
  })
  .passthrough();

// --- Documentos: endpoints multipart (multer), el body llega como strings ---
export const uploadClientDocumentSchema = z
  .object({
    category_id: z.coerce.number().int().positive('La categoria es obligatoria'),
    title: requiredText('El titulo es obligatorio'),
  })
  .passthrough();

export const replaceClientDocumentSchema = z
  .object({
    title: z.string().trim().min(2, 'El titulo debe tener al menos 2 caracteres').optional(),
    category_id: z.coerce.number().int().positive('La categoria debe ser un ID valido').optional(),
  })
  .passthrough();

// --- Destinatarios de alerta de vencimiento ---
export const clientNotificationRecipientSchema = z
  .object({
    user_id: requiredText('El usuario es obligatorio'),
  })
  .passthrough();
