import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import pool from '../config/db';
import { getAnthropicConfig } from '../config/env';
import type { EvaluationQuestionType } from '../types';
import { resolveStoredDocumentPath } from './document.service';

/**
 * Banco de preguntas generado por IA para las evaluaciones de Induccion
 * (RH). Genera preguntas candidatas con la API de Claude a partir del texto
 * de los documentos obligatorios de una fase, y las deja en
 * rh_question_bank_items como PENDING_REVIEW. Nunca escribe en
 * evaluation_questions: RH aprueba/edita desde el frontend y ahi se copian al
 * arreglo real de la plantilla, que se persiste con el endpoint ya existente
 * PUT /rh/trainings/templates/:templateId/questions.
 */

const MAX_CHARS_PER_DOCUMENT = 12_000;
// Tope de salida holgado: con varios documentos y decenas de preguntas, 8k se
// quedaba corto y el JSON llegaba truncado (parse error). claude-sonnet-5
// soporta salidas mucho mayores; solo se paga lo realmente generado.
const MAX_OUTPUT_TOKENS = 32_000;

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

// --- Extraccion de texto -----------------------------------------------------

const extractPdfText = async (filePath: string): Promise<string> => {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text || '').trim();
  } finally {
    await parser.destroy();
  }
};

interface PhaseDocumentSource {
  document_id: string;
  title: string;
  text: string;
}

/** Extrae el texto de los documentos indicados, validando que pertenezcan a la fase. */
const loadPhaseDocumentTexts = async (
  phaseId: number,
  documentIds: string[],
): Promise<PhaseDocumentSource[]> => {
  const result = await pool.query(
    `SELECT pd.document_id, d.title, d.file_path
       FROM public.rh_induction_phase_documents pd
       INNER JOIN public.documents d ON d.id = pd.document_id
      WHERE pd.phase_id = $1 AND pd.document_id = ANY($2::uuid[]);`,
    [phaseId, documentIds],
  );

  if (result.rows.length === 0) {
    throwCoded(
      'QUESTION_BANK_DOCUMENTS_NOT_FOUND',
      'Los documentos seleccionados no pertenecen a los documentos obligatorios de esta fase.',
    );
  }

  const sources: PhaseDocumentSource[] = [];
  for (const row of result.rows) {
    const documentId = String(row.document_id);
    const title = String(row.title);
    let filePath: string;
    try {
      filePath = resolveStoredDocumentPath(String(row.file_path));
    } catch {
      throwCoded('QUESTION_BANK_FILE_MISSING', `No se encontro el archivo del documento "${title}".`);
    }
    const rawText = await extractPdfText(filePath!);
    if (rawText.length < 200) {
      throwCoded(
        'QUESTION_BANK_TEXT_EMPTY',
        `El documento "${title}" no tiene texto extraible (posiblemente es un escaneo sin capa de texto). ` +
          'No se pueden generar preguntas de el.',
      );
    }
    sources.push({ document_id: documentId, title, text: rawText.slice(0, MAX_CHARS_PER_DOCUMENT) });
  }
  return sources;
};

// --- Prompt y validacion de la respuesta del modelo -------------------------

export interface QuestionCounts {
  single: number;
  multiple: number;
  boolean: number;
  open: number;
}

