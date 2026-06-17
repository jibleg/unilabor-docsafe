import { z } from 'zod';

/**
 * Esquemas de validacion del modulo de Evaluaciones de capacitacion (ISO 15189).
 * Cubre capacitaciones (training_courses), plantillas (evaluation_templates) y el
 * banco de preguntas (evaluation_questions + evaluation_question_options).
 */

const requiredText = (message: string) => z.string().trim().min(1, message);
const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal('').transform(() => undefined))
  .nullable();

// --- Capacitaciones ---

export const createTrainingCourseSchema = z
  .object({
    code: optionalText,
    title: requiredText('El titulo de la capacitacion es obligatorio'),
    description: optionalText,
    certificate_validity_months: z.coerce
      .number()
      .int('La vigencia debe ser un numero entero de meses')
      .min(0, 'La vigencia no puede ser negativa')
      .max(600, 'La vigencia es demasiado alta')
      .optional(),
  })
  .passthrough();

export const updateTrainingCourseSchema = z
  .object({
    code: optionalText,
    title: requiredText('El titulo no puede quedar vacio').optional(),
    description: optionalText,
    certificate_validity_months: z.coerce
      .number()
      .int('La vigencia debe ser un numero entero de meses')
      .min(0, 'La vigencia no puede ser negativa')
      .max(600, 'La vigencia es demasiado alta')
      .optional(),
    is_active: z.coerce.boolean().optional(),
  })
  .passthrough()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar la capacitacion',
  });

// --- Plantillas de evaluacion ---

const templateCoreShape = {
  title: requiredText('El titulo de la evaluacion es obligatorio'),
  instructions: optionalText,
  passing_score: z.coerce
    .number()
    .int('El puntaje de aprobacion debe ser entero')
    .min(0, 'El puntaje minimo es 0')
    .max(100, 'El puntaje maximo es 100')
    .optional(),
  window_hours: z.coerce
    .number()
    .int('La ventana debe ser un numero entero de horas')
    .positive('La ventana debe ser mayor a 0')
    .optional(),
  selection_mode: z.enum(['all', 'random']).optional(),
  random_count: z.coerce
    .number()
    .int('La cantidad aleatoria debe ser entera')
    .positive('La cantidad aleatoria debe ser mayor a 0')
    .optional()
    .nullable(),
  status: z.enum(['draft', 'published']).optional(),
};

// Si el modo es 'random', random_count es obligatorio (> 0).
const randomCountRefinement = (data: Record<string, unknown>) => {
  if (data.selection_mode !== 'random') {
    return true;
  }
  return typeof data.random_count === 'number' && data.random_count > 0;
};

export const createEvaluationTemplateSchema = z
  .object(templateCoreShape)
  .passthrough()
  .refine(randomCountRefinement, {
    message: 'Si el modo de seleccion es aleatorio, debes indicar la cantidad de preguntas a entregar',
    path: ['random_count'],
  });

export const updateEvaluationTemplateSchema = z
  .object({ ...templateCoreShape, is_active: z.coerce.boolean().optional() })
  .partial()
  .passthrough()
  .refine(randomCountRefinement, {
    message: 'Si el modo de seleccion es aleatorio, debes indicar la cantidad de preguntas a entregar',
    path: ['random_count'],
  });

// --- Banco de preguntas (reemplazo total del banco de una plantilla) ---

const questionOptionSchema = z.object({
  text: requiredText('El texto de la opcion es obligatorio'),
  is_correct: z.coerce.boolean().optional().default(false),
  sort_order: z.coerce.number().int().optional(),
});

const questionSchema = z
  .object({
    type: z.enum(['single', 'multiple', 'boolean', 'open'], {
      message: 'Tipo de pregunta invalido',
    }),
    text: requiredText('El texto de la pregunta es obligatorio'),
    points: z.coerce.number().int().positive('Los puntos deben ser mayores a 0').optional(),
    sort_order: z.coerce.number().int().optional(),
    options: z.array(questionOptionSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    const correctCount = data.options.filter((option) => option.is_correct).length;

    if (data.type === 'open') {
      if (data.options.length > 0) {
        ctx.addIssue({ code: 'custom', message: 'Las preguntas abiertas no llevan opciones', path: ['options'] });
      }
      return;
    }

    if (data.options.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Las preguntas de opcion requieren al menos 2 opciones', path: ['options'] });
    }

    if ((data.type === 'single' || data.type === 'boolean') && correctCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Las preguntas de opcion unica o V/F deben tener exactamente una opcion correcta',
        path: ['options'],
      });
    }

    if (data.type === 'multiple' && correctCount < 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Las preguntas de opcion multiple deben tener al menos una opcion correcta',
        path: ['options'],
      });
    }
  });

export const replaceQuestionsSchema = z
  .object({
    questions: z.array(questionSchema).min(1, 'La evaluacion debe tener al menos una pregunta'),
  })
  .passthrough();

// --- Asignacion de evaluaciones a colaboradores ---

export const assignEvaluationSchema = z
  .object({
    employee_ids: z
      .array(z.coerce.number().int().positive())
      .min(1, 'Debes seleccionar al menos un colaborador'),
  })
  .passthrough();

// --- Envio de respuestas del colaborador ---

const answerSchema = z.object({
  question_id: z.coerce.number().int().positive(),
  selected_option_ids: z.array(z.coerce.number().int().positive()).optional(),
  text_answer: z.string().optional().nullable(),
});

export const submitEvaluationSchema = z
  .object({
    answers: z.array(answerSchema),
  })
  .passthrough();

// --- Calificacion manual de respuestas abiertas (RH) ---

export const gradeEvaluationSchema = z
  .object({
    grades: z
      .array(
        z.object({
          question_id: z.coerce.number().int().positive(),
          points_awarded: z.coerce.number().int().min(0, 'Los puntos no pueden ser negativos'),
        }),
      )
      .min(1, 'Debes calificar al menos una respuesta'),
  })
  .passthrough();

// --- Plantilla de constancia ---

const certificateSignatureSchema = z.object({
  signatory_name: requiredText('El nombre del firmante es obligatorio'),
  role: optionalText,
  signature_image_path: optionalText,
});

export const upsertCertificateTemplateSchema = z
  .object({
    title_text: optionalText,
    body_text: optionalText,
    logo_path: optionalText,
    orientation: z.enum(['landscape', 'portrait']).optional(),
    signatures: z.array(certificateSignatureSchema).max(4, 'Maximo 4 firmas').optional(),
  })
  .passthrough();
