import { z } from 'zod';

const requiredText = (message: string) => z.string().trim().min(1, message);

// --- Proveedores (catalogo, escribe en helpdesk_suppliers) ---
export const providerSchema = z
  .object({
    name: requiredText('El nombre es obligatorio'),
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

// --- Destinatarios de alerta de vencimiento ---
export const providerNotificationRecipientSchema = z
  .object({
    user_id: requiredText('El usuario es obligatorio'),
  })
  .passthrough();
