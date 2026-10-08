import type { PoolClient } from 'pg';
import { MINUTES_PER_QUESTION } from './phase5-allocation';
import type { GeneratedQuestion } from './phase5-questions';

// -----------------------------------------------------------------------------
// Escritura del cuestionario de la Fase 5 de un puesto (dentro de la
// transaccion del llamador): banco del puesto (APPROVED) + preguntas del
// cuestionario + "todo el banco" con 2 min por pregunta, publicado.
// Las preguntas vigentes previas se DESACTIVAN (nunca se borran): los intentos
// ya presentados conservan sus preguntas como evidencia.
// -----------------------------------------------------------------------------

export type PlacedQuestion = GeneratedQuestion & { documentId: string };

const DEFAULT_INSTRUCTIONS = (minutes: number): string =>
  'Lee cada pregunta y selecciona la o las respuestas correctas, segun el tipo de pregunta.\n' +
  `El examen es individual y deberas obtener un minimo de 80% para aprobar la fase; dispones de ${minutes} minutos para concluirlo y, una vez iniciada la evaluacion, debes terminarla en ese momento.\n` +
  'Si obtienes una calificacion menor, deberas recibir capacitacion complementaria y presentar una reevaluacion.';

export const adaptInstructions = (current: string | null, minutes: number): string =>
  current && /dispones de \d+ minutos/.test(current)
    ? current.replace(/dispones de \d+ minutos/, `dispones de ${minutes} minutos`)
    : current?.trim()
      ? current
      : DEFAULT_INSTRUCTIONS(minutes);

export interface WritePhase5QuizInput {
  templateId: number;
  positionId: number;
  /** Lote del banco al que se ligan las preguntas (ya creado por el llamador). */
  batchId: number;
  questions: PlacedQuestion[];
}

export const writePhase5Quiz = async (client: PoolClient, input: WritePhase5QuizInput): Promise<number> => {
  const template = await client.query(`SELECT instructions FROM public.evaluation_templates WHERE id = $1 FOR UPDATE;`, [
    input.templateId,
  ]);
  await client.query(
    `UPDATE public.evaluation_questions SET is_active = FALSE, updated_at = NOW() WHERE template_id = $1 AND is_active = TRUE;`,
    [input.templateId],
  );
  for (const [index, question] of input.questions.entries()) {
    await client.query(
      `INSERT INTO public.rh_question_bank_items
         (batch_id, position_id, document_id, type, text, points, options, status, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, 1, $6::jsonb, 'APPROVED', NOW());`,
      [input.batchId, input.positionId, question.documentId, question.type, question.text, JSON.stringify(question.options)],
    );
    const inserted = await client.query(
      `INSERT INTO public.evaluation_questions (template_id, type, text, points, sort_order, source_document_id)
       VALUES ($1, $2, $3, 1, $4, $5) RETURNING id;`,
      [input.templateId, question.type, question.text, index + 1, question.documentId],
    );
    for (const [optionIndex, option] of question.options.entries()) {
      await client.query(
        `INSERT INTO public.evaluation_question_options (question_id, text, is_correct, sort_order) VALUES ($1, $2, $3, $4);`,
        [inserted.rows[0].id, option.text, option.is_correct, optionIndex + 1],
      );
    }
  }
  const minutes = input.questions.length * MINUTES_PER_QUESTION;
  await client.query(
    `UPDATE public.evaluation_templates
        SET selection_mode = 'all', random_count = NULL, attempt_time_limit_minutes = $2,
            instructions = $3, status = 'published', updated_at = NOW()
      WHERE id = $1;`,
    [input.templateId, minutes, adaptInstructions(template.rows[0]?.instructions ?? null, minutes)],
  );
  return input.questions.length;
};
