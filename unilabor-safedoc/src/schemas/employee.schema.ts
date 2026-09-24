import { z } from 'zod';

const requiredText = (message: string) => z.string().trim().min(1, message);

// Telefono opcional: 10 digitos (numero nacional MX). Se acepta con o sin mascara
// (espacios/guiones/parentesis) y se normaliza a solo digitos para almacenar. El
// envio de SMS (LabsMobile) antepone la lada de pais 52 (ver notification.service).
// Vacio o nulo = sin telefono. `undefined` (campo ausente) se conserva para no
// tocar el telefono en actualizaciones parciales.
const optionalPhone = z
  .union([z.string(), z.null()])
  .transform((value) => (value === null ? '' : value.replace(/\D/g, '')))
  .refine((digits) => digits === '' || /^\d{10}$/.test(digits), {
    message: 'El telefono debe tener 10 digitos (XXX XXX XXXX)',
  })
  .transform((digits) => (digits === '' ? null : digits))
  .optional();

export const createEmployeeSchema = z
  .object({
    full_name: requiredText('El nombre completo es obligatorio'),
    email: requiredText('El correo es obligatorio'),
    phone: optionalPhone,
  })
  .passthrough();

const UPDATE_EMPLOYEE_FIELDS = ['employee_code', 'user_id', 'full_name', 'email', 'phone', 'area', 'position', 'branch_id'] as const;

export const updateEmployeeSchema = z
  .object({
    // Si se envian, no pueden quedar vacios (coincide con los chequeos del controller).
    full_name: requiredText('El nombre completo no puede quedar vacio').optional(),
    email: requiredText('El correo no puede quedar vacio').optional(),
    phone: optionalPhone,
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

// Correccion de texto de un documento ya cargado (titulo / descripcion). Solo
// esos dos campos: el PDF, la version, las fechas y el estado no se tocan.
export const updateEmployeeDocumentMetadataSchema = z.object({
  title: requiredText('El titulo es obligatorio').max(255, 'El titulo es demasiado largo'),
  description: z
    .string()
    .trim()
    .max(2000, 'La descripcion es demasiado larga')
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});