const buildPrompt = (documents: PhaseDocumentSource[], counts: QuestionCounts): string => {
  const documentsBlock = documents
    .map((doc) => `### ${doc.title}\n${doc.text}`)
    .join('\n\n');
  const titles = documents.map((doc) => `"${doc.title}"`).join(', ');

  return `Eres un experto en diseno de evaluaciones de induccion para personal de un laboratorio clinico certificado bajo ISO 15189:2022 (Unilabor).

A partir UNICAMENTE del contenido de los documentos institucionales que se listan abajo, genera exactamente:
- ${counts.boolean} preguntas de Verdadero/Falso
- ${counts.multiple} preguntas de opcion multiple (2 o mas respuestas correctas, minimo 3 opciones)
- ${counts.single} preguntas de opcion unica (1 sola respuesta correcta)
- ${counts.open} preguntas abiertas (las califica RH manualmente, sin opciones)

Reglas estrictas:
- Evalua comprension real del contenido, no trivialidades ni citas textuales literales.
- No inventes informacion que no este en los documentos.
- Preguntas de opcion unica y verdadero/falso: EXACTAMENTE una opcion con "is_correct": true.
- Preguntas de opcion multiple: AL MENOS una opcion con "is_correct": true, minimo 3 opciones en total.
- Preguntas verdadero/falso: exactamente 2 opciones, con texto "Verdadero" y "Falso".
- Preguntas abiertas: "options" debe ser un arreglo vacio.
- En cada pregunta incluye "document_title" con el titulo EXACTO (uno de: ${titles}) del documento del que se deriva.
- Responde en espanol.

Responde UNICAMENTE con un objeto JSON valido, sin texto adicional antes ni despues, sin bloques de codigo markdown, con esta forma exacta:
{"questions":[{"type":"single|multiple|boolean|open","text":"...","document_title":"...","options":[{"text":"...","is_correct":true}]}]}

Documentos:

${documentsBlock}`;
};

const aiOptionSchema = z.object({
  text: z.string().trim().min(1),
  is_correct: z.boolean(),
});

const aiQuestionSchema = z.object({
  type: z.enum(['single', 'multiple', 'boolean', 'open']),
  text: z.string().trim().min(1),
  document_title: z.string().trim().optional(),
  options: z.array(aiOptionSchema).default([]),
});

const aiResponseSchema = z.object({
  questions: z.array(aiQuestionSchema),
});

interface GeneratedQuestion {
  type: EvaluationQuestionType;
  text: string;
  document_id: string | null;
  options: { text: string; is_correct: boolean }[];
}

/** Descarta preguntas que no cumplan las reglas de conteo de opciones correctas. */
const isStructurallyValid = (question: z.infer<typeof aiQuestionSchema>): boolean => {
  if (question.type === 'open') {
    return true;
  }
  const correctCount = question.options.filter((option) => option.is_correct).length;
  if (question.options.length < 2) {
    return false;
  }
  if ((question.type === 'single' || question.type === 'boolean') && correctCount !== 1) {
    return false;
  }
  if (question.type === 'multiple' && correctCount < 1) {
    return false;
  }
  return true;
};

const parseAiResponse = (rawText: string, documents: PhaseDocumentSource[]): GeneratedQuestion[] => {
  // El modelo a veces envuelve el JSON en fences o le antepone una frase:
  // recorta al primer '{' y al ultimo '}' antes de parsear.
  const stripped = rawText.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  const cleaned = firstBrace >= 0 && lastBrace > firstBrace ? stripped.slice(firstBrace, lastBrace + 1) : stripped;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    console.error(
      `Banco de preguntas: respuesta no parseable (${rawText.length} chars). Inicio: ${rawText.slice(0, 300)}`,
    );
    throwCoded('QUESTION_BANK_INVALID_RESPONSE', 'El modelo no devolvio un JSON valido. Intenta de nuevo.');
  }

  const parsed = aiResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throwCoded('QUESTION_BANK_INVALID_RESPONSE', 'La respuesta del modelo no tiene el formato esperado.');
  }

  const titleToDocumentId = new Map(documents.map((doc) => [doc.title, doc.document_id]));

  const valid = parsed.data!.questions.filter(isStructurallyValid);
  if (valid.length === 0) {
    throwCoded(
      'QUESTION_BANK_NO_VALID_QUESTIONS',
      'El modelo no genero ninguna pregunta valida. Intenta de nuevo o ajusta las cantidades.',
    );
  }

  return valid.map((question) => ({
    type: question.type,
    text: question.text,
    document_id: (question.document_title && titleToDocumentId.get(question.document_title)) || null,
    options: question.type === 'open' ? [] : question.options,
  }));
};

// --- Generacion ---------------------------------------------------------------

