import { describe, expect, it } from 'vitest';
import {
  assignEvaluationSchema,
  capturePracticalSchema,
  createEvaluationTemplateSchema,
  createTrainingCourseSchema,
  gradeEvaluationSchema,
  replaceQuestionsSchema,
  submitEvaluationSchema,
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

  it('acepta evaluation_type practico', () => {
    const result = createEvaluationTemplateSchema.safeParse({ title: 'Eval', evaluation_type: 'practical' });
    expect(result.success).toBe(true);
  });

  it('rechaza un evaluation_type invalido', () => {
    const result = createEvaluationTemplateSchema.safeParse({ title: 'Eval', evaluation_type: 'oral' });
    expect(result.success).toBe(false);
  });
});

describe('capturePracticalSchema', () => {
  it('acepta una captura con varios colaboradores y decimales', () => {
    const result = capturePracticalSchema.safeParse({
      template_id: 5,
      captured_at: '2026-07-02',
      results: [
        { employee_id: 1, score: 8 },
        { employee_id: 2, score: 8.5 },
        { employee_id: 3, score: 7 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('acepta sin captured_at (usa fecha actual)', () => {
    const result = capturePracticalSchema.safeParse({
      template_id: 5,
      results: [{ employee_id: 1, score: 10 }],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza lista de resultados vacia', () => {
    const result = capturePracticalSchema.safeParse({ template_id: 5, results: [] });
    expect(result.success).toBe(false);
  });

  it('rechaza calificacion mayor a 10', () => {
    const result = capturePracticalSchema.safeParse({
      template_id: 5,
      results: [{ employee_id: 1, score: 11 }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza calificacion negativa', () => {
    const result = capturePracticalSchema.safeParse({
      template_id: 5,
      results: [{ employee_id: 1, score: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza captured_at con formato invalido', () => {
    const result = capturePracticalSchema.safeParse({
      template_id: 5,
      captured_at: '02/07/2026',
      results: [{ employee_id: 1, score: 8 }],
    });
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

describe('submitEvaluationSchema', () => {
  it('acepta respuestas de opcion y abiertas', () => {
    const result = submitEvaluationSchema.safeParse({
      answers: [
        { question_id: 1, selected_option_ids: [10, 11] },
        { question_id: 2, text_answer: 'respuesta' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('acepta un envio sin respuestas (queda en blanco)', () => {
    const result = submitEvaluationSchema.safeParse({ answers: [] });
    expect(result.success).toBe(true);
  });

  it('rechaza question_id no numerico', () => {
    const result = submitEvaluationSchema.safeParse({ answers: [{ question_id: 'x' }] });
    expect(result.success).toBe(false);
  });
});

describe('gradeEvaluationSchema', () => {
  it('acepta calificaciones de preguntas abiertas', () => {
    const result = gradeEvaluationSchema.safeParse({
      grades: [{ question_id: 1, points_awarded: 3 }],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza puntos negativos', () => {
    const result = gradeEvaluationSchema.safeParse({
      grades: [{ question_id: 1, points_awarded: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza lista vacia', () => {
    const result = gradeEvaluationSchema.safeParse({ grades: [] });
    expect(result.success).toBe(false);
  });
});
