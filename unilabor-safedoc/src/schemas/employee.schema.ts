import { z } from 'zod';

const requiredText = (message: string) => z.string().trim().min(1, message);

export const createEmployeeSchema = z
  .object({
    full_name: requiredText('El nombre completo es obligatorio'),
    email: requiredText('El correo es obligatorio'),
  })
  .passthrough();

const UPDATE_EMPLOYEE_FIELDS = ['employee_code', 'user_id', 'full_name', 'email', 'area', 'position'] as const;

export const updateEmployeeSchema = z
  .object({
    // Si se envian, no pueden quedar vacios (coincide con los chequeos del controller).
    full_name: requiredText('El nombre completo no puede quedar vacio').optional(),
    email: requiredText('El correo no puede quedar vacio').optional(),
  })
  .passthrough()
  .refine((data) => UPDATE_EMPLOYEE_FIELDS.some((field) => (data as Record<string, unknown>)[field] !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar al colaborador',
  });

const optionalIdArray = z.array(z.coerce.number().int().positive()).optional();

export const updateEmployeeDocumentAccessSchema = z
  .object({
    section_ids: optionalIdArray,
    enabled_section_ids: optionalIdArray,
    document_type_ids: optionalIdArray,
    enabled_document_type_ids: optionalIdArray,
  })
  .passthrough();

// Endpoints multipart (multer): validamos los campos de texto/numericos; el
// archivo y las reglas de vigencia se validan en el controller.
export const uploadEmployeeDocumentSchema = z
  .object({
    document_type_id: z.coerce.number().int().positive('El tipo documental es obligatorio'),
    title: requiredText('El titulo es obligatorio'),
  })
  .passthrough();