export interface GenerateQuestionBankInput {
  phaseId: number;
  documentIds: string[];
  counts: QuestionCounts;
  requestedByUserId: string | null;
}

export const generateQuestions = async (input: GenerateQuestionBankInput): Promise<{ batchId: number; questionCount: number }> => {
  const anthropicConfig = getAnthropicConfig();
  if (!anthropicConfig) {
    throwCoded(
      'QUESTION_BANK_NOT_CONFIGURED',
      'La generacion con IA no esta configurada (falta ANTHROPIC_API_KEY en el servidor).',
    );
  }

  const phaseResult = await pool.query(`SELECT id FROM public.rh_induction_phases WHERE id = $1 LIMIT 1;`, [
    input.phaseId,
  ]);
  if (phaseResult.rows.length === 0) {
    throwCoded('QUESTION_BANK_PHASE_NOT_FOUND', 'La fase indicada no existe.');
  }

  const documents = await loadPhaseDocumentTexts(input.phaseId, input.documentIds);

  const batchResult = await pool.query(
    `INSERT INTO public.rh_question_bank_batches (phase_id, document_ids, requested_by_user_id, model, status)
     VALUES ($1, $2, $3, $4, 'running') RETURNING id;`,
    [input.phaseId, input.documentIds, input.requestedByUserId, anthropicConfig!.model],
  );
  const batchId = Number(batchResult.rows[0].id);

  try {
    const client = new Anthropic({
      apiKey: anthropicConfig!.apiKey,
      defaultHeaders: anthropicConfig!.workspaceId
        ? { 'anthropic-workspace-id': anthropicConfig!.workspaceId }
        : undefined,
    });
    // Con topes de salida grandes el SDK exige streaming (la peticion podria
    // exceder 10 min); el resultado final es el mismo Message.
    const message = await client.messages
      .stream({
        model: anthropicConfig!.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: buildPrompt(documents, input.counts) }],
      })
      .finalMessage();

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return throwCoded('QUESTION_BANK_INVALID_RESPONSE', 'El modelo no devolvio texto en su respuesta.');
    }
    if (message.stop_reason === 'max_tokens') {
      return throwCoded(
        'QUESTION_BANK_RESPONSE_TRUNCATED',
        'La respuesta del modelo se corto por longitud. Pide menos preguntas o selecciona menos documentos por lote.',
      );
    }

    const questions = parseAiResponse(textBlock.text, documents);

    for (const question of questions) {
      await pool.query(
        `INSERT INTO public.rh_question_bank_items
           (batch_id, phase_id, document_id, type, text, points, options, status)
         VALUES ($1, $2, $3, $4, $5, 1, $6::jsonb, 'PENDING_REVIEW');`,
        [batchId, input.phaseId, question.document_id, question.type, question.text, JSON.stringify(question.options)],
      );
    }

    await pool.query(
      `UPDATE public.rh_question_bank_batches SET status = 'completed', question_count = $2 WHERE id = $1;`,
      [batchId, questions.length],
    );

    return { batchId, questionCount: questions.length };
  } catch (error: any) {
    const errorMessage = error?.publicMessage || error?.message || 'Error desconocido al generar preguntas.';
    await pool.query(`UPDATE public.rh_question_bank_batches SET status = 'failed', error_message = $2 WHERE id = $1;`, [
      batchId,
      errorMessage,
    ]);
    throw error;
  }
};

// --- Consulta y curacion -------------------------------------------------------

