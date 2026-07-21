import { z } from 'zod';

// Plazo para cumplir el acuse. Default 72h, como las asignaciones de evaluacion.
const MIN_DEADLINE_HOURS = 1;
const MAX_DEADLINE_HOURS = 24 * 90;

// Permanencia minima por pagina dentro del visor. Es un piso anti-atajo, no una
// estimacion de lectura real: calibrarlo alto solo incentiva dejar la pestania
// abierta, que es peor evidencia. Ver migracion 20260721_01.
const MIN_SECONDS_PER_PAGE = 1;
const MAX_SECONDS_PER_PAGE = 120;

export const assignAcknowledgementSchema = z.object({
  employee_ids: z
    .array(z.number().int().positive('El identificador del colaborador es invalido'))
    .min(1, 'Debes seleccionar al menos un colaborador'),
  deadline_hours: z
    .number()
    .int()
    .min(MIN_DEADLINE_HOURS, 'El plazo minimo es de 1 hora')
    .max(MAX_DEADLINE_HOURS, 'El plazo maximo es de 90 dias')
    .optional(),
  min_seconds_per_page: z
    .number()
    .int()
    .min(MIN_SECONDS_PER_PAGE, 'El minimo por pagina es de 1 segundo')
    .max(MAX_SECONDS_PER_PAGE, 'El maximo por pagina es de 120 segundos')
    .optional(),
});

export type AssignAcknowledgementInput = z.infer<typeof assignAcknowledgementSchema>;

// Latido del visor. Deliberadamente NO acepta segundos: el tiempo lo mide el
// servidor contra su propio reloj. Aceptarlos del cliente permitiria saltarse el
// gate con un solo POST.
export const readingProgressSchema = z.object({
  page: z.number().int().positive('La pagina reportada es invalida'),
});

export type ReadingProgressInput = z.infer<typeof readingProgressSchema>;

// Firma autografa: data URL PNG que emite el SignaturePad. La IP y el navegador
// los toma el servidor de la peticion, no del cuerpo.
export const signAcknowledgementSchema = z.object({
  signature: z.string().trim().min(1, 'La firma autografa es obligatoria'),
});

export type SignAcknowledgementInput = z.infer<typeof signAcknowledgementSchema>;

// Carga de documento institucional. Llega como multipart, asi que los numeros
// vienen en texto y se coercionan.
export const createInstitutionalDocumentSchema = z.object({
  title: z.string().trim().min(1, 'El titulo es obligatorio'),
  description: z.string().trim().optional(),
  target_document_type_id: z.coerce
    .number()
    .int()
    .positive('Debes indicar el tipo documental donde aterriza la copia firmada'),
});

export type CreateInstitutionalDocumentInput = z.infer<typeof createInstitutionalDocumentSchema>;
