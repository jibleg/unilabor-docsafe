import { describe, expect, it } from 'vitest';
import {
  assignEvaluationSchema,
  createEvaluationTemplateSchema,
  createTrainingCourseSchema,
  replaceQuestionsSchema,
} from './training.schema';

describe('createTrainingCourseSchema', () => {
  it('acepta una capacitacion minima y aplica defaults de vigencia opcional', () => {
    const result = createTrainingCourseSchema.safeParse({ title: 'Bioseguridad' });
    expect(result.success).toBe(true);
  });

  it('rechaza titulo vacio', () => {
    const result = createTrainingCourseSchema.safeParse({ title: '   ' });
    expect(result.success).toBe(false);
  });

  it('rechaza vigencia negativa', () => {
    const result = createTrainingCourseSchema.safeParse({ title: 'X', certificate_validity_months: -1 });
    expect(result.success).toBe(false);
  });
});

describe('createEvaluationTemplateSchema', () => {
  it('exige random_count cuando el modo es aleatorio', () => {
    const result = createEvaluationTemplateSchema.safeParse({
      title: 'Eval',
      selection_mode: 'random',
    });
    expect(result.success).toBe(false);
  });

  it('acepta modo aleatorio con random_count valido', () => {
    const result = createEvaluationTemplateSchema.safeParse({
      title: 'Eval',
      selection_mode: 'random',
      random_count: 10,
    });
    expect(result.success).toBe(true);
  });

  it('acepta modo all sin random_count', () => {
    const result = createEvaluationTemplateSchema.safeParse({ title: 'Eval', selection_mode: 'all' });
    expect(result.success).toBe(true);
  });

  it('rechaza passing_score fuera de rango', () => {
    const result = createEvaluationTemplateSchema.safeParse({ title: 'Eval', passing_score: 120 });
    expect(result.success).toBe(false);
  });
});

describe('replaceQuestionsSchema', () => {
  it('acepta un banco con opcion unica bien formada', () => {
    const result = replaceQuestionsSchema.safeParse({
      questions: [
        {
          type: 'single',
          text: 'Cual es el EPP basico?',
          options: [
            { text: 'Guantes', is_correct: true },
            { text: 'Ninguno', is_correct: false },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza opcion unica con mas de una correcta', () => {
    const result = replaceQuestionsSchema.safeParse({
      questions: [
        {
          type: 'single',
          text: 'X',
          options: [
            { text: 'A', is_correct: true },
            { text: 'B', is_correct: true },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza opcion multiple sin ninguna correcta', () => {
    const result = replaceQuestionsSchema.safeParse({
      questions: [
        {
          type: 'multiple',
          text: 'X',
          options: [
            { text: 'A', is_correct: false },
            { text: 'B', is_correct: false },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('acepta pregunta abierta sin opciones', () => {
    const result = replaceQuestionsSchema.safeParse({
      questions: [{ type: 'open', text: 'Describe el procedimiento' }],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza pregunta abierta con opciones', () => {
    const result = replaceQuestionsSchema.safeParse({
      questions: [{ type: 'open', text: 'X', options: [{ text: 'A' }] }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza un banco vacio', () => {
    const result = replaceQuestionsSchema.safeParse({ questions: [] });
    expect(result.success).toBe(false);
  });
});

describe('assignEvaluationSchema', () => {
  it('acepta una lista de colaboradores', () => {
    const result = assignEvaluationSchema.safeParse({ employee_ids: [1, 2, 3] });
    expect(result.success).toBe(true);
  });

  it('coacciona strings numericos', () => {
    const result = assignEvaluationSchema.safeParse({ employee_ids: ['4', '5'] });
    expect(result.success).toBe(true);
  });

  it('rechaza lista vacia', () => {
    const result = assignEvaluationSchema.safeParse({ employee_ids: [] });
    expect(result.success).toBe(false);
  });
});