export interface QuestionBankItemRecord {
  id: number;
  batch_id: number;
  phase_id: number;
  document_id: string | null;
  type: EvaluationQuestionType;
  text: string;
  points: number;
  options: { text: string; is_correct: boolean }[];
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

const mapItemRow = (row: any): QuestionBankItemRecord => ({
  id: Number(row.id),
  batch_id: Number(row.batch_id),
  phase_id: Number(row.phase_id),
  document_id: row.document_id ? String(row.document_id) : null,
  type: String(row.type) as EvaluationQuestionType,
  text: String(row.text),
  points: Number(row.points),
  options: Array.isArray(row.options) ? row.options : [],
  status: String(row.status) as QuestionBankItemRecord['status'],
  created_at: String(row.created_at),
});

export const listQuestionBankItems = async (
  phaseId: number,
  status?: string,
): Promise<QuestionBankItemRecord[]> => {
  const values: unknown[] = [phaseId];
  let statusClause = '';
  if (status) {
    values.push(status);
    statusClause = `AND status = $${values.length}`;
  }
  const result = await pool.query(
    `SELECT id, batch_id, phase_id, document_id, type, text, points, options, status, created_at
       FROM public.rh_question_bank_items
      WHERE phase_id = $1 ${statusClause}
      ORDER BY created_at DESC, id DESC;`,
    values,
  );
  return result.rows.map(mapItemRow);
};

export interface ReviewQuestionBankItemInput {
  status?: 'APPROVED' | 'REJECTED';
  text?: string;
  points?: number;
  options?: { text: string; is_correct: boolean }[];
}

export const reviewQuestionBankItem = async (
  itemId: number,
  patch: ReviewQuestionBankItemInput,
  reviewedByUserId: string | null,
): Promise<QuestionBankItemRecord | null> => {
  const current = await pool.query(`SELECT * FROM public.rh_question_bank_items WHERE id = $1 LIMIT 1;`, [itemId]);
  if (current.rows.length === 0) {
    return null;
  }
  const existing = current.rows[0];

  const nextStatus = patch.status ?? String(existing.status);
  const nextText = patch.text !== undefined ? patch.text.trim() : String(existing.text);
  const nextPoints = patch.points !== undefined ? patch.points : Number(existing.points);
  const nextOptions = patch.options !== undefined ? patch.options : existing.options;
  const isReviewTransition = patch.status !== undefined;

  await pool.query(
    `UPDATE public.rh_question_bank_items
        SET status = $1, text = $2, points = $3, options = $4::jsonb,
            reviewed_by_user_id = CASE WHEN $5 THEN $6 ELSE reviewed_by_user_id END,
            reviewed_at = CASE WHEN $5 THEN NOW() ELSE reviewed_at END,
            updated_at = NOW()
      WHERE id = $7;`,
    [nextStatus, nextText, nextPoints, JSON.stringify(nextOptions), isReviewTransition, reviewedByUserId, itemId],
  );

  const refreshed = await pool.query(
    `SELECT id, batch_id, phase_id, document_id, type, text, points, options, status, created_at
       FROM public.rh_question_bank_items WHERE id = $1 LIMIT 1;`,
    [itemId],
  );
  return refreshed.rows.length > 0 ? mapItemRow(refreshed.rows[0]) : null;
};

export const deleteQuestionBankItem = async (itemId: number): Promise<boolean> => {
  const result = await pool.query(`DELETE FROM public.rh_question_bank_items WHERE id = $1;`, [itemId]);
  return (result.rowCount ?? 0) > 0;
};

export interface QuestionBankBatchRecord {
  id: number;
  phase_id: number;
  document_ids: string[];
  requested_by_user_id: string | null;
  model: string;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  question_count: number;
  created_at: string;
}

export const listQuestionBankBatches = async (phaseId: number): Promise<QuestionBankBatchRecord[]> => {
  const result = await pool.query(
    `SELECT id, phase_id, document_ids, requested_by_user_id, model, status, error_message, question_count, created_at
       FROM public.rh_question_bank_batches
      WHERE phase_id = $1
      ORDER BY created_at DESC, id DESC;`,
    [phaseId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    phase_id: Number(row.phase_id),
    document_ids: Array.isArray(row.document_ids) ? row.document_ids.map(String) : [],
    requested_by_user_id: row.requested_by_user_id ? String(row.requested_by_user_id) : null,
    model: String(row.model),
    status: String(row.status) as QuestionBankBatchRecord['status'],
    error_message: row.error_message ? String(row.error_message) : null,
    question_count: Number(row.question_count),
    created_at: String(row.created_at),
  }));
};
