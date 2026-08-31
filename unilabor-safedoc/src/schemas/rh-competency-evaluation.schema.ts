import { z } from 'zod';

/**
 * Esquemas del modulo Evaluacion de competencia (REH-REG-003). Los calculos y
 * las reglas de negocio (VETO, dictamen, plan de acciones obligatorio) viven
 * en el servicio; aqui solo la forma de la entrada.
 */

const requiredText = (message: string) => z.string().trim().min(1, message);
const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal('').transform(() => undefined))
  .nullable();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (YYYY-MM-DD)');

const evaluationType = z.enum(['INICIAL', 'PERIODICA', 'REEVALUACION', 'CAMBIO_PUESTO', 'POST_CAPACITACION']);

export const createCompetencyEvaluationSchema = z
  .object({
    employee_id: z.coerce.number().int().positive('Colaborador invalido'),
    position_id: z.coerce.number().int().positive('Puesto invalido'),
    evaluation_type: evaluationType,
    evaluation_date: isoDate,
    evaluator_name: requiredText('El nombre del evaluador es obligatorio'),
    reference_course_id: z.coerce.number().int().positive().optional().nullable(),
    reference_course_date: isoDate.optional().nullable(),
  })
  .passthrough();

export const updateCompetencyEvaluationSchema = z
  .object({
    evaluation_type: evaluationType.optional(),
    evaluation_date: isoDate.optional(),
    evaluator_name: requiredText('El nombre del evaluador no puede quedar vacio').optional(),
    reference_course_id: z.coerce.number().int().positive().optional().nullable(),
    reference_course_date: isoDate.optional().nullable(),
  })
  .passthrough();

const itemSchema = z.object({
  item_text: requiredText('El item no puede quedar vacio'),
  criticality: z.enum(['A', 'M', 'B']),
  method: z.enum(['OD', 'RR', 'ES', 'EP', 'SI']).optional().nullable(),
  score: z.coerce.number().int().min(1).max(4).optional().nullable(),
  expected_answer: optionalText,
  given_answer: optionalText,
  is_correct: z.boolean().optional().nullable(),
  observations: optionalText,
});

export const replaceSectionItemsSchema = z
  .object({
    section: z.enum(['COMPETENCIA', 'DESEMPENO', 'CONOCIMIENTO']),
    items: z.array(itemSchema).max(50, 'Demasiados items en la seccion'),
  })
  .passthrough();

export const replaceActionsSchema = z
  .object({
    actions: z.array(
      z.object({
        improvement_area: requiredText('La oportunidad de mejora es obligatoria'),
        required_action: requiredText('La accion requerida es obligatoria'),
        responsible: optionalText,
        due_date: isoDate.optional().nullable(),
        follow_up: optionalText,
      }),
    ).max(30),
  })
  .passthrough();

export const closeCompetencyEvaluationSchema = z
  .object({
    collaborator_signature: requiredText('La firma del colaborador es obligatoria'),
    evaluator_signature: requiredText('La firma del evaluador es obligatoria'),
    area_signature: requiredText('La firma del coordinador del área es obligatoria'),
    rh_signature: requiredText('La firma de RH es obligatoria'),
    director_signature: requiredText('La firma del Director General es obligatoria'),
    area_signatory_name: requiredText('El nombre del coordinador del área es obligatorio'),
    rh_signatory_name: requiredText('El nombre del coordinador de RH es obligatorio'),
    director_signatory_name: requiredText('El nombre del Director General es obligatorio'),
  })
  .passthrough();
